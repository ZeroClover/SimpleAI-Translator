# 动议验收与审查记录

## 范围

本节至“审查资源释放”为动议阶段（2026-10-19）的记录，当时实施尚未开始、`tasks.md` 全部未勾选。实施于同日完成，证据见文末“实施记录”：除 5.3 平台手验外全部勾选。当前分支为 `refactor/simplify-codebase`，未创建分支或 worktree。

## 基线检查（2026-10-19）

- `pnpm test`：19 个文件、458 个测试全部通过。本次执行用于确认基线，不代表计划中的替代 E2E 已实现。
- `pnpm exec playwright test --list`：46 项，4 个 spec；本轮未运行浏览器测试，未声称它们通过。
- 文件盘点：19 个前端 spec 共 5,766 行；e2e 4 个 spec 与 3 个辅助文件共 1,320 行；Rust 静态盘点 21 项（config 4、fetch 6、edge_tts 11），本轮未执行 Cargo 测试。文本行数按 `str.splitlines()` 的逻辑行计算，包含没有末尾换行的最后一行；`e2e/test.html` 没有末尾换行，因此 `wc -l` 的换行符总数为 1,319，两者口径不同。
- 已核对当前测试实现、Playwright/Vitest 配置、测试 CI、真实传输适配器及本地安装的 Tauri mock API；动议列出全部前端 spec、全部 E2E 的分类处置与原生保留例外。

## 动议自检

- 只改变本动议目录；产品实现、现有测试、产品 specs 和 `simplify-codebase` 待办未改。
- proposal/design/tasks 的范围一致：19 个前端文件删除、E2E ≤16 项且文本 ≤1,000 行、原生保留 R1–R4；删除不是一对一迁移。
- 不变更运行时产品行为；交付规格原文仍枚举 unit-test workflow，因此已增加 `desktop-release-automation` 的最小 MODIFIED delta，删除 `skip_specs` 标记。规格全文保持原要求，仅把 action baseline 的范围改为当前存在的 workflow。
- 实施任务带验证方式，前置替代流程后删除旧覆盖；当前任务全部未完成，避免把动议验收混作实施验收。
- `openspec validate streamline-test-suite --strict` 通过；`openspec status --change streamline-test-suite` 为 4/4 规划产物完成；19 项实施任务全部未勾选。新增文件逐行检查无尾随空白，git 状态仅包含本动议目录。

## 独立审查

使用已有且未运行的 `simpleai-translator` 命名 herdr session，启动后确认没有 workspace 或 Agent，再为 `/Volumes/Git/SimpleAI-Translator` 创建 `test-suite-review` workspace。未使用 default。四位 Agent 均收到原始用户完整要求及独立只读审查任务，并核验了启动时的模型与推理档位：

| Harness | 模型 | 推理 | 最终复核 |
| --- | --- | --- | --- |
| Pi | `zero-aicoding-codex/gpt-6-astra` | high | 无异议，可进入实施 |
| Antigravity | `gemini-4-argon-high`（Gemini 4 Argon） | high | 无异议，可进入实施 |
| Pi | `zero-aicoding-claude/claude-fable-5-1` | high | 无异议，可进入实施；已再次确认逻辑行统计口径 |
| Pi | `ollama-cloud/deepseek-v4.1-flash:1017` | max | 无剩余实质异议，接受明确的覆盖取舍 |

首轮意见经代码核实后的处理：

- 修正 E10 toast 时序：保存后看提示，重载只检查持久化；精简 E11 为播放中停止及终止后续分段。
- 补足 E13 可执行的 CORS/预检 fixture 机制，取消无来源的“已授予 host permission”假设；权限 UI 仍明确不在自动化覆盖内。
- R3 从五个样例缩为截断 JSON、非法 UTF-8 两种，分别守住不同的失败路径；R4 纠正为进程内 Mutex 与原子重命名，不声称跨进程文件锁。
- 修正 E1 无法覆盖扩展 popup/options 入口的表述；把 `translate.spec.ts` 删除移至 E7 通过后；点名两份 README 的命令更新。
- 对已有交付规格中 unit-test workflow 的枚举增加最小 delta，保持运行时行为及历史验收原样。
- 未采纳再保留 native 完整正文/错误体与 Edge token/帧解析四项测试的扩张建议：R1 已覆盖真实响应头及首段正文，计划明确接受 EOF/错误体与 Edge 契约不再持续自动化的风险，不能声称 renderer IPC mock 替代这些分支。该取舍已交给提出意见的 Agent 复核。

四位 Agent 已对修订后的同一版完整动议完成复核，全部无剩余异议。DeepSeek 的非阻断实施提醒一并保留：E11 要用确实会分段的输入证明停止后没有下一段请求；R2 的同步修正限于测试代码，不改生产取消路径。Fable 指出的行数差异经其再次核对后确认只是换行符与逻辑行统计口径不同。

## 审查资源释放

- 三个 Pi Harness 和 Antigravity Harness 均已退出回到 shell；`herdr --session simpleai-translator agent list` 返回空列表。
- 本次创建的 `test-suite-review` workspace 已关闭。
- `herdr session stop simpleai-translator --json` 返回 `stopped: true`、`running: false`；随后 session 清单再次确认该 session 未运行，headless server 进程已正常退出。未操作 default 或其他 workspace/session。

以上为动议与审查的完成记录，后续实施证据应另行追加，不将本轮基线测试结果计作新方案已通过。

# 实施记录（2026-10-19）

以下为实施证据，与上方动议阶段的基线和审查分开记录。实施在 `refactor/simplify-codebase` 分支的工作区完成，未提交、未新建分支或 worktree。

## 1.1 实施基线复核

- 19 个前端 spec 文件与 design 去留表逐一对应，`wc -l` 合计 5,766 行；`e2e/` 原有 4 个 spec 与 `common.ts`、`fixtures.ts`、`test.html` 三个辅助文件，`playwright test --list` 为 46 项；Rust 为 `config.rs` 4、`fetch.rs` 6、`edge_tts.rs` 11，共 21 项。
- 仓库内（排除 `node_modules`、`dist`、`target` 与 `.claude/worktrees` 下他人的 worktree）没有 `__snapshots__`、`*.snap`、`*.test.*`、`__tests__` 或 `src-tauri/tests`，没有漏列的测试目录或快照。
- 与 design 的差异：`openspec/specs/settings-surface/spec.md` 的 i18n locale 要求写明"该约束由 `src/common/i18n/locales.spec.ts` 测试守护"。按 design 删除该测试后这句不再成立，因此新增 `specs/settings-surface/spec.md` 的 MODIFIED delta，只删去这句守护说明，locale 与 key 集合要求不变；proposal 的 Modified Capabilities 已注明。
- 实施中发现的产品现状（未改动生产行为）：扩展卡片打开后只填入选中文字，需要用户提交才会翻译，E13 因此在卡片里按 Enter；保存修改后的 Provider 会自动用新配置重发当前文本，E12 以这次请求验证恢复，而不是再按一次 Enter。

## 实施内容

- 桌面 renderer：`e2e/desktop.ts` 只在入口前装配官方 `mockWindows`/`mockIPC`。`fetch` 命令把请求挂起，测试给出响应头后通过 `__TAURI_INTERNALS__.runCallback` 按 Channel 的 `{ index, message }` 语义投递 `ArrayBuffer` 正文和 `{ done: true }`；`fetch_cancel` 记录取消；配置文件按 browser context 共享并按 `update_config` 的合并语义写入；`plugin:event|*` 在页面内分发，并把 emit 转发给同一 context 的其它窗口。`translate`、引擎、`fetchSSE`、`tauriFetch`、设置适配器和 IndexedDB 均运行真实实现；没有拦截 `translate.ts`/`universal-fetch.ts`，没有调用翻译回调，也没有直接 emit `history:restore` 或写入历史假数据（E7 在真实历史窗口点击 Restore）。
- 扩展：`e2e/extension.spec.ts` 内联 persistent Chromium fixture，加载 `dist/browser-extension/chromium`，并用 `node:http` 在随机 loopback 端口提供测试页和 OpenAI 兼容端点，测试结束关闭连接、server 和 context。卡片通过与右键菜单相同的 `open-translator` 消息打开，未覆盖原生菜单点击。E13 的 Provider 由后台 `chrome.storage.sync.set` 写入存储边界：扩展卡片没有设置表单，Provider 的 UI 管理已由 E1 覆盖，E13 验收的是后台网络链路与卡片显示。实测（Chromium 156）：未授予该 origin 的 host permission（`chrome.permissions.contains` 为 `false`），后台请求不发预检；去掉响应 CORS 头后 E13 仍通过。fixture 仍应答 OPTIONS（含本地网络预检头）并在响应上加 CORS 头，不依赖这一宽松行为；权限 UI 不在自动化覆盖内。
- updater：E15 单个 320×400 viewport，不读取 `docs/releases/*.md`；E16 为首次检查无更新。
- 生产源码只增加被测操作所需的可访问名称：Stop、结果区 Retry、复制、朗读（`role=button`、`aria-label`、`aria-pressed`）、设置/返回切换、删除 Provider、历史 Restore/复制。
- Playwright 配置为 `desktop`、`extension`（Chromium）和 `updater`（WebKit）三个 project，以 `testMatch` 限定文件，`retries: 0`。
- Rust：保留 R1–R4。R2 的 200ms sleep 改为服务端读完请求后发出的信号；R3 输入缩为截断 JSON 和截断多字节字符两种，分别验证原始字节备份；删除其余 17 项及仅被其使用的 `json` helper、`proxy_config` helper，`edge_tts.rs` 测试模块整体删除。生产代码未改。
- 工具链：删除 `vite.config.ts`、`vitest`/`jsdom` 直接依赖、`scripts.test`、`.github/workflows/unit-test.yaml`，`pnpm remove` 更新 lockfile（仅删除条目）；`tsconfig.json` 的 `vite.config*.ts` 仍匹配运行时 `vite.config.tauri.ts`，eslint 配置无 Vitest 引用，均无需修改。`lint.yaml` 的 Linux clippy job 在 clippy 后增加 `cargo test --manifest-path ./src-tauri/Cargo.toml`，复用该 job 已安装的系统依赖，不新增 OS 矩阵。`playwright.yml` 未改：仍安装 Chromium/WebKit、先 `wxt build -b chromium` 再跑完整清单。README、README-CN、AGENTS 和 `docs/release-github-actions-secrets.md` 已更新；未改 action refs、权限、release/test-build 触发、updater endpoint 或资产组装。旧动议与归档记录未改。

## 5.1 数量与体积

| 项 | 实施前 | 实施后 |
| --- | --- | --- |
| 前端单测（Vitest） | 19 文件 / 5,766 行 / 458 测试 | 0（无文件、依赖、命令、CI） |
| Playwright 展开项 | 46 | 16（desktop 12、extension 2、updater 2） |
| `e2e/` 全部文本行数 | 1,320 逻辑行（`wc -l` 1,319） | 821（`desktop.spec.ts` 441、`desktop.ts` 161、`extension.spec.ts` 166、`updater.spec.ts` 53；`wc -l` 与 `splitlines()` 均为 821） |
| 前端测试文本合计 | 7,086 | 821（减少约 88.4%） |
| Rust 测试 | 21 | 4（R1–R4） |

人工核对：E1–E16 每项一个 `test()`，没有循环生成或参数化行；`e2e/` 与配置中没有 `skip`/`fixme`/`only`/`waitForTimeout`；没有把 helper 移出 `e2e/`（扩展 fixture 已并入 spec，旧 `fixtures.ts`/`common.ts`/`test.html` 删除）；Prettier 格式化，未压行。

## 5.2 命令结果

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | 通过 |
| `pnpm exec tsc --noEmit` | 通过（`tsconfig` 包含 `e2e/`） |
| `pnpm exec eslint e2e playwright.config.ts` | 通过（不在 `pnpm lint` 范围内，额外检查） |
| `pnpm build-browser-extension` | 通过 |
| `pnpm build-tauri-renderer` | 通过 |
| `CI=1 pnpm test:e2e --retries=0` | 16 passed，首次运行即通过 |
| `pnpm exec playwright test --list` | `Total: 16 tests in 3 files` |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 4 passed，仅 R1–R4 |
| `cargo clippy --manifest-path ./src-tauri/Cargo.toml --all-targets -- -D warnings` | 通过 |
| `cargo fmt --manifest-path ./src-tauri/Cargo.toml --all -- --check` | 通过 |
| `pnpm check:no-telemetry` / `pnpm check:no-old-identity` | 通过 |
| `pnpm install --frozen-lockfile` | 通过 |
| `actionlint .github/workflows/*` | 修改过的 `lint.yaml` 与 `playwright.yml` 无问题；唯一报告是未改动的 `release.yaml:221` 既有 shellcheck SC2046 警告 |
| `openspec validate streamline-test-suite --strict` | valid |

稳定性自检（不作为验收）：实施中 `--repeat-each=3` 时 E12 失败一次，原因是保存 Provider 自动重发的请求与测试多按的 Enter 竞争；改为等待那次请求后，`--repeat-each=4` 64/64 通过。自检中还发现 E1 的 `English` 断言在提交前就成立、不能证明本地检测，改为提交日文并检查提交后出现的 `日本語`；以及设置面板与隐藏的翻译面板会同时渲染模型名，点击已限定在设置容器内。修正后 desktop project `--repeat-each=6`（6 workers 并行）72/72 通过，`CI=1 pnpm test:e2e --retries=0` 16 passed。

## 5.3 平台手验

未执行，保持未勾选。本次实施由 Agent 在无人值守的终端会话中完成，没有对桌面应用和 Firefox 进行人工图形界面操作：

- 当前桌面平台（macOS）Edge 朗读与停止、系统朗读与停止：未验证。
- Firefox 选词后显式开卡片、卡片内 Select、自定义端点权限接受与拒绝：未验证。

这些不能由 Chromium 或 IPC mock 的结果推导。`simplify-codebase` 动议遗留的平台手验同样维持原状。

## 覆盖边界

- 桌面 renderer 流程验证前端到 IPC 的行为，不是 Tauri 原生进程 E2E；Rust/OS 侧仅由 R1–R4 覆盖连接关闭与配置文件数据保护，正常 EOF、非 2xx 正文透传、Edge TTS 握手与帧解析没有原生自动化测试。
- 扩展测试覆盖真实后台网络链路和卡片生命周期，不覆盖原生右键菜单点击、host permission 授权 UI 或 Firefox。

## 实施审查

在已有且未运行的 `simpleai-translator` 命名 herdr session 中启动 server，确认无 workspace、无 Agent 后为本仓库创建 `test-suite-impl-review` workspace（未使用 default）。四位 Agent 均收到原始用户要求与只读审查说明（`review-brief.md`），启动后核对了模型与推理档位：Pi `zero-aicoding-codex/gpt-6-astra` high、Antigravity `Gemini 4 Argon` high、Pi `zero-aicoding-claude/claude-fable-5-1` high、Pi `ollama-cloud/deepseek-v4.1-flash:1017` max。

第一轮意见经核实后的处理：

- Astra（阻断）：E11 只看按钮状态，若 Stop 不再中止播放也能通过。属实，补充只记录 `HTMLMediaElement.play` 调用而不改变播放的 init script，等待第二段音频真实播放（`currentTime > 0`）后点停止，验证该音频已暂停且请求数仍为 2。临时删去 `SpeakerIcon` 停止处理中的 `controller.abort()` 后 E11 失败，恢复后通过。
- DeepSeek：E14 未同步异步写入的 `pinned`。属实，`setSettings` 先读后写，外部点击可能读到旧值；恢复旧测试的做法，在外部点击前轮询后台存储中的 `pinned`。design 与 tasks 中两句只提 workflow 增量的文字已补上 `settings-surface` 增量。E13 末尾再断言"只有一次 POST"未采纳：切换目标语言会合法地发起第二次翻译（实测共 2 次 POST），完整 JSON 响应在显示前已结束会话，重复请求只会在显示前发生。
- Fable：均为非阻断。采纳 E9 在保存前确认设置窗口仍显示旧模型 `gpt-5.5`。`pnpm lint` 只覆盖 `src/` 属于范围外，未改；`test-results/` 实际已在 `.gitignore:19`，该条不成立。
- Argon：唯一意见为行数记录需随第一轮修改更新，已更新为 821。另外 `rtk lint` 包装把 `pnpm lint` 改写为整仓 `eslint -f json .`（含 `.claude/worktrees`），审查期间三个此类进程空转约 30 分钟，已终止，均为审查 Agent 的进程。

第一轮修改后复验：`CI=1 pnpm test:e2e --retries=0` 16 passed；`--repeat-each=4` 64 passed；`tsc --noEmit`、`eslint e2e playwright.config.ts`、`openspec validate --strict` 通过。

第二轮：四位 Agent 复核第一轮修改及未采纳理由，均明确无剩余阻断异议，也同意未采纳的三项（E13 末尾再断言单次 POST、扩大 `pnpm lint` 范围、`.gitignore`）。DeepSeek 的唯一可选措辞意见已采纳：`tasks.md` 引言改为"不改运行时产品行为与要求"。Fable 撤回了 `.gitignore` 一条。

审查资源释放：三个 Pi Harness 以 `ctrl+d` 退出，Antigravity 以两次 `ctrl+c` 退出，`herdr --session simpleai-translator agent list` 返回空列表；`test-suite-impl-review` workspace 已关闭；`herdr session stop simpleai-translator --json` 返回 `stopped: true`，session 清单显示 stopped。未操作 default 或其他 session。
