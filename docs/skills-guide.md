# Skills 使用指南

OpenClaw Swarm Layer 提供 5 个 skills，覆盖从安装到日常运营的完整生命周期。Skills 由 OpenClaw 在对话中自动加载，为 AI 提供操作指导。

## Skills 一览

| Skill | 用途 | 触发场景 |
|-------|------|---------|
| `swarm-layer` | 工具参考 | AI 调用 swarm tools 时自动参考 |
| `swarm-setup` | 安装配置 | 首次安装、配置 bridge、初始化项目 |
| `swarm-operate` | 全流程操作 | 编写 spec、执行任务、管理 session、review |
| `swarm-diagnose` | 故障诊断 | 任务卡住、bridge 失败、session 异常 |
| `swarm-report` | 报告分析 | 查看进度、理解报告内容、追踪 session |

## 使用方式

Skills 在 OpenClaw 对话中自动激活。当你对 OpenClaw 说相关指令时，对应的 skill 会为 AI 提供操作指导。

### 方式一：自然语言对话

直接用自然语言描述需求，OpenClaw 会根据上下文自动选择合适的 skill：

```
> 帮我安装 swarm layer 插件
→ 触发 swarm-setup skill

> 用这个 spec 开始一个新的工作流
→ 触发 swarm-operate skill

> 任务好像卡住了，帮我看看怎么回事
→ 触发 swarm-diagnose skill

> 当前进度怎么样
→ 触发 swarm-report skill
```

### 方式二：直接使用 CLI

如果你更喜欢直接执行命令：

```bash
# 安装与初始化
openclaw swarm doctor --json
openclaw swarm init --project .

# 操作循环
openclaw swarm plan --project . --spec SPEC.md
openclaw swarm run --project . --runner acp
openclaw swarm session status --project . --run <runId>
openclaw swarm review --project . --task <taskId> --approve

# 诊断
openclaw swarm doctor --json
openclaw swarm session cleanup --project . --stale-minutes 60

# 报告
openclaw swarm status --project .
openclaw swarm report --project .
```

---

## Skill 详解

### swarm-setup — 安装与配置

**适用场景**：首次部署或重新配置插件。

**完整流程**：

1. **检查环境** — 验证 Node.js >= 22 和 OpenClaw >= 2026.2.24
2. **安装插件** — `openclaw plugins install -l <path>`
3. **配置 bridge**（可选）— 为 ACP/subagent 执行添加 bridge 配置
4. **验证健康** — `openclaw swarm doctor --json` 确认 bridge 可用
5. **初始化项目** — `openclaw swarm init --project <path>`
6. **配置 Obsidian 同步**（可选）— 添加 `obsidianRoot`

**配置参考**：见 [configuration.md](configuration.md)

**常见问题**：

| 问题 | 检查方法 | 解决方案 |
|------|---------|---------|
| 插件未加载 | `openclaw plugins info` | 检查安装路径和 config |
| Bridge blocked | `swarm doctor --json` | 按 `remediation` 指示操作 |
| 版本不匹配 | doctor 输出 `versionMapped` | 更新 `bridge.versionAllow` |

---

### swarm-operate — 全流程操作

**适用场景**：日常工作流编排的核心操作循环。

**工作流生命周期**：

```
┌─────────┐    ┌──────┐    ┌───────┐    ┌─────┐    ┌────────┐
│ 写 Spec │ →  │ Plan │ →  │  Run  │ →  │ Poll│ →  │ Review │
└─────────┘    └──────┘    └───────┘    └─────┘    └────────┘
                               ↑                        │
                               └────── 下一个任务 ───────┘
```

**Spec 格式**：

```markdown
# 工作流标题

## Goals
- 目标描述

## Phases
### 阶段名称
- 任务 1
- 任务 2
```

**Runner 选择指南**：

| Runner | 适用场景 | 命令 |
|--------|---------|------|
| `manual` | 操作员手动执行并标记完成 | `--runner manual`（默认）|
| `acp` | 委派给外部 AI harness（Codex 等）| `--runner acp` |
| `subagent` | OpenClaw 原生子代理执行 | `--runner subagent` |

**Session 操作**：

| 操作 | 命令 | 场景 |
|------|------|------|
| 轮询状态 | `session status --run <id>` | ACP/subagent 执行后等待完成 |
| 取消 | `session cancel --run <id>` | 任务超时或需要中止 |
| 后续任务 | `session follow-up --session <id> --task <desc>` | 在已有 session 中追加工作 |
| 引导方向 | `session steer --session <id> --message <text>` | 改变活跃 session 的执行方向 |
| 清理 | `session cleanup --stale-minutes 60` | 处理超时的 orphaned session |

**Session 策略**：

| 策略 | 行为 |
|------|------|
| `none` | 每次创建新 session（默认）|
| `create_persistent` | 创建持久 session，后续可复用 |
| `reuse_if_available` | 优先复用匹配的 idle session |
| `require_existing` | 必须有已存在的 session，否则报错 |

---

### swarm-diagnose — 故障诊断

**适用场景**：遇到执行异常、任务卡住、bridge 故障等问题。

**诊断决策树**：

```
问题出现
  ├── 先跑 doctor → severity?
  │     ├── blocked → 按 remediation 修复
  │     └── healthy/warning → 继续排查
  │
  ├── 检查 status → 找到异常任务
  │     ├── running 太久 → session status → cancel if hung
  │     ├── blocked → 查看 latest run summary，修复后重跑
  │     ├── dead_letter → 查看 retry history，修复根因
  │     └── review_required → approve 或 reject
  │
  └── 检查 sessions → 找到异常 session
        ├── active 但无更新 → session cleanup
        ├── orphaned → 已被清理，可忽略
        └── failed → 查看关联 run 的 resultSummary
```

**常见故障与修复**：

| 故障 | 症状 | 修复 |
|------|------|------|
| `backend-unavailable` | ACP 后端不可达 | 验证 acpx 已启用，重跑 doctor |
| `version-drift` | OpenClaw 版本与 bridge 不匹配 | 更新 `bridge.versionAllow` |
| `timeout` | 任务执行超时 | 检查是任务慢还是 bridge 启动挂起 |
| `close-race` | Session 关闭竞争条件 | 信任本地 run ledger，避免重复 poll |
| Dead letter | 重试耗尽 | 查看 retry history，修复根因后手动重置 |
| Orphaned session | Session 活跃但无更新 | `session cleanup --stale-minutes 60` |

---

### swarm-report — 报告分析

**适用场景**：查看工作流进度、理解报告内容、追踪 session 状态。

**快速查看**：

```bash
# 结构化状态（JSON）
openclaw swarm status --project . --json

# 完整 Markdown 报告
openclaw swarm report --project .
```

**报告结构解读**：

| 章节 | 内容 | 关注点 |
|------|------|--------|
| **Attention** | 需要立即处理的事项 | review / blocked / running / dead_letter |
| **Tasks** | 所有任务及当前状态 | 哪些 done，哪些还在等待 |
| **Review Queue** | 等待审批的任务 | 每项附带最近 run 的摘要 |
| **Highlights** | 近期重要事件 | 完成 / 失败 / 取消 / 超时 |
| **Recommended Actions** | 操作建议 | 下一步该做什么 |
| **Recent Runs** | 最近 5 次执行 | runner 类型、状态、结果摘要 |
| **Sessions** | 最近 5 个 session | runner、模式、状态、摘要 |
| **Session Reuse Candidates** | 各任务的复用候选 | eligible / selected / reason |

**报告存储位置**：

| 位置 | 路径 |
|------|------|
| 本地 | `<project>/.openclaw/swarm/reports/swarm-report.md` |
| Obsidian | `<obsidianRoot>/<project-name>-swarm-report.md` |

报告在每次 `run`、`review`、`plan`、`session status/cancel/close` 操作后自动更新。

---

## 对话式操作速查

| 你说的话 | AI 执行的操作 |
|---------|--------------|
| "安装 swarm layer" | swarm-setup 流程 |
| "初始化这个项目" | `swarm init --project .` |
| "用这个 spec 规划任务" | `swarm plan --project . --spec <path>` |
| "跑下一个任务" | `swarm status` → `swarm run` |
| "用 ACP 跑" | `swarm run --runner acp` |
| "先预览不要真跑" | `swarm run --dry-run` |
| "这个任务跑完了吗" | `swarm session status --run <id>` |
| "批准这个任务" | `swarm review --task <id> --approve` |
| "当前进度" | `swarm status` 摘要 |
| "生成报告" | `swarm report` |
| "什么需要我处理" | `swarm status` → attention 项 |
| "任务卡住了" | swarm-diagnose 流程 |
| "帮我检查 bridge" | `swarm doctor --json` |
| "清理超时 session" | `swarm session cleanup` |
| "在这个 session 上追加任务" | `swarm session follow-up` |
| "让它换个方向" | `swarm session steer` |
| "查看所有 session" | `swarm session list` |
