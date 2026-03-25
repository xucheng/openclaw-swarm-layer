# Skills 使用指南

OpenClaw Swarm Layer 提供 1 个统一 skill（`swarm-layer`），内含 5 个功能模块 + Harness Enhancement 子模块，覆盖从安装到日常运营的完整生命周期。

## 安装

从 ClawHub 安装：

```bash
clawhub install swarm-layer
```

或通过插件自带（`skills/swarm-layer/SKILL.md`），安装插件后自动可用。

## 模块路由

Skill 根据用户意图自动路由到对应模块：

| 用户意图 | 模块 | 关键命令 |
|---------|------|---------|
| 安装、配置、初始化 | **Setup** | `plugins install`, `doctor`, `init` |
| 规划、执行、审批、session 操作 | **Operate** | `plan`, `run`, `review`, `session *` |
| 故障排查、任务卡住 | **Diagnose** | `doctor`, `session status/cancel/cleanup` |
| 查看进度、报告分析 | **Report** | `status`, `report`, `session list/inspect` |
| 启用 GAN 模式、增强编排 | **Operate → Harness** | `evaluator`, `bootstrap`, `immutability`, `rubric` |
| AI 工具调用 | **Tools Reference** | 7 个 swarm tools 参数参考 |

## 使用方式

### 方式一：自然语言对话

直接用自然语言描述需求，OpenClaw 会根据 skill 内容自动选择操作：

```
> 帮我安装 swarm layer 插件        → Setup 模块
> 用这个 spec 开始工作流            → Operate 模块
> 任务卡住了                        → Diagnose 模块
> 当前进度怎么样                    → Report 模块
```

### 方式二：直接使用 CLI

```bash
openclaw swarm init --project .
openclaw swarm plan --project . --spec SPEC.md
openclaw swarm run --project . --runner acp
openclaw swarm session status --project . --run <id>
openclaw swarm review --project . --task <id> --approve
openclaw swarm report --project .
```

## 模块详解

### Setup 模块

完整安装流程：环境检查 → 插件安装 → Bridge 配置 → Doctor 验证 → 项目初始化 → Obsidian 同步配置。

### Operate 模块

核心操作循环：

```
写 Spec → plan → status → run → session status → review → 下一个任务
```

包含 runner 选择指南（manual/acp/subagent）、session 策略（none/create_persistent/reuse_if_available/require_existing）、follow-up/steer 操作。

### Diagnose 模块

诊断决策树：

```
doctor → severity?
  ├── blocked → 按 remediation 修复
  └── ok → status → 找异常任务
         ├── running 太久 → session cancel
         ├── blocked → 查 run summary
         ├── dead_letter → 查 retry history
         └── orphaned → session cleanup
```

### Report 模块

报告结构解读：Attention → Tasks → Review Queue → Highlights → Recommended Actions → Recent Runs → Sessions → Reuse Candidates。

文档沉淀：swarm-report（覆写）、run-log（追加）、review-log（追加）、spec archive（创建一次）、completion-summary（完成时覆写）。

### Tools Reference

7 个 swarm tools 的参数和用途速查，供 AI 工具调用时参考。

## 对话式操作速查

| 你说的话 | AI 执行的操作 |
|---------|--------------|
| "安装 swarm layer" | Setup: 环境检查 → 插件安装 → 验证 |
| "初始化这个项目" | `swarm init --project .` |
| "用这个 spec 规划" | `swarm plan --project . --spec <path>` |
| "跑下一个任务" | `swarm status` → `swarm run` |
| "用 ACP 跑" | `swarm run --runner acp` |
| "先预览不要真跑" | `swarm run --dry-run` |
| "跑完了吗" | `swarm session status --run <id>` |
| "批准" | `swarm review --task <id> --approve` |
| "当前进度" | `swarm status` |
| "生成报告" | `swarm report` |
| "任务卡住了" | Diagnose: `doctor` → `status` → 排查 |
| "清理超时 session" | `swarm session cleanup` |
| "启用增强模式" | 添加 evaluator + immutability + bootstrap 配置 |
| "追加任务到 session" | `swarm session follow-up` |
| "改变方向" | `swarm session steer` |
