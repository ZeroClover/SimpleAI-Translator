# Design

## Context

动机见 [proposal.md](proposal.md)。盘点基于本分支当前代码（2026-10-19）：

| 范围 | 基线 | 观察 |
| --- | --- | --- |
| `src/**/*.spec.*` | 19 文件、5,766 行、458 个展开测试 | `pnpm test` 全部通过；问题是覆盖选择及维护成本，不是当前失败率或运行速度 |
| `e2e/` | 4 个 spec、3 个辅助文件，共 1,320 行 | `playwright test --list` 为 46 项：translator 27、index 7、titlebar 2、updater 5 × 2 浏览器 |
| Rust 测试 | `config.rs` 4、`fetch.rs` 6、`edge_tts.rs` 11，共 21 | 有真实文件/套接字边界测试，也有纯函数/模拟重试测试，不能只按语言或 `#[test]` 名称判断价值 |
| CI | `unit-test.yaml` 跑 Vitest，`playwright.yml` 跑 Chromium + updater WebKit | Rust 当前只有 clippy/rustfmt 等检查，未运行上述原生测试 |

`e2e/translator.spec.ts` 的 `openTranslator` 替换业务模块 `translate.ts`，`openEngineTranslator` 替换 `universal-fetch.ts`；前者绕过引擎，后者绕过桌面适配层。`e2e/index.spec.ts` 通过 CDP 数 `storage.sync.get` 次数，耦合实现。updater 还绑定 `docs/releases/1.3.0.md` 的具体条目数。

## Goals / Non-Goals

**Goals:**

- 删除重复、内部实现、旧兼容路径和第三方库细节测试，把自动化集中在会导致无法翻译、错误持久化、数据丢失或主动内容执行的回归上。
- 必要前端验证通过用户操作进入真实业务链路；每项都有具体失败后果和明确测试边界。
- 数量与维护代码一起缩减：Vitest 归零，Playwright 最多 16 项，Rust 固定保留 4 项；新 `e2e/` 全部文本文件（含 fixture、配置辅助与数据）总行数不超过 1,000。

**Non-Goals:**

- 不逐条迁移现有 458 个测试，不追求行覆盖率或所有协议 × 模型 × 错误 × 显示选项的笛卡尔积。
- 不新增桌面驱动、跨平台自动化矩阵、测试 DSL、通用 mock 服务框架或新测试依赖。
- 不修改运行时产品行为、提示词、API 契约或旧动议/归档中的历史验收记录；仅以最小交付规格增量同步已删除的 workflow，并在实施时补充 `settings-surface` 的最小增量，删去指向已删 `locales.spec.ts` 的守护说明；不新增测试能力规格。规划阶段实施任务全部未勾选，实施记录见 validation.md。

## Decisions

### 1. 按风险删减，不按测试框架改名

前端现有 19 文件全部删除。表中 E 编号指下一节的替代用户流程；列出替代流程只表示保留该风险的代表覆盖，**不表示逐条复刻旧断言**。未列入 E 流程的用例直接删除，不另建快照、脚本断言、浏览器内函数测试或手工全量回归清单。

| 现有文件（相对 `src/common/`） | 去留与理由 |
| --- | --- |
| `translate.spec.ts` | 删除提示词逐句匹配、缓存 key/参数透传枚举、旧配置检查；源文角色隔离和真实协议请求进入 E1–E3，缓存/重试进入 E7 |
| `utils.spec.ts` | 删除归一化对象形状、旧 Azure/OpenAI/defaultTargetLanguage 字段及读写次数断言；有效设置持久化/旧快照保护进入 E1、E9、E10 |
| `engines/protocols/protocols.spec.ts` | 删除 mock `fetchSSE` 的全模型矩阵及格式化重复；三个协议正常用户结果进入 E1–E3，代表失败进入 E12 |
| `engines/protocols/structured.spec.ts` | 删除三协议重复错误/字段类型/状态码排列；预览、一次 fallback、严格失败进入 E2–E5 |
| `engines/protocols/transport.spec.ts` | 删除与 `utils.fetch`、协议测试重复的终结回调计数；真实 decoder/reader 由 E2、E4–E6 经过 |
| `engines/protocols/anthropic.spec.ts` | 删除分页游标异常枚举；模型列表可供选择由 E1 代表覆盖，Anthropic 分页不另造 E2E |
| `engines/interfaces.spec.ts` | 删除格式字符串、空字段与 parser 组合枚举；E2/E3 观察可读预览，E5 观察失败不保存 |
| `engines/thinking-filter.spec.ts` | 删除标签大小写/嵌套的独立测试；E2 携带一个跨 chunk thinking 标签，验证其不进入译文 |
| `engines/model-filter.spec.ts` | 删除模型名单/自然排序与正则分支枚举；E1 通过模型刷新和选择观察结果 |
| `openai-api-path.spec.ts` | 删除路径输入排列；E1 使用带自定义前缀的 Endpoint 并核对真实请求 URL |
| `utils.fetch.spec.ts` | 删除 fetch 返回值/异常类型和消费者实现测试；E2 的跨字节内容、E4 的完整错误体、E6 的取消覆盖代表风险 |
| `background/fetch.spec.ts` | 删除模拟 port/permission 对象的调用断言；E13 走真实扩展后台和 HTTP，权限 UI 边界见第 3 节 |
| `polyfills/tauri.spec.ts` | 删除 IPC 参数/异常类型矩阵；E1–E12 经过真实 `tauriFetch` 与存储适配器，原生连接和磁盘另有 R1–R4 |
| `lang/index.spec.ts` | 删除检测服务参数和所有语言映射枚举；E1 使用真实本地检测，在线检测服务失败退回的分支不另加 E2E |
| `tts/index.spec.ts` | 删除 slot/release 回调内部测试；E11 通过用户朗读/停止验证可见状态与中断 |
| `tts/openai-tts.spec.ts` | 删除音色列表、速度映射、分段阈值和错误文案排列；E11 验证真实朗读请求与播放，E10 验证失效 Provider 处理 |
| `tts/edge-tts.spec.ts` | 删除模拟 AudioContext、模块导入、定时器和命令透传断言；真实原生 Edge 朗读做限定平台手验，不以 OpenAI 朗读代称 Edge 已覆盖 |
| `components/MarkdownResult.spec.tsx` | 删除第三方 CommonMark DOM 字符串验证；主动内容不执行、原文复制与显示切换进入 E8 |
| `i18n/locales.spec.ts` | 删除固定六种语言/全 key 集合测试，不迁移到 E2E 或另写扫描脚本；实际使用文案随保留的中英文流程验证 |

保留极少量纯函数测试虽便宜，但会继续保留整套 Vitest/jsdom 和旧断言入口；本方案选择整体移除前端单测工具链。简单映射或库行为的覆盖损失是有意接受的取舍。

### 2. E2E 的唯一保留清单与数量预算

以下每行是一个独立 Playwright 测试，共 16 项。E1–E12 只在 Chromium 跑桌面 renderer，E13–E14 只在 Chromium 跑实际构建的扩展，E15–E16 只在 WebKit 跑 updater renderer。配置用明确的 `testMatch`/`testIgnore` 避免 updater 在 Chromium 重跑。浏览器、参数化行、循环生成的用例均计入总量；不通过把独立案例藏进一个 `test()` 来规避上限。不新增永久计数守卫脚本，以 `--list` 和代码审查核验。

| ID | 保留流程与核心验收 | 现有 E2E 的处置 |
| --- | --- | --- |
| E1 | 从空配置添加 OpenAI Chat Provider、自定义 Endpoint、刷新选择模型并保存，重载后通过输入框提交；Shift+Enter/组合态 Enter 不提交，普通 Enter 发出真实请求并显示译文；请求源文逐字进入 user 边界而不进入 system，本地检测给出具体语言 | 重写 `Enter submits…`；删除独立 options/popup 可见性冒烟，接受这两个扩展入口挂载不再自动覆盖，E1 不替代其平台覆盖 |
| E2 | OpenAI Responses 的结构化句子流：部分译文先出现，跨 UTF-8 字节/标签边界的内容最终正确且不显示 thinking/JSON；成功历史保存完整文本；核对 `instructions/input` 隔离及 schema/effort 所在字段 | 重写 `structured output previews…`；删除单独 `streaming flushes…` 和四格 structured × Markdown 矩阵 |
| E3 | Anthropic 的结构化单词流：增量可读、最终有词义/例句；输出控制通过原生字段发送，源文只在 user，schema 与 effort 不互相覆盖 | 新增一个协议用户流程，替代该协议大量单测；不再复制 E2 的全部异常场景 |
| E4 | OpenAI Chat 结构化请求在任何内容前被明确拒绝 streaming；完整错误体收齐后只发一次 `stream:false` 请求，显示有效最终译文并保存 | 保留 `structured output falls back once…` 的用户结果，重写边界 mock；核对两次请求除 stream 外相同 |
| E5 | 已有结构化预览后流关闭但 JSON 未完成：保留预览、错误可见、加载结束、无自动请求；历史中没有这次失败，用户再提交仍发请求 | 合并 `a failed request…` 与 `structured output shows a validation error…`；删除仅靠回调制造空最终快照的独立案例 |
| E6 | 用户停止正在输出的请求后提交新文本：部分结果可保留和复制，迟到的旧数据不覆盖新结果；停止那次不进入历史/缓存，IPC 收到取消 | 合并 `stopping structured output…`、`an old stream…` 和停止/失败显示矩阵中停止分支，删除手动调用完成回调 |
| E7 | 成功结果重复提交命中缓存，用户从真实历史 UI 恢复后不发请求，再点击重试发请求并继续编辑提交 | 重写 `restoring the same history…`、`cache hits, history restores and retries…`；历史复制提示并入此流程，不单列 toast 测试 |
| E8 | 对正在输出的 Markdown 结果切换显示并复制：原文/空白一致、请求不重启；含 HTML/图片/链接的内容不执行、不导航、不加载资源；在一个最小支持宽度下复制和开关可达 | 合并 Markdown stream/copy、narrowest window；删除 CommonMark 全语法、主题、RTL 和 structured 开关矩阵 |
| E9 | 两个真实 renderer 页面共享配置边界：一个页面保留旧设置表单，另一个页面改变 Markdown/当前模型；旧页修改字号并保存后重载，新的模型/偏好仍保留且字号更新 | 合并 preference persists、model switch keeps settings、settings saves only changed fields；删 write 次数、颜色值和每个 checkbox 枚举 |
| E10 | 在设置中删除 OpenAI TTS 当前关联的 Provider，保存后立即验证回退提示；随后重载，通过设置 UI 验证 Edge 已持久化且其他 Provider 仍可用 | 保留删除关联 Provider 的代表流程；协议改为 Anthropic、未关联删除和另一窗口 TTS 改动的独立案例删除，接受这些分支不单独自动化 |
| E11 | 使用关联 Provider 点击朗读，真实 OpenAI TTS 请求取得有效音频后进入播放，点击停止退出播放且不继续后续分段 | 新增最小朗读流程；替代前端 TTS 内部调用/释放测试，不复制音色和模型输入限制矩阵 |
| E12 | 翻译收到 HTTP 401：显示上游可读错误、结束加载、不自动切换 Provider/重试、不保存；用户更正凭据后可再次成功提交 | 从协议错误单测抽取一个实际失败/恢复流程，其他 HTTP 状态与拒答组合不扩为 E2E |
| E13 | 构建的 Chromium 扩展在本地 HTTP 页面中选词不自动开卡片，显式打开后经真实后台获取结构化完整 JSON 并显示译文，shadow-root 内语言选择可用、logo 能加载 | 合并 index 中选词、显式打开、Select、logo 检查；完整 JSON 不二次请求；不把注入 open-translator 消息说成原生右键菜单点击覆盖 |
| E14 | 扩展卡片固定后点击外部仍可见，取消固定后外部点击关闭，重新打开后关闭按钮可关闭 | 合并 titlebar 的 pin/unpin 与 close；只观察卡片生命周期，删除 CDP storage 读取次数测试 |
| E15 | 一个窄 viewport 中长更新说明可读到底，更新/关闭操作可达、无横向溢出 | updater 两个尺寸缩为一个，不读固定版本发布文件；去掉第三方 Markdown 节点/像素偏移的细节断言 |
| E16 | updater 首次检查无更新时退出 checking，显示当前版本状态且无更新按钮 | 合并 fresh check 和 cached no update 的重复用户结果，保留首次检查路径 |

E1 的 Provider 管理必须通过真实 UI；E2–E8、E11–E12 可以在存储边界放置最小初始配置以缩短准备过程。E2/E3 核对一组代表输出控制字段，不重复所有模型族。E9 的另一窗口更新要经 UI 写入，不再直接修改测试对象冒充用户操作。

### 3. 测试边界与实现约束

- **桌面 renderer**：继续用现有 Vite renderer 与 `@tauri-apps/api/mocks`，在入口加载前装配 `mockWindows`/`mockIPC`。删除拦截 `translate.ts`、`universal-fetch.ts` 等业务模块的 route。`translate`、engine、`fetchSSE`、`tauriFetch`、settings adapter、IndexedDB 均运行真实实现。网络在原生 `fetch`/`fetch_cancel` IPC 边界提供确定的响应头、原始字节与 Channel 消息；不直接调用翻译 `onMessage/onFinish`。已安装 Tauri mocks 的 invoke handler 会收到 Channel 对象，可按真实 Channel 消息语义投递数据，E2 以字节而不是完整 JS 字符串拆分中文。
- **持久化与窗口**：复用现有 config-file mock 的合并语义，并按 browser context 共享给两个页面；结果必须经重新加载的 UI 观察。测试可只读 IndexedDB 来证明错误/取消没有保存，但不能替换 history service，也不能调用业务函数填造成功记录。E7 通过历史 UI 触发恢复；桌面窗口创建/跨窗口事件可在 IPC 边界做最小路由，不能用测试直接发 history:restore 代替点击。
- **扩展**：沿用 persistent Chromium fixture，加载新构建产物；保留真实 service worker、port bridge 和存储。将 `file:` 测试页改为本地 HTTP fixture，用测试进程的 `node:http` 在随机 loopback 端口提供固定响应，避免 `page.route` 对 service worker 请求的拦截盲区。必要服务只放在 fixture 中，不做独立框架；测试后关闭连接、server、context。允许沿用显式 open-translator 消息作为浏览器原生菜单边界，须在结果中注明。
- **权限与 CORS**：E13 的内容脚本不能使用 `permissions` API，当前 `ensureHostPermission` 在此处直接返回；后台再执行真实 fetch。测试不假定 loopback host permission 已授予，也不用 `context.grantPermissions` 冒充扩展授权。`node:http` fixture 应答 OPTIONS 预检，允许测试 origin、POST 方法及实际的 Authorization/Content-Type 等请求头，并在真实响应上返回 CORS 头；涉及浏览器本地网络预检时一并正确响应。E13 验证这条真实后台网络链路能取得结果，不宣称覆盖授权 UI。不改 manifest 或 mock permission API；真实权限拒绝/接受及 Firefox user gesture 差异仍做一次有限手验。
- **音频**：E11 从 IPC fetch 边界返回一个小型有效音频 fixture，使用真实 TTS 与浏览器播放 API；以播放/停止状态及边界请求为验收，不断言声音内容或 AudioContext 内部释放次数。若音频 fixture 无法解码应修 fixture，不替换整个 TTS/播放器来让测试通过。
- **独立性**：每项使用新的页面/context、存储及网络状态，不共享测试结果、不要求执行顺序、不使用真实 API key 或在线服务。stream 测试用收到首块/取消的事件同步，禁止依赖固定 sleep；定位优先 role/label，必要时只补被测操作的可访问名称。

不选择为每个函数重新封装浏览器 runner，也不建立真实收费模型验收；前者只是搬家，后者不稳定且无法控制失败场景。这里的 renderer 流程验证前端到 IPC 的端到端行为，不是 Tauri 原生进程 E2E。

### 4. Rust 仅保留真实边界的四项例外

| ID | 文件 / 保留测试 | 不能由上述 E2E 替代的理由 |
| --- | --- | --- |
| R1 | `fetch.rs::cancelling_a_paused_body_closes_the_connection` | 实际 loopback 服务观察正文暂停时 TCP 连接关闭；浏览器 IPC mock 只能证明发送取消 |
| R2 | `fetch.rs::cancelling_while_waiting_for_the_response_head_closes_the_connection` | 与 R1 不同的挂起阶段，验证 native fetch 在响应头前也终止连接；将现有固定 200ms sleep 改为服务端已收到请求的同步信号 |
| R3 | `config.rs::preserve_invalid_config_before_recovery` | 真磁盘上的损坏内容备份，涉及不可恢复的用户配置丢失；五个输入缩为两种：有效 UTF-8 的截断 JSON、截断多字节字符。两者分别经过 JSON 校验失败和 UTF-8 解码失败路径，均验证原始字节备份，不枚举所有坏编码 |
| R4 | `config.rs::keep_every_key_from_concurrent_updates` | 同一进程内 Mutex 串行化读改写及临时文件原子重命名，JS config mock 不能验证；保留一个线程并发案例，不声称覆盖跨进程文件锁 |

删除 `fetch.rs` 其余 4 项（预取消、完整 body、错误响应、网络错误）。R1 已经通过真实 fetch 验证 200 响应头和第一段正文，再观察连接关闭；本次重点保留资源泄漏和数据丢失的额外保护。明确接受正常 EOF 与非 2xx 正文透传等 native 分支不再独立自动验证的风险：E1/E4/E6/E12 只覆盖 IPC 之上的前端结果，不能替代这些 native 分支。测试是否跨真实边界只是保留的必要条件，不意味着所有边界测试都必须保留。删除 `config.rs` 的代理构造和有效/缺失配置两项。删除 `edge_tts.rs` 全部 11 项及仅由它们使用的测试 helper/import，尤其两条模拟 closure 的重试测试不被误列为真实网络测试。Edge 握手、系统时钟及音频设备的风险转为下述有限手验，不新增 native 测试基建；Sec-MS-GEC 固定向量与帧解析契约的持续自动回归覆盖也明确放弃，不声称手验覆盖全部协议分支。

四项保留测试仍可位于原有 `#[cfg(test)]` 模块，不为改名为 integration test 搬动生产接口。采用实际系统边界作为保留理由，不把这四项包装成 UI E2E。

### 5. 工具链同步与验收

- 删除 `vite.config.ts`（仅供 Vitest）、直接 devDependencies `vitest`/`jsdom`、`scripts.test`、`.github/workflows/unit-test.yaml`；用 pnpm 更新 lockfile，保留运行时 Vite 和 `vite.config.tauri.ts`。更新 `README.md`、`README-CN.md`、`AGENTS.md` 的旧命令，核对 tsconfig/eslint 的实际测试专用引用；不改 OpenSpec 历史记录。
- 现有 `desktop-release-automation` 的 action baseline 场景仍显式枚举 unit-test workflow。本变更提交该要求的最小 MODIFIED delta，改为覆盖当前存在的 workflow；`docs/release-github-actions-secrets.md` 说明单独 unit-test workflow 已删除，保留过去已核验的 action 版本事实。本次不升级 action refs，不改变 release/test-build 的触发、权限、updater endpoint 或资产组装。
- `pnpm test:e2e` 保持为唯一前端测试命令，不留 `pnpm test` 转发别名。`playwright.yml` 继续安装 Chromium/WebKit、构建 Chromium 扩展、运行全套清单；配置 `retries: 0`，失败直接报告，不用重试掩盖不稳定。
- 在现有 `lint.yaml` 的 Linux Rust job 中，依赖已安装后增加一次 `cargo test --manifest-path src-tauri/Cargo.toml`；不建新的 OS matrix。四项原生保留风险应进入 CI，避免只有 clippy 编译而从不执行。
- 更新 `AGENTS.md` 的命令与 Testing Guidelines：按用户风险维护上述少量流程，新测试须说明哪个现有流程不能捕捉该回归；不得自动要求为纯函数或简单界面改动补单测。不改变运行时产品 specs。
- 实施验收：Vitest 文件/直接依赖/CI/命令归零；Playwright 展开总数 ≤16 且无 skip/fixme/only；Rust 只剩 R1–R4；`e2e/` 文本总行数 ≤1,000（所有 helper 和 fixture 数据都算，不得移出目录藏代码、压行或扩大单个场景规避）。这使前端测试文本从 7,086 行至少减少约 86%，也比旧 E2E 1,320 行更少。数量为上限，不是必须凑满的目标。
- 运行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build-browser-extension`、`pnpm build-tauri-renderer`、`pnpm test:e2e --retries=0`、上述 Cargo 命令，以及现有两个 identity/telemetry grep guard；不引入覆盖率阈值、性能仪表盘或重复运行矩阵。
- 只做一次与删减边界有关的手验：当前可用桌面平台上 Edge/系统朗读及停止；Firefox 上选词后显式开卡片、Select 和自定义端点权限接受/拒绝；记录平台和实际结果。不可用平台必须标记未验证，不许用 Chromium/IPC mock 推导通过，也不把全部已删单测转为人工任务。

## Risks / Trade-offs

- [减少模型/格式/错误分支覆盖] → 保留三协议真实请求流程、结构化成功/失败、一次 fallback、缓存/历史和停止；细粒度模型名单、分页边界、词组版式、音色和在线检测映射不再自动枚举，相关产品规格仍生效。
- [renderer mock 无法证明 Rust/OS 行为] → R1–R4 守住连接释放与磁盘数据；有限手验检查实际朗读和扩展权限，明确未覆盖 Edge 403 握手与所有操作系统组合，不新增庞大替代框架。
- [E2E 因异步/UI 易不稳定] → 严格限制为 16 项、确定的边界 fixture、事件同步及语义定位；单轮零重试通过，不能靠延迟、重试或跳过完成验收。
- [压缩数量却膨胀场景与 helper] → 同时约束用例和总文本行数，按单一用户意图划分场景；若实现无法在预算内表达上述流程，先删重复断言/准备逻辑，不能静默降低核心验收或编写测试 DSL。
- [旧动议仍提及被删测试] → `simplify-codebase` 和 archive 是历史过程记录，保留原样；当前 AGENTS/开发说明改用新命令，两项原有待办平台手验仍维持原状态。

## Migration Plan

1. 复核基线及去留表；先在现有 Playwright 内实现 E1–E16 的最小边界设施和流程，替换旧 E2E，不并存两套 harness。
2. 每组核心流程通过后删除对应单元测试，删除余下低价值测试及 17 个 Rust 测试；保留 R1–R4 并同步 CI。
3. 移除 Vitest 工具链并更新文档，执行零重试清单、类型/lint/构建与有限平台手验，记录数量、文本体积、实际平台覆盖。
4. 本次为开发工具更改，无用户数据迁移。若实施失败，修复对应 fixture/流程再验收；需要回退时回退实施提交，不恢复一套长期兼容测试入口。
