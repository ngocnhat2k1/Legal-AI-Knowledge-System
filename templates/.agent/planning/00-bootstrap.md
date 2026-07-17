# Bootstrap Plan

## Project

`{{PROJECT_NAME}}`

## Purpose

Define the minimum project context required before implementation begins.

## Project Context Source

`.agent/project-context.md` is the durable project brief. Fill it with enough context for a new agent to understand what the project does before implementation work begins.

## Initial Project Description

Status: Pending

During first bootstrap only, ask the owner for a short project description if `.agent/project-context.md` still contains placeholder content. Use that answer to populate `.agent/project-context.md` once.

Do not repeat this initial description step after `.agent/project-context.md` has been populated. Future work should read the existing project context and update it only when the project actually changes.

Minimum description to capture:

- What the project does.
- Why the project exists.
- Who uses or maintains it.
- The main workflows or capabilities.
- What is in scope.
- What is out of scope.
- Important domain terms.
- Technical constraints or external systems.
- Known open questions.

## Repository Scope

To be defined.

## Code Organization Baseline

If the project already uses a framework or established repository convention, follow that convention and document the project-specific mapping in `.agent/docs/code-organization.md`.

Recommended baseline for projects without an existing structure:

```text
src/
  app/
  modules/
    example-module/
  shared/
    kernel/
    adapters/
  integrations/
  tests/
    helpers/
```

Review `.agent/docs/code-organization.md` before the first implementation task. Keep feature-specific logic inside the project's feature/module boundary, keep shared code small and domain-neutral, and avoid generic helper files.

## In Scope

- To be defined.

## Out of Scope

- To be defined.

## Constraints

- To be defined.

## Confirmed Requirements

- To be defined.

## Assumptions

- To be defined.

## Open Questions

- To be defined.

## Risk Areas / Unknowns

- To be defined.

## Validation Plan

- To be defined.

## Reuse Check

- Existing helpers, modules, or patterns searched: To be defined.
- Existing code to reuse or extend: To be defined.
- New helper, utility, abstraction, or module needed: To be defined.
- Reason existing code is insufficient: To be defined.

## Project Intent

To be defined.

## Success Criteria

- To be defined.

## Bootstrap Decisions

- To be defined.

## Template Readiness

Status: Draft

## Next Action

Complete the one-time Initial Project Description step if needed, review this bootstrap plan, then choose or revise the first task in `.agent/planning/01-task-list.md`.
