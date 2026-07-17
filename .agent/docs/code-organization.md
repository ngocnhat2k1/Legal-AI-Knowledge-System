# Code Organization

This document defines the default code organization guidance for this project.

Use it to keep implementation work predictable across different agents and threads.

## Framework First

If this project already uses a framework, platform, or established repository convention, follow that convention first.

Examples:

- Next.js, Remix, or similar projects may use their existing `app/`, `pages/`, `components/`, `lib/`, or route conventions.
- NestJS, Rails, Laravel, Django, Spring, or similar projects may use their established module, controller, service, model, migration, or package conventions.
- Monorepos may use their existing `apps/`, `packages/`, `services/`, or workspace layout.

When a framework convention is used, document the project-specific mapping in this file instead of forcing the APB baseline structure.

## Recommended Baseline

Use this baseline when the project does not already have a clear framework or repository structure:

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

## Directory Responsibilities

These responsibilities apply when the recommended baseline is used. For framework-based projects, map the same responsibilities to the framework's native directories.

| Directory | Responsibility |
|---|---|
| `src/app/` | Application entry points, routing, dependency composition, and top-level wiring. |
| `src/modules/<module-name>/` | Feature-specific business logic, services, rules, types, and tests. |
| `src/shared/kernel/` | Small domain-neutral primitives used across modules. |
| `src/shared/adapters/` | Shared infrastructure adapters such as logging, configuration, or environment access. |
| `src/integrations/<integration-name>/` | External system clients, mappers, and integration-specific helpers. |
| `tests/helpers/` | Test-only helpers that must not be imported by production code. |

## Module Boundaries

- Feature-specific logic should live inside the framework's feature/module boundary, or inside `src/modules/<module-name>/` when the recommended baseline is used.
- Each module should expose its public API through `index` when the project language and tooling support it.
- Other modules should import from a module public API instead of private implementation files.
- Business rules belong in feature/module-level files, not in generic shared code.
- Integration-specific mapping or normalization belongs under the framework's integration boundary, or under `src/integrations/<integration-name>/` when the recommended baseline is used.

## Shared Code Rules

- Add reusable code to the project's shared-code location only when at least two modules need it, or when the owner approves it as shared infrastructure.
- Keep shared kernel code domain-neutral.
- Do not create generic catch-all files or directories such as `utils`, `helpers`, `common`, `misc`, `shared.ts`, or `helpers.ts`.
- Prefer module-local helpers until reuse is proven.
- Before adding a helper, utility, abstraction, or shared module, search the existing codebase for equivalent behavior.

## Project Mapping

Record the structure this project actually uses:

| Responsibility | Project Location | Notes |
|---|---|---|
| Application entry and composition | To be defined | Use framework convention when available. |
| Feature/module logic | To be defined | Use framework convention when available. |
| Shared domain-neutral primitives | To be defined | Keep small and reusable. |
| External integrations | To be defined | Keep integration-specific mapping out of feature logic. |
| Test helpers | To be defined | Keep test-only code out of production imports. |

## Reuse Check

Before creating new reusable code, record the answer to these questions in the task plan or review summary:

- What existing files, helpers, modules, or patterns were searched?
- Why is the existing code insufficient?
- Should the new code stay module-local or become shared?
- Which documentation or code organization note must be updated?

## Review Checklist

Code review must check for:

- Duplicate helpers or duplicate business logic.
- New generic utility files.
- Cross-module imports from private implementation files.
- Business rules placed in `src/shared/`.
- Shared code introduced before reuse is proven.
