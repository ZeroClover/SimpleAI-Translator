# Tasks

实施已于 2026-10-19 完成，除 5.3 平台手验外全部勾选，证据见 [validation.md](validation.md) 的实施记录。E1–E16、R1–R4 的行为与边界以 [design.md](design.md) 为准；不逐条迁移旧测试，不改运行时产品行为与要求；规格增量仅为 `specs/desktop-release-automation/spec.md`（交付 workflow）与 `specs/settings-surface/spec.md`（删去已删测试的守护说明）。

## 1. 基线与真实边界设施

- [x] 1.1 复核 19 个前端文件、46 项 Playwright、21 项 Rust 与测试文本行数；在本变更的 `validation.md` 追加实施基线及与 design 去留表的差异，验证不存在漏列的测试目录或快照。
- [x] 1.2 收敛桌面 renderer fixture 到官方 Tauri mockIPC/mockWindows 边界，复用真实业务模块、Channel、tauriFetch 和配置存储适配器；先让 E1 的 UI 提交显示真实协议译文，确认没有拦截 translate/universal-fetch、没有调用业务完成回调。
- [x] 1.3 收敛扩展 fixture 为实际 WXT 产物 + 本地 HTTP 页面/响应，沿用真实 service worker 和 port，关闭时释放服务/context；fixture 正确响应预检与 CORS，以 E13 验证完整 JSON 经后台桥接显示且只发送一次 POST，在注释中说明不依赖预授予 host permission 及显式打开消息的覆盖边界。

## 2. 翻译核心流程与对应单测删除

- [x] 2.1 完成 E1–E3：通过 UI 配置/恢复 Chat Provider，覆盖三个协议各一次真实流式翻译、请求中的源文隔离和代表输出控制；E2 验证跨字节内容与成功持久化，E3 验证单词可读结果。零重试跑这些流程后，删除 `openai-api-path.spec.ts`、`engines/model-filter.spec.ts` 和 `engines/protocols/anthropic.spec.ts`；`translate.spec.ts` 等 E7 完成后在 3.1 删除。
- [x] 2.2 完成 E4–E6、E12：一次明确 streaming fallback、结构化失败不保存、停止/旧数据隔离、鉴权失败后用户恢复；验证请求数/结果/历史和取消边界符合 design。通过后删除 `utils.fetch.spec.ts`、`engines/interfaces.spec.ts`、`engines/thinking-filter.spec.ts` 及 `engines/protocols/{protocols,structured,transport}.spec.ts`，删掉被替代的旧 E2E 与 controlled-translate 回调设施。

## 3. 用户操作、设置、扩展与更新窗口

- [x] 3.1 完成 E7、E8：真实历史 UI 恢复/重试，流式 Markdown 切换、原文复制与主动内容安全；零重试验证后删除 `translate.spec.ts`、`MarkdownResult.spec.tsx` 及旧 Markdown/structured 四格、布局/复制重复场景。核对没有以直接 emit history:restore 或写入历史假数据替代被测操作。
- [x] 3.2 完成 E9、E10：两个 renderer 页面通过 UI 操作共享配置，旧表单保存不覆盖新值；删除关联 TTS Provider 后重载可见 Edge 回退。验证后删除 `utils.spec.ts`、`polyfills/tauri.spec.ts` 和旧设置写入次数/checkbox/Provider 回退排列用例。
- [x] 3.3 完成 E11 的真实 OpenAI TTS 朗读与停止，使用小型有效音频 fixture；确认播放状态和真实边界请求，删除 `tts/{index,openai-tts,edge-tts}.spec.ts`。同时删除 `lang/index.spec.ts`、`i18n/locales.spec.ts`，核对 E1 仍使用真实本地语言检测，不新建等价扫描脚本。
- [x] 3.4 完成 E13–E14，合并 index/titlebar 用户流程，删除后台调用计数/CDP 和纯可见性冒烟；用新构建 Chromium 扩展零重试验证，然后删除 `background/fetch.spec.ts`，清理失去调用方的 e2e helper。
- [x] 3.5 将 updater 缩为 E15–E16，仅在 WebKit 执行；删固定 1.3.0 发布文案、重复 viewport 和重复无更新状态测试，配置明确的测试匹配范围及 `retries: 0`。验证 `pnpm exec playwright test --list` 总计不超过 16 项、没有跳过/独占项，E15/E16 零重试通过。
- [x] 3.6 在 `AGENTS.md` 更新前端测试选择原则、fixture 边界与扩展构建前提；核对 design 中 19 个前端文件都已删除，所有 E 流程只保留一处定义，生产源码变动仅限实际需要的可访问标签。

## 4. 原生测试与旧工具链移除

- [x] 4.1 按 design 仅保留 R1–R4，R2 改为请求已抵达的事件同步，R3 输入缩为截断 JSON 与非法 UTF-8 两种代表，分别验证完整字节备份；删除其余 17 项及专用 helper/import。运行 `cargo test --manifest-path src-tauri/Cargo.toml`，确认只有这 4 项测试且全部通过，并检查没有其他位置新增等价测试。
- [x] 4.2 在已有 Linux Rust CI job 中加入上述 Cargo 命令，并在 AGENTS 说明四项例外与覆盖边界；验证 workflow 复用现有系统依赖，命令与本地验证一致，不新增 OS 矩阵。
- [x] 4.3 删除 Vitest/jsdom 直接依赖、专用 `vite.config.ts`、`scripts.test` 和 `unit-test.yaml`；用 pnpm 更新 lockfile，更新 `README.md`、`README-CN.md`、`AGENTS.md` 的旧测试命令并清理 tsconfig/eslint 的实际旧引用。验证 `pnpm install --frozen-lockfile` 可完成，`pnpm test:e2e` 是唯一前端测试入口，运行时 Vite 配置仍在且无旧命令兼容别名；不修改旧 OpenSpec 验收历史。
- [x] 4.4 核对 `playwright.yml` 仍安装所需浏览器、构建最新 Chromium 扩展后跑完整清单；在 `docs/release-github-actions-secrets.md` 说明 workflow 清单变化，与交付规格增量一致。使用可用的 workflow 静态验证工具检查 YAML（不可用则记录限制），检查现有 action refs、权限和 release/test-build 触发、updater endpoint、资产组装未变；验证文档与 scripts、CI 一致，不为本次测试清理升级 actions。

## 5. 整体验收

- [x] 5.1 在 `validation.md` 记录前后数量/文本行数：前端单测归零、Playwright ≤16、Rust 为 R1–R4、e2e 全部文本 ≤1,000 行；人工核对没有移出目录的 helper、隐藏参数矩阵、压行、skip/fixme/only 或生产行为改动，并逐项对应 design 清单。
- [x] 5.2 运行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build-browser-extension`、`pnpm build-tauri-renderer`、`pnpm test:e2e --retries=0`、`cargo test --manifest-path src-tauri/Cargo.toml`、`pnpm check:no-telemetry` 和 `pnpm check:no-old-identity`，记录命令与实际结果；新失败必须解决，不以自动重试通过替代首次通过。
- [ ] 5.3 执行 design 限定的一次平台手验：当前可用桌面平台的 Edge/系统朗读与停止，Firefox 的显式开卡片、Select、自定义端点权限接受/拒绝。记录真实平台和缺失覆盖；不可用环境明确列为未验证，不勾选为全部通过，也不扩成逐项手测已删单测。
- [x] 5.4 运行 `openspec validate streamline-test-suite --strict`，检查完成记录如实区分 renderer、扩展与原生验证；仅包含已声明的交付规格增量，保留运行时产品 specs 及其它动议的状态，确认最终差异仅落在批准的测试清理范围。
