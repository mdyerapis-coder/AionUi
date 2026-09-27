---
name: testing
description: |
  Testing workflow and quality standards for writing and running tests.
  Use when: (1) Writing new tests, (2) Adding a new feature that needs tests,
  (3) Modifying logic that has existing tests, (4) Before claiming a task is complete.
---

# Testing Skill

Standards and workflow for writing and running tests. Every feature must be tested.

**Announce at start:** "I'm using testing skill to ensure proper test coverage."

## Trigger Conditions

- Writing new tests for a feature or bug fix
- Adding a new feature (must include tests)
- Modifying logic that has existing tests (must update them)
- Before claiming work is complete
- Before committing code

## Framework

**Vitest 4** — configured in `vitest.config.ts`.

## Test Structure

```
tests/
├── unit/          # Vitest: functions, utilities, components
├── integration/   # Vitest: IPC, database, service interactions
└── e2e/           # Playwright (`playwright.config.ts`), `bun run test:e2e`
```

## Two Test Environments

| Environment      | When                              | File naming     |
| ---------------- | --------------------------------- | --------------- |
| `node` (default) | Main process, utilities, services | `*.test.ts`     |
| `jsdom`          | DOM/browser-dependent code        | `*.dom.test.ts` |

## Workflow

### Step 1: Identify What to Test

Before writing tests, list the **riskiest scenarios** first:

- What happens when the dependency returns `undefined` / throws?
- What happens at boundaries (empty list, max retries, past timestamp)?
- What is most likely to break in production?

### Step 2: Write Tests

Follow these quality rules:

**1. Describe behavior, not code structure**

```typescript
// Wrong — describes implementation
it('should call repo.getConversation', ...)

// Correct — describes behavior
it('should return cached task without hitting repo on second call', ...)
it('should reject with error when conversation does not exist', ...)
```

**2. Every describe block must cover at least one failure path**

Happy-path-only tests leave the most dangerous code untested.

**3. One behavior per test**

Keep each `it()` focused. More than 3 `expect()` calls in one test is a signal it is testing too much at once.

**4. Self-check**

After writing a test, mentally delete the core logic it targets. If the test would still pass, rewrite it — it is not guarding anything.

**5. Start from risk, not from coverage gaps**

List scenarios most likely to produce bugs. Write those first. Coverage is the outcome, not the starting point.

### Step 3: Run Tests

```bash
bun run test              # Vitest unit + integration (not Playwright)
bun run test:e2e          # Playwright end-to-end
bun run test:coverage     # Vitest with the coverage report
```

### Step 4: Verify Coverage

`vitest.config.ts` → `coverage.include` is `packages/desktop/src/**/*.{ts,tsx}` and `packages/**/src/**/*.{ts,tsx}`. Thresholds (`statements`, `branches`, `functions`, `lines`) are **0**.

New source files under those globs are included automatically. If a new file is accidentally excluded by `coverage.exclude`, remove it from the exclude list.

### Step 5: Update Existing Tests

When modifying logic, check if existing tests need updating:

```bash
bun run test -- --reporter=verbose   # See which tests pass/fail with names
```

If a test fails because the behavior changed intentionally, update the test. If it fails unexpectedly, investigate.

## Edge Case Checklist

When testing a module, verify:

- [ ] `null` / `undefined` inputs handled
- [ ] Empty arrays/objects handled
- [ ] Error thrown by dependencies handled
- [ ] Boundary values (0, -1, max, empty string)
- [ ] Async operations (timeout, rejection, cancellation)

## Quick Checklist

Before submitting code:

- [ ] New features have corresponding test cases
- [ ] Modified logic has updated tests
- [ ] `bun run test` passes (add `bun run test:e2e` when the change is end-to-end)
- [ ] Tests describe **behavior**, not implementation
- [ ] At least one failure path per describe block
- [ ] New source files are not accidentally excluded by `coverage.exclude`

## Common Mistakes

| Mistake                           | Correct                                       |
| --------------------------------- | --------------------------------------------- |
| Testing implementation details    | Test observable behavior                      |
| Only testing happy path           | Must include at least one failure path        |
| 5+ expects in one `it()`          | Split into separate tests                     |
| Skipping tests for "simple" code  | Simple code breaks too — test the risky parts |
| Writing tests after saying "done" | Tests are part of "done", not an afterthought |
