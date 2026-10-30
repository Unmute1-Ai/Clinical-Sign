import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEncounter,
  guardIntent,
  createDemoRecognizer,
  PROHIBITED_INTENTS,
  CHANNELS,
} from '../support.js';

test('confidence at or above the threshold commits straight to the transcript', () => {
  const enc = createEncounter({});
  const r = enc.submit({ channel: 'asl', content: 'schedule follow-up', confidence: 0.7 });
  assert.equal(r.status, 'committed');
  assert.equal(enc.transcript.length, 1);
  assert.equal(enc.reviewQueue.length, 0);
  assert.equal(enc.transcript[0].status, 'committed');
  assert.equal(enc.transcript[0].confidence, 0.7);
});

test('low-confidence submissions queue for human review, never the transcript', () => {
  const enc = createEncounter({});
  const r = enc.submit({ channel: 'asl', content: 'schedule follow-up', confidence: 0.42 });
  assert.equal(r.status, 'needs-review');
  assert.equal(enc.transcript.length, 0);
  assert.equal(enc.reviewQueue.length, 1);
  assert.equal(enc.reviewQueue[0].status, 'needs-review');
});

test('confirm moves a review entry into the transcript as human-confirmed', () => {
  const enc = createEncounter({});
  const { id } = enc.submit({ channel: 'speech', content: 'Where is the pharmacy?', confidence: 0.3 });
  const entry = enc.confirm(id);
  assert.equal(entry.status, 'committed');
  assert.equal(entry.confidence, 1);
  assert.equal(enc.reviewQueue.length, 0);
  assert.equal(enc.transcript.length, 1);
  assert.equal(enc.transcript[0].id, id);
});

test('confirm applies an optional human edit', () => {
  const enc = createEncounter({});
  const { id } = enc.submit({ channel: 'asl', content: 'shedule follow-up', confidence: 0.55 });
  const entry = enc.confirm(id, 'schedule follow-up');
  assert.equal(entry.content, 'schedule follow-up');
  assert.equal(enc.transcript[0].content, 'schedule follow-up');
});

test('discard removes the entry without touching the transcript', () => {
  const enc = createEncounter({});
  const { id } = enc.submit({ channel: 'text', content: 'never mind', confidence: 0.1 });
  enc.discard(id);
  assert.equal(enc.reviewQueue.length, 0);
  assert.equal(enc.transcript.length, 0);
});

test('confirm and discard of unknown ids throw', () => {
  const enc = createEncounter({});
  assert.throws(() => enc.confirm('nope'), /no review entry/);
  assert.throws(() => enc.discard('nope'), /no review entry/);
});

test('unknown channel is rejected with a TypeError', () => {
  const enc = createEncounter({});
  for (const bad of ['vibes', '', 'ASL', undefined]) {
    assert.throws(
      () => enc.submit({ channel: bad, content: 'hello', confidence: 0.9 }),
      (err) => err instanceof TypeError && /unknown channel/.test(err.message)
    );
  }
  for (const good of CHANNELS) {
    assert.doesNotThrow(() =>
      enc.submit({ channel: good, content: 'hello', confidence: 1 })
    );
  }
});

test('confidence outside [0, 1] and non-numeric confidence are rejected', () => {
  const enc = createEncounter({});
  for (const bad of [-0.01, 1.01, NaN, '0.9', undefined]) {
    assert.throws(
      () => enc.submit({ channel: 'text', content: 'hello', confidence: bad }),
      (err) => err instanceof RangeError && /confidence/.test(err.message)
    );
  }
});

test('empty or non-string content is rejected', () => {
  const enc = createEncounter({});
  for (const bad of ['', '   ', 42, undefined]) {
    assert.throws(
      () => enc.submit({ channel: 'text', content: bad, confidence: 0.9 }),
      /content/
    );
  }
});

test('confidenceThreshold must be within (0, 1]', () => {
  for (const bad of [0, -0.5, 1.0001, 100, NaN]) {
    assert.throws(
      () => createEncounter({ confidenceThreshold: bad }),
      (err) => err instanceof RangeError && /confidenceThreshold/.test(err.message)
    );
  }
  assert.doesNotThrow(() => createEncounter({ confidenceThreshold: 1 }));
});

test('transcript and reviewQueue getters expose copies, not internals', () => {
  const enc = createEncounter({});
  enc.submit({ channel: 'asl', content: 'hello', confidence: 0.9 });
  enc.transcript.push({ id: 'fake' });
  enc.reviewQueue.push({ id: 'fake' });
  assert.equal(enc.transcript.length, 1);
  assert.equal(enc.reviewQueue.length, 0);
});

test('boundary guard rejects every prohibited intent category, allows neutral ones', () => {
  for (const intent of PROHIBITED_INTENTS) {
    assert.throws(() => guardIntent(intent), /Boundary violation/);
  }
  assert.doesNotThrow(() => guardIntent('message.send'));
  assert.equal(guardIntent('message.send'), true);
});

test('demo recognizer cycles the whole script deterministically and wraps', () => {
  const rec = createDemoRecognizer();
  const script = rec.script;
  assert.ok(script.length >= 4, 'script should carry enough utterances to demo');
  const seen = [];
  for (let i = 0; i < script.length; i += 1) seen.push(rec.next());
  assert.deepEqual(seen, script.map((u) => ({ ...u })));
  assert.deepEqual(rec.next(), script[0], 'cycles back to the start after a full pass');
});

test('demo recognizer channels its per-channel captures', () => {
  const rec = createDemoRecognizer();
  for (const channel of ['asl', 'speech']) {
    const perChannel = rec.script.filter((u) => u.channel === channel);
    const first = [];
    for (let i = 0; i < perChannel.length; i += 1) first.push(rec.next({ channel }));
    const second = [];
    for (let i = 0; i < perChannel.length; i += 1) second.push(rec.next({ channel }));
    for (const u of [...first, ...second]) {
      assert.equal(u.channel, channel);
    }
    assert.deepEqual(second, first, 'per-channel cycle wraps to its start');
  }
  assert.equal(rec.next({ channel: 'sign' }), null, 'no scripted sign-capture utterances');
});

test('demo script stays inside the engine contract and shows both sides of the gate', () => {
  const script = createDemoRecognizer().script;
  for (const u of script) {
    assert.ok(CHANNELS.includes(u.channel), `bad channel ${u.channel}`);
    assert.ok(typeof u.content === 'string' && u.content.length > 0);
    assert.ok(u.confidence >= 0 && u.confidence <= 1);
    if (u.intent) assert.ok(PROHIBITED_INTENTS.includes(u.intent));
  }
  assert.ok(script.some((u) => u.confidence >= 0.7), 'at least one would commit');
  assert.ok(script.some((u) => u.confidence < 0.7), 'at least one needs review');
  assert.ok(script.some((u) => u.intent), 'at least one exercises the boundary guard');
});
