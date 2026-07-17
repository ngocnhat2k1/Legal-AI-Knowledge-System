---
type: planning
status: active
updated: 2026-07-17
related:
  - 00-bootstrap.md
  - 01-task-list.md
  - ../index.md
  - ../business-rules.md
---

# Progress Log

**This is the resume point.** An agent picking up this project mid-stream reads this file first,
then follows the links. It answers three questions: where are we, what happens next, and what did
we learn the hard way that is not obvious from the code.

`00-bootstrap.md` is the plan. `01-task-list.md` is the work. **This file is the truth about what
actually happened**, which is usually different.

## Resume Here

| | |
|---|---|
| **Current phase** | Phase 0 — Foundation |
| **Next task** | [TASK-001 — Build the golden set](01-task-list.md) |
| **Blocked on** | TASK-001 needs the **owner**, not an agent (see below) |
| **Code written** | None yet. This is deliberate — see [Bootstrap Plan](00-bootstrap.md). |
| **Last session** | 2026-07-17 (see log below) |

### ⚠️ The next task cannot be done by an agent

**TASK-001 is the golden set: 30–50 questions from the owner's own declarations, with answers the
owner already knows to be correct.** No agent can write it. No agent should fabricate it.

Nothing downstream is trustworthy without it, because the failure mode of this product is silent:
a wrong HS code is a real, correctly-formatted code, and a wrong tariff rate looks exactly like a
right one. There is no exception, no parse error, no red flag. The golden set is the only
instrument that can detect being wrong. See [Evaluation](../docs/evaluation.md).

If the owner has not produced it yet, **ask for it — do not start TASK-006 to feel productive.**
Building the skeleton before the measuring instrument is how this project fails while reporting
success.

## Task Status

Mirrors [01-task-list.md](01-task-list.md), which holds the detail and acceptance criteria.
**Update both, in the same commit, or they drift and this table becomes a lie.**

| Task | Status | Note |
|---|---|---|
| TASK-001 — Golden set | ⛔ blocked (owner) | Must come before any retrieval code |
| TASK-002 — Resolve customs.gov.vn API conflict | 🔲 todo | Research 10 and 12 contradict; unresolved |
| TASK-003 — Prove table-aware DOCX parsing | 🔲 todo | Research 12 left this gap open explicitly |
| TASK-004 — Check vbpl provisionTree populated | 🔲 todo | Highest-value open question for the RAG phase |
| TASK-005 — Write .agent knowledge notes | ✅ done 2026-07-17 | Audited; see Session Log |
| TASK-006 — Repository skeleton | 🔲 todo | |
| TASK-007 — Tariff schema (temporal + annex-aware) | 🔲 todo | Annex-aware from the **first** migration, not retrofitted |
| TASK-008 — Công báo ingestion (annex-aware parser) | 🔲 todo | Depends on TASK-003 |
| TASK-009 — Establish 2026 MFN amendment chain | 🔲 todo | Do **not** merge research 10 + 12 and assume the union |
| TASK-010 — Staleness detection | 🔲 todo | |
| TASK-011 — The lookup API | 🔲 todo | |
| TASK-012 — Phase 1 acceptance | 🔲 todo | Gate: numbers match ECUS on a real shipment |

Legend: ✅ done · 🟡 in progress · 🔲 todo · ⛔ blocked · ❌ abandoned (say why)

## Decisions Already Made — Do Not Re-Litigate

These are settled and recorded as ADRs. If you are about to reopen one, you probably lack context
that is written down. Read the ADR first; reopen only with new evidence, and supersede it properly.

- Tariff numbers never come from an LLM — [ADR](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)
- HS output is top-3 + verbatim evidence, never a bare code — [ADR](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- Postgres alone for v1 — [ADR](../architecture-decisions/2026-07-17-postgres-only-for-v1.md)
- Web app, not Zalo — [ADR](../architecture-decisions/2026-07-17-web-app-not-zalo.md)
- Customs first, legal RAG later — [ADR](../architecture-decisions/2026-07-17-customs-first-law-later.md)
- Published VBHN as the text layer; do not compute consolidation — [ADR](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)
- Validity and HS version are first-class from day one — [ADR](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)

## Open Questions Still Unanswered

Carried from research. **Each is a real unknown, not a formality.** Answer them in Phase 0 —
several change the design.

1. **Is the customs.gov.vn tariff API reachable and captcha-free?** Research 10 says yes (curl-verified
   via `/bridge`); research 12 found a captcha-gated raw-IP backend it could not reach. Probably
   different endpoints. **Unresolved.** → TASK-002
2. **Does a table-aware DOCX parser recover the EVFTA six-rate columns?** Research 12 inferred it
   would but could not prove it (no LibreOffice/python-docx available). This gap must close before
   any tariff data is trusted. → TASK-003
3. **Are vbpl `provisionTree` / `referenceProvisions` ever populated?** `null` on both samples. If
   populated, it is a provision-level legal graph and it changes the whole RAG design. → TASK-004
4. **What is the real 2026 MFN amendment chain?** Research 10 and 12 give different, individually
   non-exhaustive lists. Establish it from Công báo. → TASK-009

## Session Log

Append a new entry at the **top** of this section at the end of every working session. Keep entries
short. Record what changed, what was learned, and what the next agent would otherwise rediscover the
hard way. **Surprises and dead ends are the most valuable thing here** — a plan tells you what was
intended, only this tells you what the territory actually did.

---

### 2026-07-17 — Research, knowledge base, and a scope pivot

**Done**
- Ran 12 research agents against live sources, including 3 adversarial verification passes.
- Pivoted the product: the original roadmap described RAG over statute prose; the owner's actual work
  is customs declaration, which is table lookup. Customs first, law later.
- Wrote the knowledge base (27 notes, ~5,800 lines) and 7 ADRs. TASK-005 done.
- Repo initialised, pushed to `ngocnhat2k1/Legal-AI-Knowledge-System` (private).

**Learned — the things that would otherwise cost weeks**
- **The convenient sources are blocked and the authoritative one is wide open.** thuvienphapluat names
  ClaudeBot in robots.txt with `ai-train=no`; luatvietnam silently resolves to the *wrong document*.
  Công báo is `Allow: /`, needs no JS, and serves real DOCX. This inverts the obvious prior.
- **The "obvious" PDF source is a 200-DPI fax scan with zero `/Font` objects.** Do not parse
  chinhphu.vn PDFs. Go to Công báo.
- **The annex trap.** 1,520 HS codes appear in both Phụ lục I (export) and II (import); 1,329 have
  different rates. Research 12's naive parser hit **94% apparent success while returning export duty
  for import queries.** This is the shape of every failure in this project: not missing data, but
  plausible wrong data that reports success.
- **This is a legal-currency problem, not a crawling problem.** NĐ 72/2026 was signed and legally
  effective the same day, gazetted 15 days later, and expired 52 days after that with rates silently
  reverting. No crawl schedule closes that window. The system must cite its snapshot date and refuse
  when stale — a research aid, never an answer engine.
- **The knowledge base itself hallucinated on the first pass.** An adversarial audit caught the
  writing agents grafting a real URL onto an unsourced claim, inventing "sourced from Vietnamese
  trade press", and bolding a six-decree union that appears in no research report. All fixed.
  **Fluent prose hides missing provenance.** Re-audit whenever this KB is materially extended.

**Structural incident (fixed same day)**
- `.agent/` was moved into `templates/.agent/`. This silently broke two things: the root `CLAUDE.md`
  bridge pointed at a `.agent/AGENTS.md` that no longer existed (orphaning the entire knowledge base
  from every agent), and the APB template was overwritten with customs domain content (so
  `create-apb` would have generated a customs assistant for every future project). Restored: `.agent/`
  back to root, `templates/.agent/` re-pulled clean from `github.com/truongthuc/apb`.
- **Lesson:** `.agent/` must stay at the repository root. The root bridge files hardcode that path.

**Next**
- TASK-001, the golden set. Owner-only. Everything waits on it.

---

## How To Update This File

At the end of a session, before the final commit:

1. Update **Resume Here** — phase, next task, blockers.
2. Update the **Task Status** table, and `01-task-list.md` in the same commit.
3. Add a **Session Log** entry at the top of the log. Include what surprised you.
4. If a decision was made, write an ADR — do not bury it here.
5. If a durable fact was learned, put it in the right `concepts/` note — do not bury it here.

This file is a pointer and a diary, **not** a knowledge store. Anything that outlives the session
belongs in `concepts/`, `business-rules.md`, or an ADR. When in doubt, follow the routing rules in
[AGENTS.md](../AGENTS.md).

## Related Knowledge

- [Bootstrap Plan](00-bootstrap.md) — the phased roadmap
- [Task List](01-task-list.md) — task detail and acceptance criteria
- [Evaluation](../docs/evaluation.md) — the golden set and the ship gates
- [Business Rules](../business-rules.md) — the safety spine
- [Agent Memory Index](../index.md)
