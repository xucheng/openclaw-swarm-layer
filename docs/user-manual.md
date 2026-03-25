# 用户使用手册

本手册面向 OpenClaw Swarm Layer 的使用者，涵盖安装、配置、日常操作和故障排查。

---

## 1. 安装

### 前置条件

- Node.js >= 22
- OpenClaw >= 2026.2.24（`openclaw --version` 检查）

### 安装插件

```bash
# 从源码安装
git clone https://github.com/xucheng/openclaw-swarm-layer.git
cd openclaw-swarm-layer
npm install && npm run build

# 注册到 OpenClaw
openclaw plugins install -l /path/to/openclaw-swarm-layer

# 验证
openclaw plugins info openclaw-swarm-layer
```

输出应显示 `Status: loaded`，7 个 tools 和 CLI commands。

---

## 2. 配置

### 最小配置（仅手动 runner）

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {}
      }
    }
  }
}
```

### ACP 执行配置

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"],
            "defaultMode": "run"
          },
          "bridge": {
            "enabled": true,
            "nodePath": "$(which node)",
            "openclawRoot": "$(npm root -g)/openclaw",
            "versionAllow": ["2026.3.13"]
          }
        }
      }
    }
  }
}
```

### 文档沉淀配置

```json
{
  "obsidianRoot": "/path/to/obsidian/vault/swarm-reports",
  "obsidianJournal": {
    "enableRunLog": true,
    "enableReviewLog": true,
    "enableSpecArchive": true,
    "enableCompletionSummary": true
  }
}
```

### 增强 Harness 配置

```json
{
  "enforceTaskImmutability": true,
  "bootstrap": {
    "enabled": true
  },
  "evaluator": {
    "enabled": true,
    "autoInjectAfter": ["coding"]
  }
}
```

| 功能 | 配置项 | 说明 |
|------|--------|------|
| 任务不可变保护 | `enforceTaskImmutability` | 防止 agent 篡改任务定义（标题、依赖等）|
| 启动引导序列 | `bootstrap.enabled` | 每次执行前验证环境、加载进度、选择任务 |
| 评估器注入 | `evaluator.enabled` | 在 coding 任务后自动插入评估任务（GAN 模式）|

完整配置参考：[configuration.md](configuration.md)

---

## 3. 工作流操作

### 3.1 编写 Spec

创建一个 Markdown 文件描述工作流：

```markdown
# 我的工作流

## Goals
- 完成功能开发并通过测试

## Constraints
- 不修改公共 API

## Acceptance Criteria
- 所有单测通过
- 代码已 review

## Phases
### 阶段一：实现
- 实现核心逻辑
- 编写单元测试
### 阶段二：集成
- 集成测试
- 代码审查
```

### 3.2 初始化 → 规划 → 执行

```bash
# 初始化项目
openclaw swarm init --project .

# 导入 spec 并生成任务图
openclaw swarm plan --project . --spec SPEC.md

# 查看状态
openclaw swarm status --project .

# 预览执行（不实际运行）
openclaw swarm run --project . --dry-run

# 实际执行
openclaw swarm run --project .                    # 手动 runner
openclaw swarm run --project . --runner acp       # ACP runner
openclaw swarm run --project . --runner subagent  # Subagent runner
```

### 3.3 Session 监控（ACP/Subagent）

```bash
# 轮询 session 状态
openclaw swarm session status --project . --run <runId>

# 取消执行
openclaw swarm session cancel --project . --run <runId>

# 在已有 session 中追加任务
openclaw swarm session follow-up --project . --session <sessionId> --task "修复剩余测试"

# 引导 session 方向
openclaw swarm session steer --project . --session <sessionId> --message "优先处理性能问题"
```

### 3.4 审批

```bash
# 批准
openclaw swarm review --project . --task <taskId> --approve --note "确认通过"

# 拒绝
openclaw swarm review --project . --task <taskId> --reject --note "需要修改"
```

### 3.5 报告

```bash
# 生成报告
openclaw swarm report --project .

# 查看报告
cat .openclaw/swarm/reports/swarm-report.md
```

---

## 4. 文档沉淀

启用 `obsidianJournal` 后，以下文档自动生成：

| 文档 | 触发 | 写入方式 | 内容 |
|------|------|---------|------|
| `swarm-report.md` | 每次操作 | 覆写 | 当前状态快照 |
| `run-log.md` | `swarm run` | 追加 | 执行记录表（时间、runId、runner、状态）|
| `review-log.md` | `swarm review` | 追加 | 审批决策表（时间、任务、决定、备注）|
| `specs/<specId>.md` | `swarm plan` | 创建一次 | Spec 完整归档 |
| `completion-summary.md` | 全部完成 | 覆写 | 工作流总结（任务列表、执行时间线）|

**存储位置**：
- 本地：`<project>/.openclaw/swarm/reports/`（始终写入）
- Obsidian：`<obsidianRoot>/<project-name>/`（异步镜像，可选）

---

## 5. Session 策略

在 Spec 中可通过任务配置声明 session 策略：

| 策略 | 行为 |
|------|------|
| `none` | 每次新建 session（默认）|
| `create_persistent` | 创建持久 session，后续任务可复用 |
| `reuse_if_available` | 优先复用匹配的空闲 session |
| `require_existing` | 必须有匹配的 session，否则报错 |

---

## 5.1 增强 Harness 功能

### Sprint 合约

在 Spec 中定义 `Acceptance Criteria` 后，`swarm plan` 会自动生成 Sprint 合约并附加到首个 coding 任务：

```markdown
## Acceptance Criteria
- 所有单测通过
- API 响应时间 < 200ms
```

合约包含可验证的验收条件（`test_passes`、`file_exists`、`content_matches`、`command_exits_zero`、`manual_check`）。

### 评估器任务

启用 `evaluator.enabled` 后，每个 coding 任务后会自动插入一个 evaluate 任务，继承源任务的 Sprint 合约。依赖链自动调整：

```
coding-task-1 → coding-task-1-eval → coding-task-2 → coding-task-2-eval
```

### 质量评分

支持加权多维度质量评分替代简单的 approve/reject：

- **functionality** (0.3) — 核心功能是否正确
- **correctness** (0.3) — 逻辑是否健全
- **design** (0.2) — 架构是否清晰
- **craft** (0.2) — 代码质量与一致性

加权总分 >= 6.0 自动 approve，否则 reject。

### 跨 Session 进度

每次 `swarm run` 和 `swarm review` 后自动更新 `progress.json`，新 session 启动时可通过 bootstrap 序列加载历史进度。

### Session 预算

可为任务设置执行预算：

- `maxDurationSeconds` — 最大执行时长
- `maxRetries` — 最大重试次数

超出预算时在 run record 中标注 `[BUDGET EXCEEDED]`。

---

## 6. 故障排查

### 检查 bridge 健康

```bash
openclaw swarm doctor --json
```

| severity | 含义 |
|----------|------|
| `healthy` | Bridge 完全可用 |
| `warning` | 可用但有风险（如版本未锁定）|
| `blocked` | 不可用，按 `remediation` 修复 |

### 常见问题

| 问题 | 排查命令 | 解决方案 |
|------|---------|---------|
| 插件未加载 | `openclaw plugins info` | 检查安装路径 |
| ACP 执行失败 | `swarm doctor --json` | 按 remediation 修复 |
| 任务卡在 running | `swarm session status --run <id>` | cancel 后重跑 |
| 版本不匹配 | `swarm doctor` 查 versionMapped | 更新 `bridge.versionAllow` |
| Orphaned session | `swarm session list` | `swarm session cleanup` |
| Dead letter | `swarm status` 查 deadLetterTasks | 修复根因后手动重置 |

### 完整诊断流程

```
1. openclaw swarm doctor --json     → 检查 bridge 健康
2. openclaw swarm status --project . → 查看 attention 项
3. openclaw swarm session list       → 检查 session 状态
4. openclaw swarm session cleanup    → 清理 orphaned session
```

---

## 7. CLI 命令速查

### 核心工作流
| 命令 | 用途 |
|------|------|
| `swarm init --project <path>` | 初始化项目 |
| `swarm plan --project <path> --spec <path>` | 导入 spec |
| `swarm status --project <path>` | 查看状态 |
| `swarm run --project <path> [--runner acp] [--dry-run]` | 执行任务 |
| `swarm review --project <path> --task <id> --approve\|--reject` | 审批 |
| `swarm report --project <path>` | 生成报告 |
| `swarm doctor` | 诊断 bridge |

### Session 管理
| 命令 | 用途 |
|------|------|
| `swarm session list` | 列出所有 session |
| `swarm session inspect --session <id>` | 检查 session 详情 |
| `swarm session status --run <id>` | 轮询执行状态 |
| `swarm session cancel --run <id>` | 取消执行 |
| `swarm session close --run <id>` | 关闭 session |
| `swarm session follow-up --session <id> --task <desc>` | 追加任务 |
| `swarm session steer --session <id> --message <text>` | 引导方向 |
| `swarm session cleanup [--stale-minutes N]` | 清理 orphan |

---

## 8. 相关文档

- [配置参考](configuration.md) — 所有配置字段详解
- [Skills 使用指南](skills-guide.md) — 5 个 skill 的使用方法
- [操作员手册](operator-runbook.md) — 安装、升级、回滚
- [路线图](roadmap.md) — 里程碑结构
- [里程碑](milestones.md) — 各阶段验收标准
