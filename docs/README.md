# AionUi Docs

Documentation is organized by reader intent, not by document type.

| Directory                       | For whom                 | What lives here                                                                                                               |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [`guides/`](guides)             | Users & operators        | How to deploy, test, and run the product. Server deployment, WebUI, Hub testing, CDP debugging.                               |
| [`contributing/`](contributing) | Contributors             | Dev environment setup, file-structure conventions, PR automation workflow.                                                    |
| [`architecture/`](architecture) | Engineers & architects   | System architecture overview, subsystem deep-dives (ACP, queue, team mode), and supporting research notes.                    |
| `specs/`                        | Engineering-driven specs | Feature design docs, requirements, implementation plans (ACP rewrite, extension market, remote agent, wake prompt, PR notes). |
| [`prds/`](prds)                 | Product team             | Formal Product Requirement Documents maintained by the product team. **Do not reorganize without their consent.**             |
| [`readme/`](readme)             | Global users             | Translated copies of the root `readme.md` (Chinese, Japanese, Korean, Spanish, etc.).                                         |
| [`theming/`](theming)           | Designers & engineers    | Theme tokens, palette definitions, and guidance for styling components consistently.                                          |
| [`../map/`](../map/AGENTS.md)   | Engineers         | Startup object/process map. |

## Quick pointers

- New to the project? Start with [`map/AGENTS.md`](../map/AGENTS.md).
- Setting up a dev environment? See [`contributing/development.md`](contributing/development.md).
- Writing code? The entry point for code-style, linting, formatting, and commit rules is [`AGENTS.md`](../AGENTS.md) at the repo root.
- Deploying a server? [`guides/deploy-server.md`](guides/deploy-server.md).

## Where to put new docs

| Content type                                      | Destination                  |
| ------------------------------------------------- | ---------------------------- |
| User/ops-facing how-to                            | `guides/`                    |
| Contributor convention, workflow, or tooling rule | `contributing/`              |
| Startup object or process card                    | `map/` (see `map/AGENTS.md`) |
| Formal PRD owned by product team                  | `prds/` (coordinate first)   |
| README translation                                | `readme/readme_<locale>.md`  |
