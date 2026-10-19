# Proposal

## Why

当前测试把大量维护成本花在内部调用、提示词逐句匹配、重复协议矩阵和过时兼容行为上：19 个前端测试文件共 5,766 行，E2E 及辅助文件共 1,320 行，Playwright 展开为 46 项。部分所谓 E2E 替换了 `translate()`，无法证明从用户操作到真实翻译管线的行为；需要按实际回归风险重新选择少量测试，而不是把全部单元测试搬进浏览器。

## What Changes

- 逐文件审查并删除现有 19 个 Vitest 测试文件；仅把关键用户结果转为使用真实业务代码的 E2E，不迁移低价值断言和排列组合。
- 重审全部 4 个现有 E2E 文件及辅助设施，删除页面可见性冒烟、内部调用次数、固定发布文案和重复浏览器/选项矩阵，将完整 Playwright 清单从 46 项缩减至最多 16 项。
- E2E 保留真实 UI、翻译、协议、格式化和持久化逻辑；只控制外部网络、原生 IPC 等环境边界，明确区分扩展 E2E、桌面 renderer 流程和原生覆盖。
- 同时审查 Rust 的 21 个测试，仅保留 4 个直接验证真实连接关闭与配置文件数据保护的原生边界测试，其余删除；不为模拟 IPC 的浏览器测试声称原生覆盖。
- **BREAKING（开发工作流）**：移除 Vitest、jsdom、专用 Vite 配置、`pnpm test` 和单元测试 CI；以 `pnpm test:e2e` 为唯一前端测试命令，同步维护 CI 和开发文档。原生测试继续使用 Cargo。
- 为实施提供明确的去留清单、16 项 E2E 分配、4 项原生保留理由、删除顺序和净缩减验收标准。

## Capabilities

### New Capabilities

无。本变更只调整测试与开发工具，不引入产品能力。

### Modified Capabilities

- `desktop-release-automation`：删除 unit-test workflow 后，action 基线要求改为覆盖当前存在的 workflow，不再要求存在独立 unit-test workflow。只提交该现有要求的最小增量。
- `settings-surface`：i18n locale 要求原文写明由 `src/common/i18n/locales.spec.ts` 守护；该测试按本变更删除，因此只删去这句守护说明，locale 结构与 key 集合要求本身不变。（实施时发现并补充。）

`translation-core`、`structured-output`、`llm-provider-config`、`settings-surface`、`text-to-speech` 等运行时产品行为仍须成立；减少自动化覆盖不等于放宽行为要求，不新增测试能力规格。

## Impact

实施范围：`src/**/*.spec.*`、`src-tauri/src/{config,fetch,edge_tts}.rs` 的测试区块、`e2e/`、`playwright.config.ts`、`vite.config.ts`、`package.json`、`pnpm-lock.yaml`、`.github/workflows/{unit-test.yaml,playwright.yml,lint.yaml}`、`AGENTS.md`、`README.md`、`README-CN.md` 和 `docs/release-github-actions-secrets.md` 的 workflow 基线说明，以及上述交付规格增量。只在新 E2E 无法通过可访问名称定位真实操作时，允许为对应控件补充语义标签；不改生产业务逻辑，不新增通用测试框架。

本轮只编写动议，不删除或改写测试实现。基于当前 `refactor/simplify-codebase` 分支，不新建分支或 worktree；不改写现有 `simplify-codebase` 动议的完成记录，也不把其尚未完成的平台手验算作本动议已完成。
