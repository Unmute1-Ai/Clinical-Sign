// Clinical Sign — encounter engine and DOM wiring.
//
// Zero-dependency ES module. The engine half is pure and importable headless
// (`node --test`); the DOM wiring half runs only inside a browser document.
//
// The one rule that shapes the flow: nothing enters the transcript without
// either at-threshold confidence or an explicit human confirmation.

export const CHANNELS = ['asl', 'text', 'speech', 'sign'];

// README "Intended boundary": communication only — never these.
export const PROHIBITED_INTENTS = [
  'ehr.write',
  'prescription',
  'insurance.submit',
  'clinical.order',
  'phi.transmit',
];

export function guardIntent(intent) {
  if (PROHIBITED_INTENTS.includes(intent)) {
    throw new Error(
      `Boundary violation: "${intent}" is outside Clinical Sign's communication-only scope (README "Intended boundary")`
    );
  }
  return true;
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Headless fallback — uniqueness is what matters, not cryptography.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEncounter({ confidenceThreshold = 0.7 } = {}) {
  if (!(confidenceThreshold > 0 && confidenceThreshold <= 1)) {
    throw new RangeError('confidenceThreshold must be in (0, 1]');
  }
  const transcript = [];
  const reviewQueue = [];

  return {
    confidenceThreshold,

    get transcript() {
      return [...transcript];
    },

    get reviewQueue() {
      return [...reviewQueue];
    },

    submit({ channel, content, confidence, id = makeId() }) {
      if (!CHANNELS.includes(channel)) {
        throw new TypeError(`unknown channel: ${channel}`);
      }
      if (typeof content !== 'string' || content.trim() === '') {
        throw new TypeError('content must be a non-empty string');
      }
      if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) {
        throw new RangeError('confidence must be within [0, 1]');
      }
      const entry = { id, channel, content, confidence, status: '' };
      if (confidence >= confidenceThreshold) {
        entry.status = 'committed';
        transcript.push(entry);
        return { status: 'committed', id };
      }
      entry.status = 'needs-review';
      reviewQueue.push(entry);
      return { status: 'needs-review', id };
    },

    confirm(id, edit) {
      const i = reviewQueue.findIndex((e) => e.id === id);
      if (i === -1) throw new Error(`no review entry ${id}`);
      const [entry] = reviewQueue.splice(i, 1);
      if (edit) entry.content = edit;
      entry.status = 'committed';
      entry.confidence = 1; // human-confirmed
      transcript.push(entry);
      return { ...entry };
    },

    discard(id) {
      const i = reviewQueue.findIndex((e) => e.id === id);
      if (i === -1) throw new Error(`no review entry ${id}`);
      reviewQueue.splice(i, 1);
    },
  };
}

// Scripted demo utterances with fixed confidences, so the demo deterministically
// shows both sides of the gate. An `intent` field exercises the boundary guard
// visibly: guardIntent() rejects it before anything reaches the engine.
const DEMO_SCRIPT = [
  { channel: 'asl', content: 'I need to reschedule my appointment.', confidence: 0.62 },
  { channel: 'speech', content: 'Where is the pharmacy?', confidence: 0.88 },
  { channel: 'asl', content: 'Please schedule a follow-up visit for Tuesday.', confidence: 0.93 },
  {
    channel: 'speech',
    content: 'Submit this visit to my insurance.',
    confidence: 0.81,
    intent: 'insurance.submit',
  },
  { channel: 'asl', content: 'Can the doctor call in a prescription?', confidence: 0.34 },
  { channel: 'speech', content: 'Thank you for seeing me today.', confidence: 0.76 },
];

export function createDemoRecognizer() {
  let cursor = 0;
  const channelCursors = new Map();

  return {
    get script() {
      return DEMO_SCRIPT.map((u) => ({ ...u }));
    },

    // No argument: cycle every scripted utterance in order (the demo loop).
    // With { channel }: cycle only that channel's utterances (manual capture).
    next({ channel } = {}) {
      if (channel === undefined) {
        const utterance = DEMO_SCRIPT[cursor];
        cursor = (cursor + 1) % DEMO_SCRIPT.length;
        return { ...utterance };
      }
      const items = DEMO_SCRIPT.filter((u) => u.channel === channel);
      if (items.length === 0) return null;
      const at = channelCursors.get(channel) ?? 0;
      channelCursors.set(channel, (at + 1) % items.length);
      return { ...items[at] };
    },
  };
}

// ---------------------------------------------------------------------------
// DOM wiring — browser only, so `node --test` imports the engine headless.
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  const encounter = createEncounter({});
  const recognizer = createDemoRecognizer();

  const els = {
    status: document.getElementById('demo-status'),
    transcript: document.getElementById('transcript'),
    transcriptEmpty: document.getElementById('transcript-empty'),
    review: document.getElementById('review-queue'),
    reviewEmpty: document.getElementById('review-empty'),
    signDisplay: document.getElementById('sign-display'),
    textInput: document.getElementById('text-input'),
    demoToggle: document.getElementById('demo-toggle'),
    channelButtons: [...document.querySelectorAll('[data-action="switch-channel"]')],
  };

  const CHANNEL_LABELS = { asl: 'ASL', text: 'Text', speech: 'Speech', sign: 'Sign' };
  const DEMO_TAG = 'Simulated demo recognition — not a live ASL/speech model.';

  function setStatus(message, tone = 'info') {
    els.status.textContent = message;
    els.status.dataset.tone = tone;
  }

  function switchChannel(channel) {
    for (const button of els.channelButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.channel === channel));
    }
    for (const panel of document.querySelectorAll('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== channel;
    }
  }

  function renderTranscript() {
    const items = encounter.transcript;
    els.transcript.textContent = '';
    els.transcriptEmpty.hidden = items.length > 0;
    for (const entry of items) {
      const li = document.createElement('li');
      li.className = 'entry';

      const tag = document.createElement('span');
      tag.className = `channel-tag channel-${entry.channel}`;
      tag.textContent = CHANNEL_LABELS[entry.channel];

      const text = document.createElement('span');
      text.className = 'content';
      text.textContent = entry.content;

      const conf = document.createElement('span');
      conf.className = 'confidence';
      conf.textContent =
        entry.confidence === 1 ? 'human-confirmed' : `confidence ${entry.confidence.toFixed(2)}`;

      li.append(tag, text, conf);
      els.transcript.append(li);
    }
  }

  function renderReview() {
    const items = encounter.reviewQueue;
    els.review.textContent = '';
    els.reviewEmpty.hidden = items.length > 0;
    for (const entry of items) {
      const li = document.createElement('li');
      li.className = 'review-item';
      li.dataset.id = entry.id;

      const text = document.createElement('p');
      text.className = 'content';
      text.textContent = entry.content;

      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent =
        `${CHANNEL_LABELS[entry.channel]} · confidence ${entry.confidence.toFixed(2)} — below the ` +
        `${encounter.confidenceThreshold.toFixed(2)} gate, so it is not in the transcript.`;

      const label = document.createElement('label');
      label.className = 'review-edit-label';
      label.append('Confirm as (edit if needed) ');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'review-edit';
      input.value = entry.content;
      label.append(input);

      const actions = document.createElement('div');
      actions.className = 'review-actions';
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.dataset.action = 'confirm';
      confirmBtn.dataset.id = entry.id;
      confirmBtn.textContent = 'Confirm';
      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.dataset.action = 'discard';
      discardBtn.dataset.id = entry.id;
      discardBtn.textContent = 'Discard';
      actions.append(confirmBtn, discardBtn);

      li.append(text, meta, label, actions);
      els.review.append(li);
    }
  }

  function renderSignDisplay() {
    const items = encounter.transcript;
    const last = items[items.length - 1];
    els.signDisplay.textContent = last ? last.content : 'Nothing committed yet.';
  }

  function renderAll() {
    renderTranscript();
    renderReview();
    renderSignDisplay();
  }

  function runUtterance(utterance, { humanTyped = false } = {}) {
    // Boundary first: a prohibited intent never reaches the engine at all.
    try {
      if (utterance.intent) guardIntent(utterance.intent);
    } catch (err) {
      setStatus(`Blocked: ${err.message}`, 'blocked');
      return;
    }
    const result = encounter.submit(utterance);
    renderAll();
    if (humanTyped) {
      setStatus('Committed your text to the transcript.', 'ok');
    } else if (result.status === 'committed') {
      setStatus(`Committed to transcript (confidence ${utterance.confidence.toFixed(2)}).`, 'ok');
    } else {
      setStatus('Low confidence — placed in Needs review for a human decision.', 'warn');
    }
  }

  function simulateRecognition(channel, utterance) {
    setStatus(`Recognizing ${CHANNEL_LABELS[channel]} input… ${DEMO_TAG}`, 'working');
    window.setTimeout(() => runUtterance(utterance), 600);
  }

  function handleSend(channel) {
    if (channel === 'text') {
      const content = els.textInput.value.trim();
      if (!content) {
        setStatus('Type a message first.', 'info');
        return;
      }
      // Human-typed text has no recognition uncertainty.
      runUtterance({ channel, content, confidence: 1 }, { humanTyped: true });
      els.textInput.value = '';
      return;
    }
    if (channel === 'asl' || channel === 'speech') {
      const utterance = recognizer.next({ channel });
      if (utterance) simulateRecognition(channel, utterance);
    }
  }

  function confirmReview(id) {
    const item = [...els.review.children].find((li) => li.dataset.id === id);
    const raw = item?.querySelector('.review-edit')?.value ?? '';
    const edit = raw.trim() === '' ? undefined : raw.trim();
    encounter.confirm(id, edit);
    renderAll();
    setStatus('Confirmed by human — moved to the transcript.', 'ok');
  }

  function discardReview(id) {
    encounter.discard(id);
    renderAll();
    setStatus('Discarded — removed from review.', 'info');
  }

  let demoTimer = null;

  function stepDemo() {
    const utterance = recognizer.next();
    if (!utterance) return;
    simulateRecognition(utterance.channel, utterance);
    demoTimer = window.setTimeout(stepDemo, 3000);
  }

  function toggleDemo() {
    if (demoTimer) {
      window.clearTimeout(demoTimer);
      demoTimer = null;
      els.demoToggle.setAttribute('aria-pressed', 'false');
      els.demoToggle.textContent = 'Start demo';
      setStatus('Demo stopped.', 'info');
      return;
    }
    els.demoToggle.setAttribute('aria-pressed', 'true');
    els.demoToggle.textContent = 'Stop demo';
    stepDemo();
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'switch-channel') switchChannel(target.dataset.channel);
    else if (action === 'send') handleSend(target.dataset.channel);
    else if (action === 'confirm') confirmReview(target.dataset.id);
    else if (action === 'discard') discardReview(target.dataset.id);
    else if (action === 'start-demo') toggleDemo();
  });

  renderAll();
  switchChannel('asl');
  setStatus(`Ready. Use a channel, or start the demo. ${DEMO_TAG}`, 'info');
}
