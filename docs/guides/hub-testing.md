# Hub backend tests

L1 is removed. `tests/integration/hub-install-flow.test.ts`, `HubInstaller`, and `AcpDetector` are not in this tree.

The remaining spec is [`tests/e2e/specs/hub-backend-install.e2e.ts`](../../tests/e2e/specs/hub-backend-install.e2e.ts). It covers agent-management diagnostics (the Settings market-install modal is gone).

```bash
bun run test:e2e
# or
bunx playwright test tests/e2e/specs/hub-backend-install.e2e.ts --config playwright.config.ts
```

L3 `tests/integration/acp-smoke.test.ts` is also gone. `tests/fixtures/fake-acp-cli/` and `tests/fixtures/fake-extension/` are still on disk; no test imports them.
