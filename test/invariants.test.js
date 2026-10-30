import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8');

const APP_FILES = ['index.html', 'ds/styles.css', 'support.js'];

// Only resource-loading attributes and CSS url() references count;
// xmlns* is a namespace name, not a load, and is naturally excluded.
const ATTR_RE = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

function resourceRefs(text) {
  const refs = [];
  for (const m of text.matchAll(ATTR_RE)) refs.push(m[1]);
  for (const m of text.matchAll(CSS_URL_RE)) refs.push(m[2].trim());
  return refs;
}

function isCrossOrigin(ref) {
  if (ref.startsWith('//')) return true;
  return /^(?:https?|wss?|ftp):/i.test(ref);
}

test('local-first: no cross-origin resource loads in the three app files', () => {
  for (const file of APP_FILES) {
    for (const ref of resourceRefs(read(file))) {
      assert.ok(!isCrossOrigin(ref), `${file} loads cross-origin resource: ${ref}`);
    }
  }
});

test('local-first: support.js references no network APIs and stays synchronous', () => {
  const source = read('support.js');
  for (const api of ['crossOrigin', 'sendBeacon', 'EventSource', 'importScripts']) {
    assert.ok(!source.includes(api), `support.js references ${api}`);
  }
  assert.ok(!/\bWebSocket\b/.test(source), 'support.js references WebSocket');
  assert.ok(!/\bXMLHttpRequest\b/.test(source), 'support.js references XMLHttpRequest');
  assert.ok(!/\bwindow\.open\b/.test(source), 'support.js references window.open');
  assert.ok(!/\bawait\b/.test(source), 'support.js should stay synchronous (no IO)');
});

test('boundary UI: every data-action is inside the communication-only allowlist', () => {
  const ALLOWED = new Set(['send', 'confirm', 'discard', 'switch-channel', 'start-demo']);
  const html = read('index.html');
  const actions = [...html.matchAll(/data-action\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  assert.ok(actions.length > 0, 'expected data-action controls in index.html');
  for (const action of actions) {
    assert.ok(ALLOWED.has(action), `unexpected data-action "${action}"`);
  }
});

test('boundary UI: the scope banner is present and live-announced', () => {
  const html = read('index.html');
  assert.match(
    html,
    /Communication only — this demo cannot change health records, treatment, insurance, or orders/
  );
  const bannerTag = html.match(/<[a-z]+[^>]*scope-banner[^>]*>/i);
  assert.ok(bannerTag, 'scope banner element missing');
  assert.match(bannerTag[0], /aria-live/i);
});
