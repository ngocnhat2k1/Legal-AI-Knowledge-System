# {{PROJECT_NAME}}

## Purpose

This repository was bootstrapped with APB.

## Starting Point

Begin with:

1. `AGENTS.md`
2. `CLAUDE.md` when using Claude
3. `.agent/AGENTS.md`
4. `.agent/index.md`
5. `.agent/project-context.md`
6. `.agent/planning/00-bootstrap.md`
7. `.agent/planning/01-task-list.md`
8. `.agent/docs/code-organization.md`

`.agent/index.md` is the durable memory map. Use it to connect project context, rules, decisions, reviews, feature notes, module notes, concept notes, and workflow notes with relative Markdown links.

## Code Structure

APB starts projects with lightweight code organization guidance. If the project already uses a framework or established repository convention, follow that convention first and document the mapping in `.agent/docs/code-organization.md`.

For projects without an existing structure, APB provides this framework-neutral baseline:

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

Before adding helpers, utilities, shared modules, or abstractions, read `.agent/docs/code-organization.md`.

## Bootstrap Status

Status: Draft

## Next Step

During first bootstrap, complete `.agent/project-context.md` once from the project description. Then review the bootstrap plan, confirm repository boundaries, and choose the first task from `.agent/planning/01-task-list.md`.
