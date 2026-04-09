# 用户使用手册

本手册面向 OpenClaw Swarm Layer 使用者，覆盖安装、配置、日常工作流、session 操作、文档沉淀和故障排查。

---

## 1. 运行姿态

当前版本已经切到 ACP-first：

- 默认 `defaultRunner = "auto"`
- `auto` 只会在 ACP 自动化真实可用时解析为 `acp`
- 如果 ACP 当前不可用，`auto` 会安全回退到 `manual`
- 当前支持的 runner 只有 `manual` 和 `acp`
- `bridge.*` 只保留给旧配置兼容读取和 doctor 提示，不再提供执行能力

---

## 2. 安装

### 前置条件

- Node.js >= 22
- OpenClaw >= 2026.3.22（ACP public control-plane 默认路径）

当前测试基线：OpenClaw `2026.4.8`。

### 安装插件

```bash
# 从 ClawHub 安装已发布插件
openclaw plugins install clawhub:openclaw-swarm-layer

# 从 ClawHub 安装配套 skill
openclaw skills install swarm-layer

# 从源码安装
git clone https://github.com/xucheng/openclaw-swarm-layer.git
cd openclaw-swarm-layer
npm install
npm run build

# 注册到 OpenClaw
openclaw plugins install -l /path/to/openclaw-swarm-layer

# 基础验证
openclaw plugins info openclaw-swarm-layer
openclaw swarm --help
```

---

## 3. 配置

所有配置都写在：

`plugins.entries.openclaw-swarm-layer.config`

### 3.1 最小配置

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

这会启用 CLI 和 tools。因为 ACP 默认未开启，所以 `auto` 最终会落到 `manual`。

### 3.2 ACP Public-First 配置

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "defaultRunner": "auto",
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"],
            "defaultMode": "run",
            "allowThreadBinding": true,
            "defaultTimeoutSeconds": 600
          }
        }
      }
    }
  }
}
```

适用场景：OpenClaw 当前版本已经支持 public ACP control-plane，`auto` 会直接解析到 `acp`。

### 3.3 Autopilot 监督控制平面配置

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "defaultRunner": "auto",
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"]
          },
          "autopilot": {
            "enabled": true,
            "tickSeconds": 15,
            "leaseSeconds": 45,
            "maxDispatchPerTick": 2,
            "reviewPolicy": {
              "mode": "manual_only"
            }
          }
        }
      }
    }
  }
}
```

适用场景：希望把 `plan/run/review/recovery` 收敛到一个受监督的控制平面里，由 `autopilot` 做确定性推进，但仍保留人工审批和暂停能力。

### 3.4 ACP 旧桥接配置（仅保留兼容读取）

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "defaultRunner": "auto",
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"],
            "defaultMode": "run"
          },
          "bridge": {
            "acpFallbackEnabled": true,
            "nodePath": "$(which node)",
            "openclawRoot": "$(npm root -g)/openclaw",
            "versionAllow": ["2026.4.8"]
          }
        }
      }
    }
  }
}
```

这个配置现在不会再提供 ACP 执行能力，只是兼容读取旧配置时不报错。建议后续清理掉。

### 3.5 文档沉淀配置

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "obsidianRoot": "/path/to/obsidian/vault/swarm-reports",
          "journal": {
            "enableRunLog": true,
            "enableReviewLog": true,
            "enableSpecArchive": true,
            "enableCompletionSummary": true
          }
        }
      }
    }
  }
}
```

完整配置字段见：[configuration.md](configuration.md)

---

## 4. 日常工作流

### 4.1 初始化与规划

```bash
openclaw swarm init --project .
openclaw swarm plan --project . --spec SPEC.md
```

### 4.2 执行前检查

```bash
openclaw swarm doctor --json
openclaw swarm status --project .
```

重点看：

- doctor 的 `Default runner resolution: ...`
- ACP execution posture
- `nextAction`
- status 里的 configured default / resolved default / allowed runners

### 4.3 Dry-run 与执行

```bash
# 用当前 install 上解析出来的默认 runner 预览
openclaw swarm run --project . --dry-run

# 按默认解析执行
openclaw swarm run --project .

# 显式指定 manual
openclaw swarm run --project . --runner manual

# 显式指定 ACP
openclaw swarm run --project . --runner acp
```

### 4.4 审批与报告

```bash
openclaw swarm review --project . --task <taskId> --approve --note "通过"
openclaw swarm review --project . --task <taskId> --reject --note "需要修改"
openclaw swarm report --project .
```

### 4.5 Autopilot 控制

```bash
# 看当前控制平面状态
openclaw swarm autopilot status --project .

# 启动 / 暂停 / 恢复 / 停止
openclaw swarm autopilot start --project .
openclaw swarm autopilot pause --project . --reason "人工介入"
openclaw swarm autopilot resume --project .
openclaw swarm autopilot stop --project . --mode graceful

# 单次 tick，同步运行态、审批态和恢复动作
openclaw swarm autopilot tick --project .
openclaw swarm autopilot tick --project . --dry-run
```

什么时候用：

- 想让系统按策略自动推进时，用 `start`
- 想观察但不真正落地时，用 `tick --dry-run`
- 出现风险或人工接管时，用 `pause`

---

## 5. Session 操作

```bash
# 查看 session
openclaw swarm session list --project .
openclaw swarm session inspect --project . --session <sessionId>

# 查询某次 run 的 session 状态
openclaw swarm session status --project . --run <runId>

# 取消或关闭
openclaw swarm session cancel --project . --run <runId>
openclaw swarm session close --project . --run <runId>

# 在已有 session 中追加任务或引导方向
openclaw swarm session follow-up --project . --session <sessionId> --task "修复剩余测试"
openclaw swarm session steer --project . --session <sessionId> --message "优先处理失败用例"
```

---

## 6. 文档沉淀与目录结构

本地状态目录：

```text
<project>/.openclaw/swarm/
├── workflow-state.json
├── progress.json
├── runs/
├── sessions/
└── specs/
```

本地报告目录：

```text
<project>/.openclaw/swarm/reports/
├── swarm-report.md
├── run-log.md
├── review-log.md
├── completion-summary.md
└── specs/
    └── <specId>.md
```

如果配置了 `obsidianRoot`，这些文档会异步镜像到 Obsidian。

---

## 7. 故障排查

### 7.1 ACP 没有跑起来

先执行：

```bash
openclaw swarm doctor --json
```

判断方式：

- 如果看到 `auto -> manual`，说明当前 install 上 ACP 自动化还不可用，系统在安全回退
- 如果看到 `ACP automation is unavailable on this install until the public control-plane export is ready`，说明当前 install 上还不满足 ACP public path
- 如果配置里还保留 `bridge.acpFallbackEnabled`，它现在只会被当作 legacy config 告警，不会恢复 ACP 能力

### 7.2 bridge 版本不匹配

检查：

- `bridge.versionAllow`
- 当前 OpenClaw 版本
- `swarm doctor --json` 输出里的 version drift / remediation

### 7.3 升级 OpenClaw 后异常

建议顺序：

1. `openclaw swarm doctor --json`
2. 看 default runner resolution 是否变化
3. 看 ACP posture 是否仍然是 public-primary
4. 如果旧配置里还有 `bridge.*` 字段，确认它们只是兼容读取，不要把它们当成执行能力
5. 必要时先退回 `manual`

---

## 8. 常用命令速查

| 命令 | 用途 |
|------|------|
| `swarm doctor` | 诊断 ACP readiness、默认 runner 解析和 bridge-exit 状态 |
| `swarm status` | 查看 workflow 状态、运行姿态和推荐动作 |
| `swarm plan` | 导入 spec 并生成任务图 |
| `swarm run` | 执行下一个可运行任务 |
| `swarm review` | 审批任务结果 |
| `swarm report` | 生成 workflow 报告 |
| `swarm session ...` | 管理会话、轮询状态、follow-up、steer |
| `swarm autopilot ...` | 查看和控制监督式 autopilot 控制平面 |
