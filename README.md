# Clinical Sign

[Portfolio](https://github.com/Unmute1-Ai/Unmute1ai#readme) · [Engineering](https://github.com/Unmute1-Ai/U1Ai#readme) · [Security evidence](https://github.com/Unmute1-Ai/glass-box#readme)

**Accessible sign-language communication concept for clinical encounters.**

Clinical Sign is a Unmute1AI product track focused on making patient-provider communication more accessible through ASL, text, speech, and visual interaction.

> **Status: product incubator.** This repository contains product documentation and a local-first demo client (see [Run](#run)). It is not a medical device, certified interpreter, diagnostic system, or production health-system integration.

## Intended boundary

Clinical Sign may help normalize communication intent, but communication intent must not automatically become authority to:
- change an EHR,
- prescribe or alter treatment,
- submit insurance information,
- issue clinical orders,
- transmit sensitive data to an unapproved service.

Those actions require separate authenticated systems and explicit authorization.

## Run

The client is local-first and dependency-free: plain HTML/CSS/ES modules, no build step, no runtime network calls. State lives in the tab for the session and nowhere else.

1. Serve the repository root with any static server:
   ```sh
   python3 -m http.server 8000
   ```
2. Open <http://localhost:8000/> in a browser.

Recognition in the client is simulated and visibly labeled — "Simulated demo recognition — not a live ASL/speech model." No live ASL/speech understanding is claimed anywhere.

### Tests

Node 20 or later; zero dev dependencies:

```sh
node --test test/encounter.test.js test/invariants.test.js
```

The suites cover the confidence gate, the human review transitions, the boundary guard, and two static invariants: the three app files load no cross-origin resources, and every UI action stays inside the communication-only allowlist. CI runs them on Node 20 and 22.

## Production path

1. Add a runnable local-first client.
2. Add signed model/component provenance.
3. Add low-confidence human-review states.
4. Add accessibility testing and benchmark evidence.
5. Add privacy/data-flow documentation.
6. Keep health-system writes outside the reference build.

See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

---

**Unmute1AI**  
Making every signal accessible to all.
