# no-telemetry Specification

## Purpose
保证 SimpleAI Translator 不包含任何遥测、统计或分析 SDK 与开关,只向用户配置或功能所需的端点发起网络请求,并由 CI grep 守卫防止遥测与旧身份字符串回流。
## Requirements
### Requirement: 应用不向第三方遥测域名发起任何网络请求

SimpleAI Translator 桌面端、浏览器扩展、以及任何前端入口 MUST NOT 向以下类别的域名发起任何 HTTP/HTTPS/WebSocket 请求:

- Sentry(`*.sentry.io` / `*.ingest.sentry.io`)
- Google Analytics / GA4 / Google Tag Manager(`*.google-analytics.com` / `*.googletagmanager.com` / `*.analytics.google.com`)
- Aptabase(`*.aptabase.com` / `*.aptabase.io`)
- 其它通用遥测/分析平台(PostHog、Mixpanel、Umami、Plausible、Heap、Amplitude 等)

应用发起的对外网络请求 SHALL 限于:
- 用户在 Provider 配置中录入的 LLM 协议 endpoint(endpoint 留空时为协议默认的 `https://api.openai.com/v1` 或 `https://api.anthropic.com`),包括模型列表请求
- 当前 TTS provider 所需的 endpoint:Edge TTS(`speech.platform.bing.com`,含 TTS provider 为 `edge` 时打开设置页触发的 voice 列表请求),或 OpenAI TTS 所引用 Provider 的 endpoint
- 用户选择远端语言检测引擎时对应的 endpoint:`google` → `translate.google.com`;`baidu` → `fanyi.baidu.com`;`bing` → `edge.microsoft.com` 与 `api-edge.cognitive.microsofttranslator.com`
- 用户在桌面端代理设置中点击测试时的 `https://api.ip.sb/geoip`
- Tauri updater 当前配置的 endpoint

#### Scenario: 启动后无被动遥测请求

- **WHEN** 用户首次启动 SimpleAI Translator 桌面端,首次打开浏览器扩展 popup,且未触发任何翻译/朗读
- **AND** 在 60 秒静置窗口内通过 OS 网络抓包工具(macOS `nettop` / Wireshark)观察该进程出站连接
- **THEN** SHALL NOT 观察到任何指向 sentry.io / google-analytics.com / googletagmanager.com / aptabase.com / aptabase.io 的连接

#### Scenario: 浏览器扩展 manifest host permissions 收敛

- **WHEN** 检查 `src/browser-extension/manifest.ts` 生成的 manifest `host_permissions` 与 `permissions`
- **THEN** SHALL NOT 包含 `https://*.ingest.sentry.io/*`
- **AND** SHALL NOT 包含 `https://*.googletagmanager.com/*`
- **AND** SHALL NOT 包含 `https://*.google-analytics.com/*`
- **AND** SHALL NOT 包含 `https://*.aptabase.com/*` / `https://*.aptabase.io/*`
- **AND** SHALL NOT 包含 `https://chat.openai.com/*`

#### Scenario: 不做 IP 地区检测

- **WHEN** 用户打开翻译界面,无论默认 Provider 是否指向 OpenAI 官方 endpoint
- **THEN** 应用 SHALL NOT 请求 `https://chat.openai.com/cdn-cgi/trace` 或其它 IP 地理位置服务
- **AND** 唯一的 IP 地理位置请求 SHALL 是用户在桌面端代理设置中点击测试时的 `https://api.ip.sb/geoip`

### Requirement: 无 Sentry 集成

应用 MUST NOT 包含 `@sentry/react`、`@sentry/browser`、`@sentry/tracing`、`sentry-tauri` 等任何 Sentry SDK。

具体:
- `package.json` 的 `dependencies` 与 `devDependencies` SHALL NOT 列出 `@sentry/*` 任一包
- `src/common/analysis.ts` SHALL NOT 存在
- 仓库中 SHALL NOT 出现 `Sentry.init`、`Sentry.captureException`、`Sentry.captureMessage`、`SentryReact.ErrorBoundary` 等调用
- 仓库中 SHALL NOT 出现 Sentry DSN 字符串 `https://477519542bd6491cb347ca3f55fcdce6@o441417.ingest.sentry.io/4505051776090112`

#### Scenario: package.json 不含 Sentry

- **WHEN** 在 `package.json` 中搜索字符串 `@sentry`
- **THEN** SHALL NOT 命中

#### Scenario: 源码无 Sentry 引用

- **WHEN** 在 `src/` 与 `src-tauri/` 下搜索 `Sentry\.` / `from '@sentry/` / `from "@sentry/`
- **THEN** SHALL NOT 命中

#### Scenario: 旧 DSN 字符串不存在

- **WHEN** 在仓库中搜索 `o441417.ingest.sentry.io` 或 `477519542bd6491cb347ca3f55fcdce6`
- **THEN** SHALL NOT 命中(`openspec/` 下的提案、设计与归档文档除外)

### Requirement: 无 Google Analytics 集成

应用 MUST NOT 包含 `react-ga4`、`react-ga`、`gtag.js` 或任何 Google Analytics 客户端 SDK。

具体:
- `package.json` 的 `dependencies` 与 `devDependencies` SHALL NOT 列出 `react-ga4` 或 `react-ga`
- 仓库中 SHALL NOT 出现 `ReactGA.initialize` / `ReactGA.send` / `ReactGA.event` 等调用
- 仓库中 SHALL NOT 出现 GA tracking ID 字符串 `G-D7054DX333`
- HTML 入口 SHALL NOT 内联或动态注入 `gtag.js` / `googletagmanager.com` 脚本

#### Scenario: package.json 不含 GA 包

- **WHEN** 在 `package.json` 中搜索 `react-ga4` / `react-ga`
- **THEN** SHALL NOT 命中

#### Scenario: 旧 GA ID 不存在

- **WHEN** 在仓库中搜索 `G-D7054DX333`
- **THEN** SHALL NOT 命中(`openspec/` 下的提案、设计与归档文档除外)

### Requirement: 无 Aptabase 集成

应用 MUST NOT 包含 `@aptabase/tauri`、`@aptabase/react`、`tauri-plugin-aptabase` 任一 SDK。

具体:
- `package.json` 的 `dependencies` 与 `devDependencies` SHALL NOT 列出 `@aptabase/*`
- `src-tauri/Cargo.toml` 的 `dependencies` SHALL NOT 列出 `tauri-plugin-aptabase`
- 仓库中 SHALL NOT 出现 `import { trackEvent } from '@aptabase/tauri'` 等等价 import
- 仓库中 SHALL NOT 出现 `trackEvent("..." , ...)`、`app.track_event(...)`、`EventTracker` trait 引用
- 仓库中 SHALL NOT 出现 Aptabase key 字符串 `A-US-9856842764`

#### Scenario: 依赖清单不含 Aptabase

- **WHEN** 检查 `package.json` 与 `src-tauri/Cargo.toml`
- **THEN** 两者 SHALL NOT 出现 `aptabase`(大小写不敏感)

#### Scenario: 调用点不存在

- **WHEN** 在 `src/` 与 `src-tauri/src/` 下搜索 `track_event\|trackEvent\|EventTracker\|tauri_plugin_aptabase`
- **THEN** SHALL NOT 命中

### Requirement: 无统计开关 UI 与存储字段

应用 MUST NOT 暴露"是否启用统计/遥测"的用户开关,因为应用本身不提供任何统计/遥测能力。

具体:
- `ISettings` 接口 SHALL NOT 包含 `disableCollectingStatistics` / `analyticsEnabled` / `telemetryEnabled` 等字段
- `Settings.tsx` SHALL NOT 渲染对应 FormItem
- i18n locale 文件 SHALL NOT 包含 `Disable collecting statistics` / `禁用统计` 等 key

#### Scenario: 设置 UI 无统计开关

- **WHEN** 用户在桌面端打开 Settings → 任一 tab
- **THEN** UI SHALL NOT 渲染任何文案为"禁用统计 / Disable collecting statistics / Disable analytics"的开关或 checkbox

#### Scenario: 类型字段不存在

- **WHEN** 在 `src/common/types.ts` 中检查 `ISettings`
- **THEN** SHALL NOT 包含 `disableCollectingStatistics` 字段

### Requirement: CI grep 守卫

仓库 SHALL 提供以下 grep 守卫脚本,并 SHALL 在 `.github/workflows/lint.yaml` 的 `rebrand-guards` job 中对推送到 `main` 与以 `main` 为目标的 PR 运行;任一脚本命中时 SHALL 以非零退出码使该 job 失败。两个脚本也 SHALL 通过 `pnpm check:no-telemetry` 与 `pnpm check:no-old-identity` 在本地运行。

1. **Telemetry 残留检查**(`scripts/check-no-telemetry.sh`):对 `src/`、`src-tauri/src/`、`src-tauri/capabilities/`、`src-tauri/gen/schemas/`、`package.json`、`pnpm-lock.yaml`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src/browser-extension/manifest.ts` 中 git 跟踪的文件,用 `git grep -i -E` 搜索 `sentry|aptabase|googletagmanager|google-analytics|react-ga|@sentry|@aptabase`,命中数 SHALL 为 0。
2. **旧标识残留检查**(`scripts/check-no-old-identity.sh`):对 `src/`、`src-tauri/src/`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/`、`package.json`、`src/browser-extension/manifest.ts` 中 git 跟踪的文件,用 `git grep -i -E` 搜索 `yetone|nextai-translator|NextAI Translator|openai-translator|xyz\.yetone`,排除包含 `github.com/nextai-translator/nextai-translator` 的行后,命中数 SHALL 为 0。

不在守卫范围内的内容:
- `openspec/` 下的提案、设计、tasks 与归档文档
- `README.md` / `README-CN.md`、`.github/release-notes/` 等文档
- 包含 `github.com/nextai-translator/nextai-translator` 仓库 URL 的行(如 `package.json.repository.url`、设置页下载/安装说明链接)
- 第三方依赖目录(`node_modules/`、`src-tauri/target/`)

#### Scenario: CI 守卫在引入残留时失败

- **WHEN** 推送到 `main` 或以 `main` 为目标的 PR 在守卫范围内引入新的 Sentry / GA / Aptabase 引用或旧标识字符串
- **THEN** `rebrand-guards` job SHALL 失败

#### Scenario: 主分支零命中

- **WHEN** 在主分支上运行 `scripts/check-no-telemetry.sh` 与 `scripts/check-no-old-identity.sh`
- **THEN** 两脚本 SHALL 以退出码 0 结束
