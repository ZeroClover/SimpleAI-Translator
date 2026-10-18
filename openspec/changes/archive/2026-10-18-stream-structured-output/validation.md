# Proposal validation

日期：2026-10-18（Asia/Singapore）。这是提案的依据与自检记录，不代表尚未实现的流式预览/fallback 已通过应用验收。

## 本地自检

- `openspec validate stream-structured-output --strict`：通过；proposal/design/specs/tasks 四类规划产物齐备，实施任务保持未勾选。
- 现有代码基线：`pnpm test` 225/225；`pnpm test:e2e` 18/18（Chromium 和 updater WebKit）。这不是 Firefox/Tauri 的新功能实测。
- `pnpm lint`（经 `rtk bypass` 原样运行）、直接运行项目 ESLint（`node node_modules/eslint/bin/eslint.js 'src/**/*.{ts,tsx}' --cache`）与 `node node_modules/typescript/bin/tsc --noEmit`：通过。首次工具包装输出涉及范围外的生成 JS 文件；绕过包装执行 package.json 中的原始检查后通过。
- 本变更只增加 OpenSpec 文档；未改运行时代码或现行主规格，归档时才合并 delta。

## 真实网关探测

使用用户授权的 `https://inference.api.zeroclover.io/v1`，通过 1Password 引用临时读取密钥，仅发送合成文本。密钥未写入文件、日志或审查提示。使用标准 HTTP 请求消费真实 SSE/JSON envelope，没有调用或修改现有 Engine，因此结果仅证明上游格式与设计假设。

首批 22 次：9 个模型、5 个供应商家族，句子 strict 模式，每行模型均测试 `stream=true` 和 `stream=false`，全部成功解析有效 JSON，包含中文、引号与 emoji。这里的供应商身份依据网关模型 ID，不声称核验了网关后台部署。

| 协议 | 模型 | 请求数 | 结果 |
| --- | --- | ---: | --- |
| Chat Completions | gpt-6-astra、gpt-6-luna | 4 | 4 成功 |
| Chat Completions | gemini-4-argon、gemini-3.5-flash-lite | 4 | 4 成功 |
| Chat Completions | deepseek-flash | 2 | 2 成功 |
| Chat Completions | doubao-seed-2.0-pro、doubao-seed-2.0-mini | 4 | 4 成功 |
| Responses | gpt-6-astra、gpt-6-luna | 4 | 4 成功 |
| Anthropic Messages | claude-opus-5-5、claude-haiku-5-5 | 4 | 4 成功 |

第二批 32 次：

- 24 次单词/短词组探测：直接读取当前 `translate.ts` 的 schema 常量；Chat 使用 gpt-6-luna / gemini-3.5-flash-lite，Responses 使用 gpt-6-astra / gpt-6-luna，Messages 使用 claude-opus-5-5 / claude-haiku-5-5；每个模型 × 两种模式 × 两种传输均成功。检查 JSON 解析、所需字段/类型及额外字段，Anthropic schema 按现有规则移除数组数量约束。
- 6 次 Chat `json_object` 探测：gpt-6-luna、gemini-3.5-flash-lite、deepseek-flash × 两种传输，全部成功。
- 2 次 Responses `json_object` 探测：gpt-6-luna × 两种传输均返回 HTTP 400，错误明确要求 `input` 中包含 “json”；本次仅 `instructions` 含 JSON 约束，而源文本为 “Good morning!”。

以上 54 次探测中，52 次得到有效结构化结果，2 次是相同的输入约束错误，均非流式能力错误。随后追加 2 次对照请求，源文本改为 “The JSON file is ready.”，Responses `json_object` 的两种传输均成功，进一步确认该限制来自 input 检查。总计 56 次：54 次有效 JSON，2 次明确的 HTTP 400。

该错误在两种传输中一致，证明不能把所有 400 或结构化请求失败都判为不支持流式。它是当前 Responses prompt/input 组合的独立限制，本提案不向源文本注入额外指令来绕过它，也不改变 schema 或严格开关。探测提示只用于协议验证，并未完整复刻应用翻译 prompt；对照请求结果保留了源文本边界标记，故不能用于宣称翻译质量或应用 prompt 已通过验收。

SSE 响应实际媒体类型为 `text/event-stream; charset=utf-8`，普通响应为 `application/json`。首批流式正文分片为 2–27 个，单词/短词组可达 181 个；这支持展示渐进译文的设计。Responses 网关可在 `response.completed` 后再发送 `[DONE]`，终结后的迟到事件必须被忽略。

## 验收边界

没有观测到真实网关明确拒绝流式，因此未声称自动 fallback 已在真实端点得到验证；`stream=false` 是独立协议探测，不是已实现的自动重试。能力拒绝、畸形 JSON、取消竞争、跨 UTF-8 字节分片和中途断流必须在实施阶段用确定性测试验证，任务清单已包含这些场景。当前成功率也不证明任意兼容端点会执行 strict schema，或能省略最终本地 JSON 检查。

## 独立审查

使用当前 workspace 的专用 herdr session `simpleai-structured-output-review`，不使用 default。向四位审查者逐字发送原始需求及补充测试要求，要求只读独立核对规格、设计、任务、现有代码和验收边界，不实施功能或访问凭据。

| Harness | 模型与推理档位 | 最新结论 |
| --- | --- | --- |
| Pi | zero-aicoding-codex / gpt-6-astra，high | 无异议，可实施 |
| Antigravity | gemini-4-argon-high，high | 无异议，可实施 |
| Claude Code CLI | claude-fable-5-1，high | 无异议，可实施 |
| Pi | deepseek / deepseek-flash，max | 无异议，可实施 |

独立核实并完成的修订：

1. Astra 指出扩展后台消息桥丢失 Content-Type；核对发送端与重建 Response 的代码后，补齐设计、影响范围、任务及经过真实消息桥的验收。相关 userscript 媒体类型/完整 body 读取也纳入必要适配；Astra 复核无异议。
2. 实测宽容解析器在半个 Unicode 代理对处可能成功返回孤立高位代理项；补齐预览暂缓显示该尾部字符的规则与测试，保持原文和最终校验不变。Astra、Argon 及 DeepSeek 均认可修订。
3. DeepSeek 指出协议通用错误规则与能力 fallback 场景存在歧义；核对后明确 Chat error envelope 优先于空 choices 忽略、Responses/Anthropic 能力错误优先于终态错误，并同步旧场景与任务。
4. DeepSeek 指出缺失单词语种时现有 formatter 输出空 `[]` 与文档“省略缺失字段”冲突；本地执行确认后明确四种语种/音标组合版式，并补齐合法最终空结果清除旧预览、不缓存/保存的规则。三位已完成增量复核的审查者均无异议。
5. Fable 指出新增非核心字段类型失败不属于流式支持的必要范围；本地执行确认现有 formatter 会忽略这些值后，收窄为 JSON 完整性、根对象和既有核心内容检查，其余值只作安全投影，不进行逐字段 schema 校验。未接受“strict 下本地检查永远不会触发”的论据：自定义端点和实际接收数据仍需边界检查。该取舍已同步规格、设计与任务，四位审查者对最终版本均明确回复“无异议，可实施”。

审核结束后，四个 Harness 均正常退出，`herdr agent list` 确认为空；随后停止并删除该专用 session，工具分别确认 `stopped: true` 与 `deleted: true`。本次探测结果临时文件及审查 Harness 创建的临时 plan 文件已清理。

## 实施验证

日期：2026-10-18（Asia/Singapore）。以下为实现完成后的本地验收，区别于上文的提案期协议探测。

### 已执行

- `pnpm test`：19 个文件、437 项通过（基线 225）。新增 `engines/interfaces.spec.ts`（格式化、终态校验、预览拆分、代理对、能力拒绝判定）、`protocols/structured.spec.ts`（三协议 × 三模式、fallback、完整响应、终态顺序）、`protocols/transport.spec.ts`（引擎经真实 `fetchSSE`）、`polyfills/userscript.spec.ts`（两种 GM 响应模式），并扩展 `utils.fetch.spec.ts`（浏览器与桌面事件路径）与 `background/fetch.spec.ts`（经真实后台监听器的消息桥）。
- `pnpm test:e2e`：24 项通过（Chromium 与 updater WebKit）。新增场景运行真实 `translate()` 与 OpenAI Chat 引擎，只模拟桌面 `fetch_stream` IPC 与非流式 fetch：生成中可读预览、仅一次 fallback（请求体除 `stream` 外一致）、最终校验失败提示、停止后保留部分文本，以及仅成功结果进入缓存与 IndexedDB 历史。
- `pnpm lint`、`pnpm exec tsc --noEmit`：通过。
- `cargo test`（`src-tauri`）：新增 4 项 UTF-8 跨块解码测试通过；`cargo clippy` 无新增警告。
- `vite build`：chromium、firefox、tauri renderer、userscript 四个目标均构建成功。
- 变异检查：去掉“已收到内容禁止 fallback”或“仅 400/422/501”条件后，`structured.spec.ts` 分别有 6 与 15 项失败；去掉后台桥的 headers 透传后，桥接测试失败。
- `openspec validate stream-structured-output --strict`：通过。

### 平台范围与未验证项

- Chrome/Firefox：经真实后台监听器与重建 Response 的单测覆盖媒体类型透传；未在真实 Firefox 浏览器内对上游端点运行结构化翻译。
- Tauri：前端事件路径经单测与 e2e（模拟 IPC）覆盖，Rust 解码经单测覆盖；未在打包的桌面应用中对真实端点运行。
- Userscript：适配器经模拟 GM 单测覆盖；未在油猴扩展中实测。
- 真实网关无法稳定制造的流式拒绝、取消竞争、畸形 JSON 与错误体分片已作为确定性模拟测试保留（任务 5.3）；下面的真实网关结果只证明应用对真实 envelope 的处理，不证明 fallback 在真实端点触发过。

### 真实网关实测（任务 5.2）

使用用户授权的 `https://inference.api.zeroclover.io/v1`，密钥经 `op read 'op://Private/Zero AI Gateway API Key/credential'`（1Password 桌面程序提供）直接注入单个测试进程，未写入文件或日志。临时 vitest 用例调用真实 `translate()`（完整应用 prompt、schema 与三协议引擎、真实 `fetchSSE`），仅把网络 fetch 指向 Node `fetch`；`stream=false` 行通过在请求体中改写 `stream` 获得真实 `application/json` envelope，经直接 JSON 响应路径解码。临时用例与结果文件已删除。

8 个模型 × 3 种模式 × 2 种传输，句子模式另测 strict 关闭，共 64 例。所有用例均满足：每个请求恰好一次终结回调、预览中无 JSON 片段、最终快照先于完成回调、每次逻辑请求只有 1 次 POST（无误触发 fallback）。

| 协议 | 模型 | 结果 |
| --- | --- | --- |
| Chat | gpt-6-luna、gemini-3.5-flash-lite | 16/16 成功；流式预览 1–226 次 |
| Chat | deepseek-flash | 句子 4/4 成功；单词 2 例为合法空结果（stop，不缓存），短词组 2 例报“missing translation options” |
| Chat | doubao-seed-2.0-mini | 句子 4/4 成功；单词流式为合法空结果，单词非流式为网关 554，短词组 2 例报“missing translation options” |
| Responses | gpt-6-astra、gpt-6-luna | strict 12/12 成功；`json_object`（strict 关）4 例 HTTP 400 |
| Anthropic | claude-opus-5-5、claude-haiku-5-5 | 16/16 成功 |

失败原因核对（未更换模型）：

- deepseek-flash 与 doubao 在该网关的 Chat 路由上未执行 json_schema，原始响应使用自拟中文键（如 `单词`、`translations`）。应用按规格处理：单词对象无可用字段时为合法空结果，短词组缺少 `options` 报校验错误。属于模型/网关对 schema 的遵从问题，不是传输或格式化缺陷。
- doubao 的 554 为网关上游 `internal_server_error`，非流式能力错误，未触发 fallback。
- Responses `json_object` 的 400 与提案期探测相同：要求 `input` 含 “json”，与传输无关，未触发 fallback；本变更不改 prompt。
