# Team E2E Specs

Team cases live in `tests/e2e/cases/teams/` and run via `bun run test:e2e:team*`. `team-agent-lifecycle.e2e.ts` creates its team (`team.create` in `createLifecycleTeam`); it does not depend on `team-create.e2e.ts`.

> 本文件是 ciwei（测试）和 laochui（开发）的共同规范。动手前必读。

---

## 一、先理解 Aion Team 是什么

**Aion Team 是一个由 leader 驱动的 AI 团队系统。用户不直接操作团队成员，用户只跟 leader 说话。**

**leader 本身也是一个 agent，类型可以是 claude、codex 或 gemini。** 不同 leader 类型的团队，调度能力各自独立。E2E 要覆盖三种 leader 类型，不是只测一种。

真实的用户操作场景：

| 用户想做什么          | 用户的实际操作                                             |
| --------------------- | ---------------------------------------------------------- |
| 招募一个 codex 工程师 | 在 leader 聊天框输入："Add a codex type member named Dev1" |
| 解雇某个成员          | 在 leader 聊天框输入："Fire the member named Dev1"         |
| 给成员派任务          | 在 leader 聊天框输入："Ask Dev1 to write unit tests"       |
| 团队内部通信          | leader 自行决定转发、广播或直接回复                        |

**UI 上没有"添加成员"按钮，没有"解雇"按钮。用户能操作的只有 leader 的聊天输入框。**

E2E 测试就是模拟这个真实用户：Playwright 打开 app，在 leader 聊天框输入自然语言，等 leader 推理并执行，验证 UI 是否正确响应。

---

## 二、核心链路

```
用户在 leader 聊天框输入自然语言
    → leader 理解意图
    → leader 调用对应 MCP 工具（spawn_agent / fire_agent 等）
    → 操作执行
    → UI 响应（新 tab 出现 / tab 消失 / 消息显示）
```

**E2E 验证的是这条完整链路，缺任何一环都不算验证。**

---

## 三、invokeBridge 的定位

invokeBridge 是测试工具，不是用户操作路径。真实用户根本不知道 invokeBridge 的存在。

**允许用于：**

| 场景                                  | 示例                                     |
| ------------------------------------- | ---------------------------------------- |
| **setup**：获取 teamId、读初始成员数  | `invokeBridge(page, 'team.list', ...)`   |
| **assertion**：验证后端状态与 UI 一致 | `invokeBridge(page, 'team.get', { id })` |

`team-agent-lifecycle.e2e.ts` creates the team and adds a member with `team.create` and `team.add-agent` through invokeBridge. See that file.

---

## 四、laochui 的前置工作

**白名单唯一标准：`claude`、`codex`、`gemini`，前后端必须一致。**

### ✅ 任务1：白名单调整（已完成）

E2E whitelist: `tests/e2e/helpers/teamConfig.ts` (`TEAM_SUPPORTED_BACKENDS`).

当前值：`new Set(['claude', 'codex', 'gemini'])`（codebuddy 已移出）

---

## 五、当前文件状态

Files under `tests/e2e/cases/teams/`:

| 文件                          | 职责                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `team-create.e2e.ts`          | UI 创建流程（`bun run test:e2e:team:create`）                                |
| `team-agent-lifecycle.e2e.ts` | 自己 `team.create`，再 `team.add-agent`（`bun run test:e2e:team:lifecycle`） |
| `team-whitelist.e2e.ts`       | UI 下拉框只显示白名单 agent                                                  |
| `team-communication.e2e.ts`   | 用户消息发送链路验证                                                         |

已删除的错误文件（invokeBridge 触发操作 / per-type 独立文件）：
`team-add-agent.e2e.ts`、`team-remove-agent.e2e.ts`、`team-multi-agent.e2e.ts`、`team-codebuddy.e2e.ts`

---

## 六、team-agent-lifecycle.e2e.ts

Source: `tests/e2e/cases/teams/team-agent-lifecycle.e2e.ts`.

`createLifecycleTeam` calls `team.create`. The test skips when that call cannot run. It does not require `team-create.e2e.ts`.

---

## 七、运行方式

```bash
# All cases in tests/e2e/cases/teams/
E2E_PACKAGED=1 bun run test:e2e:team

# UI create flow only — not a prerequisite for lifecycle
E2E_PACKAGED=1 bun run test:e2e:team:create

# Lifecycle creates its own team
E2E_PACKAGED=1 bun run test:e2e:team:lifecycle

# 仅白名单下拉框测试
E2E_PACKAGED=1 bun run test:e2e:team:whitelist

# 仅消息发送链路测试
E2E_PACKAGED=1 bun run test:e2e:team:comm

# 只测 gemini leader（TEAM_AGENT 过滤，支持逗号分隔多个）
TEAM_AGENT=gemini E2E_PACKAGED=1 bun run test:e2e:team:lifecycle

# 只测 claude + codex
TEAM_AGENT=claude,codex E2E_PACKAGED=1 bun run test:e2e:team

# 创建时也只创建 gemini team
TEAM_AGENT=gemini E2E_PACKAGED=1 bun run test:e2e:team:create
```

**环境变量说明：**

| 变量             | 默认值              | 说明                                                                                                                                                        |
| ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_PACKAGED=1` | 无（本地 dev 模式） | 使用 `out/` 下的打包产物启动 app                                                                                                                            |
| `E2E_DEV=1`      | 无                  | 强制使用 dev 模式（electron .）                                                                                                                             |
| `TEAM_AGENT`     | 空（三种全跑）      | leader 类型过滤，支持逗号分隔（`gemini` 或 `claude,codex`）。过滤在 `helpers/teamConfig.ts` 集中处理，所有 test 文件通过 `TEAM_SUPPORTED_BACKENDS` 自动生效 |

packaged 模式下 app 使用用户本地已配置的 API key，**不需要任何额外配置**。

**npm scripts 一览：**

| 命令                      | 说明                                 |
| ------------------------- | ------------------------------------ |
| `test:e2e:team`           | `tests/e2e/cases/teams/*.e2e.ts`     |
| `test:e2e:team:create`    | `team-create.e2e.ts` only            |
| `test:e2e:team:lifecycle` | lifecycle file; creates its own team |
| `test:e2e:team:whitelist` | 仅白名单下拉框                       |
| `test:e2e:team:comm`      | 仅消息发送                           |
