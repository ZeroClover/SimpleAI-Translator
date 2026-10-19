## MODIFIED Requirements

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

- **WHEN** 检查 `wxt.config.ts` 配置并在构建时生成的 Chromium 与 Firefox manifest 的 `host_permissions` 与 `permissions`
- **THEN** SHALL NOT 包含 `https://*.ingest.sentry.io/*`
- **AND** SHALL NOT 包含 `https://*.googletagmanager.com/*`
- **AND** SHALL NOT 包含 `https://*.google-analytics.com/*`
- **AND** SHALL NOT 包含 `https://*.aptabase.com/*` / `https://*.aptabase.io/*`
- **AND** SHALL NOT 包含 `https://chat.openai.com/*`

#### Scenario: 不做 IP 地区检测

- **WHEN** 用户打开翻译界面,无论默认 Provider 是否指向 OpenAI 官方 endpoint
- **THEN** 应用 SHALL NOT 请求 `https://chat.openai.com/cdn-cgi/trace` 或其它 IP 地理位置服务
- **AND** 唯一的 IP 地理位置请求 SHALL 是用户在桌面端代理设置中点击测试时的 `https://api.ip.sb/geoip`


### Requirement: CI grep 守卫

仓库 SHALL 提供以下 grep 守卫脚本,并 SHALL 在 `.github/workflows/lint.yaml` 的 `rebrand-guards` job 中对推送到 `main` 与以 `main` 为目标的 PR 运行;任一脚本命中时 SHALL 以非零退出码使该 job 失败。两个脚本也 SHALL 通过 `pnpm check:no-telemetry` 与 `pnpm check:no-old-identity` 在本地运行。

1. **Telemetry 残留检查**(`scripts/check-no-telemetry.sh`):对 `src/`、`src-tauri/src/`、`src-tauri/capabilities/`、`src-tauri/gen/schemas/`、`package.json`、`pnpm-lock.yaml`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`wxt.config.ts` 中 git 跟踪的文件,用 `git grep -i -E` 搜索 `sentry|aptabase|googletagmanager|google-analytics|react-ga|@sentry|@aptabase`,命中数 SHALL 为 0。
2. **旧标识残留检查**(`scripts/check-no-old-identity.sh`):对 `src/`、`src-tauri/src/`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/`、`package.json`、`wxt.config.ts` 中 git 跟踪的文件,用 `git grep -i -E` 搜索 `yetone|nextai-translator|NextAI Translator|openai-translator|xyz\.yetone`,排除包含 `github.com/nextai-translator/nextai-translator` 的行后,命中数 SHALL 为 0。

两个脚本 SHALL 在路径清单中任一路径不存在或没有被 git 跟踪时以非零退出码失败，使路径清单与仓库结构保持一致，SHALL NOT 静默跳过。

不在守卫范围内的内容:
- `openspec/` 下的提案、设计、tasks 与归档文档
- `README.md` / `README-CN.md`、`.github/release-notes/` 等文档
- 包含 `github.com/nextai-translator/nextai-translator` 仓库 URL 的行(如 `package.json.repository.url`、设置页下载/安装说明链接)
- 第三方依赖目录(`node_modules/`、`src-tauri/target/`)

#### Scenario: CI 守卫在引入残留时失败

- **WHEN** 推送到 `main` 或以 `main` 为目标的 PR 在守卫范围内引入新的 Sentry / GA / Aptabase 引用或旧标识字符串
- **THEN** `rebrand-guards` job SHALL 失败

#### Scenario: 守卫路径失效时失败

- **WHEN** 某个守卫路径被删除或改名，而脚本中的路径清单没有同步更新
- **THEN** 对应脚本 SHALL 以非零退出码失败，并指出失效的路径

#### Scenario: 主分支零命中

- **WHEN** 在主分支上运行 `scripts/check-no-telemetry.sh` 与 `scripts/check-no-old-identity.sh`
- **THEN** 两脚本 SHALL 以退出码 0 结束
