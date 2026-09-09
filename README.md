# Clinical Sign

**Accessible sign-language communication concept for clinical encounters.**

Clinical Sign is a Unmute1AI product track focused on making patient-provider communication more accessible through ASL, text, speech, and visual interaction.

> **Status: product incubator.** This repository currently contains product documentation only. It is not a medical device, certified interpreter, diagnostic system, or production health-system integration.

## Intended boundary

Clinical Sign may help normalize communication intent, but communication intent must not automatically become authority to:
- change an EHR,
- prescribe or alter treatment,
- submit insurance information,
- issue clinical orders,
- transmit sensitive data to an unapproved service.

Those actions require separate authenticated systems and explicit authorization.

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
