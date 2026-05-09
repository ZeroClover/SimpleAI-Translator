# no-telemetry Specification

## Purpose
TBD - created by archiving change simpleai-translator-rebrand. Update Purpose after archive.
## Requirements
### Requirement: 应用不向第三方遥测域名发起任何网络请求

SimpleAI Translator 桌面端、浏览器扩展、以及任何前端入口 MUST NOT 向以下类别的域名发起任何 HTTP/HTTPS/WebSocket 请求:

- Sentry(`*.sentry.io` / `*.ingest.sentry.io`)
- Google Analytics / GA4 / Google Tag Manager(`*.google-analytics.com` / `*.googletagmanager.com` / `*.analytics.google.com`)
- Aptabase(`*.aptabase.com` / `*.aptabase.io`)
- 其它通用遥测/分析平台(PostHog、Mixpanel、Umami、Plausible、Heap、Amplitude 等)

应用允许的对外网络请求 SHALL 限于:
- 用户在 Provider 配置中显式录入的 LLM 协议 endpoint
- 用户在 TTS 设置中显式选择的 TTS endpoint(Edge TTS 或 OpenAI TTS via 用户配置的 Provider 凭据)
- 用户开启可选远端语言检测引擎(`google` / `baidu` / `bing`)时对应的 endpoint
- Tauri updater 当前配置的 endpoint(本变更不要求修改其远程仓库 URL)

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

### Requirement: 删除 Sentry 集成

应用 MUST NOT 引入 `@sentry/react`、`@sentry/browser`、`@sentry/tracing` 或 `sentry-tauri` 等任何 Sentry SDK。

具体:
- `package.json` 的 `dependencies` 与 `devDependencies` SHALL NOT 列出 `@sentry/*` 任一包
- `src/common/analysis.ts` SHALL 整文件删除
- 仓库中 SHALL NOT 出现任何 `Sentry.init`、`Sentry.captureException`、`Sentry.captureMessage`、`SentryReact.ErrorBoundary` 等调用
- 仓库中 SHALL NOT 出现 Sentry DSN 字符串 `https://477519542bd6491cb347ca3f55fcdce6@o441417.ingest.sentry.io/4505051776090112`

#### Scenario: package.json 不含 Sentry

- **WHEN** 在 `package.json` 中搜索字符串 `@sentry`
- **THEN** SHALL NOT 命中

#### Scenario: 源码无 Sentry 引用

- **WHEN** 在 `src/` 与 `src-tauri/` 下搜索 `Sentry\.` / `from '@sentry/` / `from "@sentry/`
- **THEN** SHALL NOT 命中

#### Scenario: 旧 DSN 字符串不存在

- **WHEN** 在仓库中搜索 `o441417.ingest.sentry.io` 或 `477519542bd6491cb347ca3f55fcdce6`
- **THEN** SHALL NOT 命中(允许 `openspec/changes/**` 提案/设计文档中作为历史背景出现)

### Requirement: 删除 Google Analytics 集成

应用 MUST NOT 引入 `react-ga4`、`react-ga`、`gtag.js` 或任何 Google Analytics 客户端 SDK。

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
- **THEN** SHALL NOT 命中(允许 `openspec/changes/**` 中作为历史背景)

### Requirement: 删除 Aptabase 集成

应用 MUST NOT 引入 `@aptabase/tauri`、`@aptabase/react`、`tauri-plugin-aptabase` 任一 SDK。

具体:
- `package.json` 的 `dependencies` 与 `devDependencies` SHALL NOT 列出 `@aptabase/*`
- `src-tauri/Cargo.toml` 的 `dependencies` SHALL NOT 列出 `tauri-plugin-aptabase`
- 仓库中 SHALL NOT 出现 `import { trackEvent } from '@aptabase/tauri'` 等等价 import
- 仓库中 SHALL NOT 出现 `trackEvent("..." , ...)`、`app.track_event(...)`、`EventTracker` trait 引用
- 仓库中 SHALL NOT 出现 Aptabase key 字符串 `A-US-9856842764`

#### Scenario: 依赖清单不含 Aptabase

- **WHEN** 检查 `package.json` 与 `src-tauri/Cargo.toml`
- **THEN** 两者 SHALL NOT 出现 `aptabase`(大小写不敏感)

#### Scenario: 调用点全部移除

- **WHEN** 在 `src/` 与 `src-tauri/src/` 下搜索 `track_event\|trackEvent\|EventTracker\|tauri_plugin_aptabase`
- **THEN** SHALL NOT 命中

### Requirement: 删除统计开关 UI 与存储字段

应用 MUST NOT 暴露"是否启用统计/遥测"的用户开关,因为应用本身不提供任何统计/遥测能力。

具体:
- `ISettings` 接口 SHALL NOT 包含 `disableCollectingStatistics` / `analyticsEnabled` / `telemetryEnabled` 等字段
- `Settings.tsx` SHALL NOT 渲染对应 FormItem
- 所有 i18n locale 文件 SHALL 删除 `disable collecting statistics` / `Disable collecting statistics` / `禁用统计` 等 key

#### Scenario: 设置 UI 无统计开关

- **WHEN** 用户在桌面端打开 Settings → 任一 tab
- **THEN** UI SHALL NOT 渲染任何文案为"禁用统计 / Disable collecting statistics / Disable analytics"的开关或 checkbox

#### Scenario: 类型字段不存在

- **WHEN** 在 `src/common/types.ts` 中检查 `ISettings`
- **THEN** SHALL NOT 包含 `disableCollectingStatistics` 字段

### Requirement: CI grep 守卫

仓库 SHALL 在持续集成中包含以下 grep 守卫脚本(或等价检查),并把任意一项失败配置为合并阻塞条件:

1. **Telemetry 残留检查**:在 `src/`、`src-tauri/src/`、`src-tauri/capabilities/`、`src-tauri/gen/schemas/`、`package.json`、`pnpm-lock.yaml`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src/browser-extension/manifest.ts` 中搜索 `sentry|aptabase|googletagmanager|google-analytics|react-ga|@sentry|@aptabase`(大小写不敏感),命中数 SHALL 为 0。
2. **旧标识残留检查**:在 `src/`、`src-tauri/src/`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/`、`package.json`、`src/browser-extension/manifest.ts` 中搜索 `yetone|nextai-translator|NextAI Translator|openai-translator|xyz\.yetone`(大小写不敏感),命中数 SHALL 为 0,但 `package.json.repository.url`、Tauri updater endpoint URL、浏览器插件所有者/签名身份字段除外。

允许的例外:
- `openspec/changes/**` 路径下的提案、设计、tasks 文档(本次提案/变更档案本身需要提及历史标识/SDK 名)
- `README.md` / `README-CN.md` 中显式标注为"历史 / 升级说明 / 曾用名"的段落,允许命中但需要 PR 中说明
- `package.json.repository.url`、Tauri updater endpoint URL、浏览器插件 Firefox/Chrome 所有者或签名身份字段,因为它们不属于本变更范围
- 第三方依赖目录(`node_modules/`、`src-tauri/target/`),不在 grep 范围内

#### Scenario: CI 守卫脚本存在并失败时阻塞

- **WHEN** 任意 PR 引入新的 Sentry / GA / Aptabase 引用或旧标识字符串
- **THEN** CI grep 守卫 SHALL 报错并阻塞合并

#### Scenario: 主分支零命中

- **WHEN** 在主分支上运行 `scripts/check-no-telemetry.sh` 与 `scripts/check-no-old-identity.sh`(或等价 npm/cargo script)
- **THEN** 两脚本 SHALL 以退出码 0 结束

