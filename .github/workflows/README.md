# Workflows

See [../CICD_SETUP.md](../CICD_SETUP.md) for triggers.

`gpt-review.yml` and `gpt-pr-assessment.yml` run on `workflow_dispatch` or `workflow_call`. `pr-checks.yml` does not call them.

Shared steps live in `.github/actions/` (`gather-pr-diff`, `read-file-contents`, `call-openai`). File priority inside `read-file-contents` is the `filePriority` function in that action, not this note.
