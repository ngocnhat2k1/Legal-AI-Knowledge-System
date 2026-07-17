# AI Project Bootstrap

| Section | Guidance |
| --- | --- |
| Purpose | APB is a small bootstrap tool for starting AI-assisted software projects with a shared agent workflow. |
| Current version | v0.1 copies template files, replaces `{{PROJECT_NAME}}`, and produces a usable project bootstrap. It does not include manifests, hooks, profiles, blueprints, plugins, or orchestration. |
| Requirements | Use Node.js 18 or newer, npm, and a target directory that is missing or empty. |
| Install locally | Run `cd apb`, then `npm link`. This exposes `create-apb` and `apb-render-project-info` globally on the machine. |
| Verify local install | Run `which create-apb` and `which apb-render-project-info`. |
| Run without global link | Use `npm run create-apb -- ../my-project` or `npm run render-project-info -- ../my-project/input/ba-description.md ../my-project`. |
| Create a new project | Run `create-apb ../my-project`, or run `node bin/create-apb.js ../my-project` from this repository. |
| Target directory rule | The target directory may be missing or empty. The generator stops if the target directory already contains files. |
| First generated files to read | Start from `AGENTS.md`, `.agent/AGENTS.md`, `.agent/index.md`, `.agent/project-context.md`, `.agent/planning/00-bootstrap.md`, and `.agent/planning/01-task-list.md`. |
| Suggested agent prompt | `Read AGENTS.md and begin the APB bootstrap workflow for this project.` |
| Render BA documents | Run `apb-render-project-info ../my-project/input/ba-description.md ../my-project`, or pass a directory such as `apb-render-project-info ../my-project/input/docs ../my-project`. |
| Renderer output | The renderer creates `.agent/planning/02-project-summary.md`. It reads `.md`, `.txt`, and `.docx` files, extracts recognizable sections, and lists unsupported files in the generated summary. |
| Renderer overwrite rule | The renderer refuses to overwrite an existing `.agent/planning/02-project-summary.md`. Review or rename the existing file before running it again. |
| Generated project structure | Generated projects include `README.md`, `AGENTS.md`, `CLAUDE.md`, and `.agent/` with agent rules, a note-linked memory index, planning, docs, architecture decisions, review history, artifacts, previews, and reviews. |
| Agent documentation location | Agent-facing planning and documentation live under `.agent/`. Root `docs/` is optional and should be reserved for human-facing documentation outside the agent workflow. |
| Note-linked memory | `.agent/index.md` is the durable navigation map. APB uses Obsidian-inspired note linking while keeping required knowledge in plain Markdown with relative Markdown links. Editor-only features such as wiki links, canvas files, or Dataview queries must remain supplemental. |
| Agent bridge policy | Root `AGENTS.md` and `CLAUDE.md` are thin bridge files that point to `.agent/AGENTS.md`. `.agent/AGENTS.md` remains the source of truth. |
| Workflow discipline | Generated projects use a review-first workflow: planning, planning review, frozen planning, implementation design, design review, frozen design, milestone implementation, code review, fixes, documentation updates, and agent knowledge updates. |
| Handling unclear context | Generated agent rules require Open Questions instead of silent guessing. Owner answers are routed into the appropriate `.agent/` memory files. |
| Existing projects | APB v0.1 does not initialize non-empty existing projects automatically. Use APB on a missing or empty target directory for now. |
| Troubleshooting install | If `create-apb` is not found after `npm link`, check npm's global bin path with `npm bin -g`. |
| Troubleshooting target directory | If the target directory is not empty, create a new empty directory or wait for a future existing-project initialization command. |
| Troubleshooting renderer output | If `apb-render-project-info` says the output file already exists, review `.agent/planning/02-project-summary.md` before removing or archiving it. |
| Design principle | Delay abstraction until implementation demonstrates the need. |
| Publication status | This repository is ready to be hosted on GitHub as a public source repository. The package is marked private because APB v0.1 is not prepared for npm registry publication yet. |
| License | MIT. See `LICENSE`. |
