# APB Agent Rules

This file is the shared source of truth for AI agents working in `{{PROJECT_NAME}}`.

## Communication

- Always communicate with the project owner in Vietnamese.
- All project documentation must be written in English.
- All code, comments, identifiers, commit messages, filenames, and API names must be written in English.

## Default Workflow

For every software task, follow this order:

1. Planning
2. Planning Review
3. Freeze Planning
4. Implementation Design
5. Design Review
6. Freeze Design
7. Milestone Implementation
8. Code Review
9. Fix Feedback
10. Update Documentation
11. Update Agent Knowledge
12. Commit only when requested

Never start implementation before planning and design are reviewed.

## Project Orientation

Before following links into specialized notes, start from `.agent/index.md` when it exists. The index is the map of durable project memory and should point to the current source-of-truth notes for context, rules, decisions, planning, reviews, and feature or module knowledge.

Before starting a non-trivial task, read `.agent/project-context.md` to understand what the project does, who it serves, its boundaries, core workflows, domain terms, constraints, and open questions.

During first bootstrap only, if `.agent/project-context.md` is missing, empty, or still contains only placeholder content, ask the owner for a one-time project description and use it to populate `.agent/project-context.md`. After `.agent/project-context.md` is populated, do not repeat the initial description step; read the file as the durable project brief and update it only when project context actually changes.

If `.agent/project-context.md` remains incomplete after bootstrap, treat project orientation as incomplete. Ask the owner for the minimum context needed before making product, architecture, or business-logic changes.

For small known-known tasks, only read the project context when the change could affect product behavior, business rules, user-facing workflows, terminology, or architecture.

## Knowledge Coverage And Unknowns

Planning and design reduce misunderstanding but do not remove missing context. For every feature or workflow request, classify project knowledge into these buckets when the task has meaningful ambiguity, risk, or implementation impact:

- Confirmed Requirements: the owner explicitly described the requirement and the agent can trace it to the request or existing documentation.
- Assumptions: the owner may know the requirement, but it was not fully described to the agent. State the assumption clearly and continue only when the assumption is safe and reversible.
- Open Questions: information that is required before implementation can proceed safely. Ask the owner instead of guessing when an Open Question blocks implementation.
- Risk Areas / Unknowns: areas the owner may not have identified yet and the agent cannot fully infer from the request.
- Out of Scope: related behavior intentionally excluded from the current task.
- Validation Plan: how the implementation will prove the confirmed requirements and assumptions.

For known-known work, where the owner clearly states the requested change and the agent understands it, use a lightweight form. Small tasks such as typo fixes, text changes, and simple configuration updates only need assumptions, risks, or validation notes when they actually exist.

Planning Review and Design Review should scale with task complexity. For complex or ambiguous tasks, explicitly ask the owner to validate assumptions and risk areas before freezing planning or design. For small known-known tasks with no meaningful unknowns, the owner's request can serve as sufficient review.

Do not turn the knowledge buckets into a formal checklist. Their value is to expose missing knowledge, not to force headings into every small task.

When a requirement is discovered after implementation begins, record it in the relevant planning note, review history, business rules, or architecture decision before continuing.

## Question Answer Routing

When source documents or owner requests are unclear, ask Open Questions instead of silently guessing. Use the owner's answers to route confirmed knowledge into the correct agent memory location.

Routing rules:

- Product purpose, audience, boundaries, and operating context go to `.agent/project-context.md` and relevant `.agent/planning/*.md` files.
- Durable business behavior, policy, validation rules, permission rules, compliance rules, and accounting rules go to `.agent/business-rules.md`.
- Technical structure, integration choices, storage choices, and major tradeoffs go to separate ADR files in `.agent/architecture-decisions/`.
- Naming patterns, terminology, code naming rules, and API naming rules go to `.agent/naming-conventions.md`.
- Current task scope, assumptions, out-of-scope behavior, acceptance criteria, and validation plans go to `.agent/planning/*.md`.
- API contracts, setup notes, implementation designs, and module documentation go to `.agent/docs/*.md`.
- Review decisions, approvals, rejected assumptions, and resolved concerns go to `.agent/review-history/*.md`.
- Unresolved or low-confidence interpretations go to `.agent/reviews/` or `.agent/previews/` until approved.

If one owner answer contains multiple knowledge types, split it across the appropriate files instead of forcing it into one document. Preserve traceability by noting the source question, answer, or review decision where practical.

## Note-Linked Agent Memory

Use `.agent/` as a plain-Markdown knowledge graph. Maintain readable notes that link related project knowledge together without requiring Obsidian or any editor-specific runtime.

Use `.agent/index.md` as the first navigation surface for durable memory. Update it whenever adding, moving, renaming, or promoting an important note.

Prefer relative Markdown links for required knowledge:

```md
[Project Context](project-context.md)
```

Wiki-style links such as `[[Project Context]]` may be used only as supplemental editor affordances. Do not store required knowledge exclusively in Obsidian-only syntax, canvas files, Dataview queries, embeds, or plugin metadata.

Important notes should be self-contained enough to read outside a graph view. When useful, include simple YAML frontmatter:

```yaml
---
type: feature
status: active
updated: YYYY-MM-DD
related:
  - ../business-rules.md
---
```

Use the smallest note that represents a durable concept, not one note per function. Good note boundaries include project context, business rules, architecture decisions, module boundaries, domain concepts, workflows, API contracts, review outcomes, and reusable implementation patterns.

Each durable note should include a `Related Knowledge` section when cross-links would help future agents trace behavior, constraints, or decisions.

## Code Organization

Use `.agent/docs/code-organization.md` as the source of truth for repository code structure.

If the project already uses a framework, platform, monorepo layout, or established repository convention, follow that convention first and document the mapping in `.agent/docs/code-organization.md`.

For projects without an existing structure, use this recommended baseline:

```text
src/
  app/
  modules/
  shared/
    kernel/
    adapters/
  integrations/
  tests/
    helpers/
```

Feature-specific logic must live inside the framework's feature/module boundary, or inside `src/modules/<module-name>/` when the recommended baseline is used.

Reusable code may be added to the project's shared-code location only when at least two modules need it, or when the project owner explicitly approves it as shared infrastructure.

Do not create generic catch-all helpers or directories such as `utils`, `helpers`, `common`, `misc`, `shared.ts`, or `helpers.ts`.

Before adding a helper, utility, abstraction, shared module, or new module, search the repository for existing equivalent behavior. Reuse or extend existing code when appropriate.

When new shared code is necessary, document why existing code is insufficient in the task plan or review summary, then update `.agent/docs/code-organization.md` if the structure, framework mapping, or reusable pattern changes.

## Project Structure

Use this structure for agent-facing workflow material:

```text
.agent/
  AGENTS.md
  index.md
  artifacts/
  planning/
  docs/
    code-organization.md
  architecture-decisions/
    README.md
  previews/
  review-history/
  reviews/
  business-rules.md
  naming-conventions.md
  project-context.md
```

Root `docs/` is optional. Use it only for documentation intended for humans outside the agent workflow.

Root `AGENTS.md` and `CLAUDE.md` are bridge files that point to `.agent/AGENTS.md`. Keep these bridge files thin and do not duplicate project rules in them. Codex, Claude, and other agents share `.agent/AGENTS.md` as the source of truth.

## Documentation

Documentation is a living artifact.

Whenever code, API behavior, architecture, setup, or business logic changes, automatically update relevant docs:

- `.agent/planning/*.md`
- `.agent/docs/*.md`
- `.agent/architecture-decisions/*.md`
- `.agent/review-history/*.md`
- `README.md`

Never leave documentation outdated.

## Agent Knowledge

Use `.agent/` as the long-term project memory.

When updating agent memory, also update related note links and `.agent/index.md` if the change affects durable navigation.

Record architecture decisions as separate ADR files in `.agent/architecture-decisions/`.

Use this naming format:

```text
YYYY-MM-DD-<short-decision-title>.md
```

Do not keep all architecture decisions in a single markdown file.
