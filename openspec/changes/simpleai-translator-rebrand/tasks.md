## 1. 准备与范围确认

- [x] 1.1 在 `main` 上打 tag `pre-rebrand` 作为回退基线
- [x] 1.2 明确本变更不修改:GitHub 远程仓库 / `package.json.repository.url` / README 远程链接 / Tauri updater endpoint URL / Chrome Web Store 条目 / Firefox AMO owner / Firefox `gecko.id` / Chrome 扩展 ID / 扩展签名身份
- [x] 1.3 用 `git grep -i 'yetone\|nextai\|openai-translator\|NextAI Translator' -- src/ src-tauri/src/ src-tauri/tauri.conf.json src-tauri/capabilities/ package.json src/browser-extension/manifest.ts README.md README-CN.md` 导出残留位置清单;标注 `repository.url`、updater endpoint、扩展签名/owner 字段为本次例外
- [x] 1.4 用 `git grep -i 'sentry\|aptabase\|google-analytics\|googletagmanager\|react-ga\|@sentry\|@aptabase' -- src/ src-tauri/src/ src-tauri/capabilities/ src-tauri/gen/schemas/ package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/Cargo.lock src/browser-extension/manifest.ts` 导出全部遥测引用清单
- [x] 1.5 用 `git grep -nE 'name=.(hotkey|displayWindowHotkey|alwaysShowIcons|autoTranslate|selectInputElementsText|hideTheIconInTheDock|autoHideWindowWhenOutOfFocus|disableCollectingStatistics).' src/common/components/Settings.tsx` 确认所有待删 FormItem 的行号
- [x] 1.6 用 `git grep -i 'react-hotkeys-hook\|useRecordHotkeys\|useHotkeys\b\|hotkeys-js\|browser.commands\|open-popup\|plugin-global-shortcut\|global-shortcut' -- src/ src-tauri/ package.json` 导出快捷键 UI、浏览器插件快捷键、Tauri 快捷键与 capability 残留清单

## 2. 应用身份与可见产品名

- [ ] 2.1 修改 `src-tauri/tauri.conf.json`:`productName` → `"SimpleAI Translator"`、`identifier` → `"io.zeroclover.app.simpleai-translator"`;不要修改 `updater.endpoints`
- [ ] 2.2 修改 `src-tauri/Cargo.toml` 的 `[package]`:确认 `description` 与产品名一致(若为空则填 `SimpleAI Translator desktop application`);`name` 字段与构建脚本耦合,若改动需同步更新 `tauri build` / CI
- [ ] 2.3 修改 `src-tauri/src/windows.rs`:把 `"NextAI Translator"` / `"NextAI Translator History"` / `"NextAI Translator Settings"` / `"NextAI Translator Updater"` 四处字面量改为以 `SimpleAI Translator` 为前缀的对应字符串
- [ ] 2.4 修改 `src/tauri/index.html`、`src/browser-extension/options/index.html`、`src/browser-extension/popup/index.html` 三处 `<title>` 标签
- [ ] 2.5 修改 `package.json` 的 package `name` / `description`;同步处理 legacy Electron `build.appId` / `build.productName` / `build.extraMetadata.name`(若确认 Electron build 块无用,可删除该块);不要修改 `repository.url`
- [ ] 2.6 修改 `src/browser-extension/manifest.ts` 的可见字段:`name` 为 `'SimpleAI Translator'`, `description` 删除 ChatGPT / NextAI 过时措辞;不要修改 Firefox `gecko.id` / `applications.gecko.id`
- [ ] 2.7 修改运行时代码中的产品名展示:`src/browser-extension/background/index.ts` 右键菜单 title、`src/common/components/LogoWithText.tsx`、`src/common/tts/index.ts` welcome 文本、`src/tauri/windows/UpdaterWindow.tsx` header、`Settings.tsx` header;不要修改 GitHub 链接
- [ ] 2.8 在 `pnpm dev-tauri` 启动一次,确认 Dock 图标 / 窗口标题显示新身份;发布构建后再检查 `Info.plist CFBundleIdentifier`

## 3. 命名空间前缀切换

- [ ] 3.1 修改 `src/common/constants.ts` 的 `PREFIX` 为 `'__zeroclover-simpleai-translator'`
- [ ] 3.2 修改 `src/browser-extension/content_script/consts.ts` 中四个 DOM ID(thumb / card / container / inner container)前缀
- [ ] 3.3 修改 `src-tauri/src/main.rs` 的 IPC socket 默认路径 `DEFAULT_IPC_SOCKET_PATH` 为 `"/tmp/simpleai-translator.sock"`
- [ ] 3.4 修改 `src/browser-extension/content_script/index.tsx` 中 JSS `classNamePrefix='__yetone-nextai-translator-jss-'` 为新前缀
- [ ] 3.5 修改自有持久化/样式命名空间:`src/common/internal-services/db.ts` 的 Dexie 数据库名、`src/common/highlight-in-textarea/index.ts` 与 `index.css` 中 `yetone-hit` 类名/ID
- [ ] 3.6 全仓库 `git grep '__yetone-' -- src/ src-tauri/` 应 0 命中(浏览器插件所有者/签名身份字段不属于此 grep)

## 4. 删除从旧 Bundle ID 迁移配置目录的代码

- [ ] 4.1 在 `src-tauri/src/config.rs` 中找到从 `xyz.yetone.apps.openai-translator` → `xyz.yetone.apps.nextai-translator` 的目录复制 / 迁移逻辑(约 line 95–115)
- [ ] 4.2 整段删除该迁移函数与对其的调用;删除任何引用旧 Bundle ID 的常量字符串
- [ ] 4.3 确认应用首次启动时不再读取旧目录(本地手动启动测试:删除新 Bundle ID 数据目录后启动,观察行为)
- [ ] 4.4 `cargo check --manifest-path src-tauri/Cargo.toml` 通过

## 5. 删除快捷键功能

- [ ] 5.1 从 `src/common/types.ts` 的 `ISettings` 接口删除 `hotkey?` 与 `displayWindowHotkey?` 字段
- [ ] 5.2 从 `src/common/utils.ts` 删除上述两个字段在默认值 / 规范化逻辑中的映射
- [ ] 5.3 从 `src-tauri/src/config.rs` 的 `Config` 结构删除 `hotkey` 与 `display_window_hotkey` 字段
- [ ] 5.4 从 `src-tauri/src/tray.rs` 删除菜单项 `MenuItem::with_id(...)` 调用中的 `config.display_window_hotkey` 参数,改为传 `None`
- [ ] 5.5 从 `src-tauri/src/main.rs`(及其它 Tauri 入口)删除任何 `tauri::GlobalShortcutManager` / `tauri-plugin-global-shortcut` 注册逻辑;若 `Cargo.toml` 中存在对应插件依赖,移除之;同步移除 `src-tauri/capabilities/migrated.json` 中 `global-shortcut:*` permissions 并重新生成/更新 `src-tauri/gen/schemas/*`
- [ ] 5.6 从 `src/common/components/Settings.tsx` 删除 `useHotkeyRecorderStyles`、`HotkeyRecorder` 组件、`hotkey` / `displayWindowHotkey` FormItem、`useRecordHotkeys` import 与所有引用
- [ ] 5.7 从 `src/tauri/windows/TranslatorWindow.tsx` 删除 `bindHotkey()` / `bindDisplayWindowHotkey()` 调用与对应 import;若调用所在 effect 仅服务这两个函数,整段删除
- [ ] 5.8 删除 `src/tauri/utils.ts` 中 `bindHotkey` / `bindDisplayWindowHotkey` / `isMissingNormalKey` 等全局快捷键 helper;删除或重写 `src/tauri/utils.spec.ts` 中对应单元测试
- [ ] 5.9 删除浏览器插件快捷键触发链路:`src/browser-extension/content_script/index.tsx` 的 `hotkeys-js` import / `bindHotKey` 函数 / `settings.hotkey` 调用,以及 `src/browser-extension/background/index.ts` 的 `browser.commands.onCommand` 监听;同步移除 manifest `commands`
- [ ] 5.10 若无其它使用,执行 `pnpm remove react-hotkeys-hook hotkeys-js @tauri-apps/plugin-global-shortcut`;若保留任一依赖,在 PR 中说明剩余非快捷键用途
- [ ] 5.11 `pnpm exec tsc --noEmit` 与 `cargo check --manifest-path src-tauri/Cargo.toml` 通过

## 6. 删除 Buy me a coffee / 赞助路径

- [ ] 6.1 从 `Settings.tsx` 删除 `showBuyMeACoffee` 状态、"Buy me a coffee" 按钮 JSX、`buy_me_a_coffee_clicked` 埋点、赞助 Modal、`wechat.png` / `alipay.png` import
- [ ] 6.2 在 `git grep wechat.png alipay.png src/` 确认无其它引用后,删除 `src/common/assets/images/wechat.png` 与 `src/common/assets/images/alipay.png`
- [ ] 6.3 在所有 `src/common/i18n/locales/<lang>/translation.json` 中删除 key:`Buy me a coffee`、与赞助介绍语对应的长句 key

## 7. 删除遥测(Sentry + Google Analytics + Aptabase)

- [ ] 7.1 删除 `src/common/analysis.ts` 整文件
- [ ] 7.2 删除所有 `import { setupAnalysis }` 与对它的调用(当前至少包含 `src/tauri/windows/TranslatorWindow.tsx`;若浏览器插件入口仍有调用也一并删除)
- [ ] 7.3 在 `package.json` 中 `pnpm remove @sentry/react react-ga4 @aptabase/tauri`
- [ ] 7.4 在 `src-tauri/Cargo.toml` 删除 `tauri-plugin-aptabase = "..."` 依赖行;同步更新 `src-tauri/Cargo.lock`
- [ ] 7.5 在 `src-tauri/src/main.rs` 删除 `use tauri_plugin_aptabase::EventTracker;`、Aptabase plugin 初始化、`app.track_event("app_exited", None)` / `app.track_event("app_started", None)`
- [ ] 7.6 在 `src/tauri/windows/HistoryWindow.tsx` / `UpdaterWindow.tsx` / `src/tauri/components/Window.tsx` 删除 `import { trackEvent } from '@aptabase/tauri'` 与所有 `trackEvent(...)` 调用
- [ ] 7.7 在 `Settings.tsx` 删除 `trackTauriEvent` `useCallback` 与所有调用点(`screen_view`、`save_settings`、`buy_me_a_coffee_clicked` 等)
- [ ] 7.8 删除 `ISettings.disableCollectingStatistics` 字段(`src/common/types.ts`)、`src/common/utils.ts` 默认/规范化逻辑与 `Settings.tsx` 对应 FormItem
- [ ] 7.9 在 `src/browser-extension/manifest.ts` 删除 host permissions 中的 `https://*.ingest.sentry.io/*` / `https://*.googletagmanager.com/*` / `https://*.google-analytics.com/*`(与 `*.aptabase.*`,若有)
- [ ] 7.10 在所有 i18n locale 文件删除 `disable collecting statistics` / `Disable collecting statistics` key
- [ ] 7.11 从 `src-tauri/capabilities/migrated.json` 删除 `aptabase:allow-track-event`;重新生成或同步更新 `src-tauri/gen/schemas/*` 中 Aptabase plugin schema 残留
- [ ] 7.12 全仓库 `git grep -i 'sentry\|aptabase\|googletagmanager\|google-analytics\|react-ga\|@sentry\|@aptabase' -- src/ src-tauri/src/ src-tauri/capabilities/ src-tauri/gen/schemas/ package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/Cargo.lock src/browser-extension/manifest.ts` 应 0 命中
- [ ] 7.13 `pnpm install` + `pnpm exec tsc --noEmit` + `cargo check --manifest-path src-tauri/Cargo.toml` 全部通过

## 8. 删除 alwaysShowIcons / autoTranslate / selectInputElementsText / hideTheIconInTheDock / autoHideWindowWhenOutOfFocus

- [ ] 8.1 从 `src/common/types.ts` 的 `ISettings` 删除上述五个字段
- [ ] 8.2 从 `src/common/utils.ts` 默认值 / 规范化逻辑删除上述五个字段对应映射
- [ ] 8.3 从 `Settings.tsx` 删除 `alwaysShowIcons`、`autoTranslate`、`selectInputElementsText`、`hideTheIconInTheDock`、`autoHideWindowWhenOutOfFocus` FormItem;删除 `AutoTranslateCheckbox` 组件(若仅供此处)
- [ ] 8.4 从 `src-tauri/src/config.rs` 删除 `hide_the_icon_in_the_dock: Option<bool>` 字段
- [ ] 8.5 从 `src-tauri/src/main.rs` 删除 `bind_mouse_hook` 中读取 `always_show_icons` 的分支(若该 hook 整体仅服务于此功能,把 hook 安装代码与函数本身整段删除);删除 `set_activation_policy(...)` 中根据 `hide_the_icon_in_the_dock` 切换 Accessory 模式的分支,保留始终 `Regular` 的默认行为
- [ ] 8.6 从 `src/tauri/windows/TranslatorWindow.tsx` 删除失去焦点时隐藏窗口的 effect;从 dependency array 删除 `settings.autoHideWindowWhenOutOfFocus`
- [ ] 8.7 用 `git grep 'settings.autoTranslate' -- src/common/components/Translator.tsx src/browser-extension/content_script` 确认真实读取位置;当前实现的自动翻译分支在浏览器插件 content script 中,若 `Translator.tsx` 无读取则无需改动
- [ ] 8.8 从浏览器插件 content script 删除任何读取 `settings.autoTranslate` / `settings.selectInputElementsText` / `settings.alwaysShowIcons` 的分支与对 input/textarea 的 selection 监听(若有);删除"选中文本即自动翻译/弹浮标"代码路径
- [ ] 8.9 删除桌面端 thumb 浮标链路:若 `bind_mouse_hook` 被整段删除,同步删除 `src-tauri/src/windows.rs` 中 `THUMB_WIN_NAME` / `delete_thumb` / `close_thumb` / `show_thumb` / `get_thumb_window` 等仅服务浮标的代码、`src/tauri/App.tsx` 的 `thumb` window 映射、`src/tauri/windows/ThumbWindow.tsx`,以及仅供该链路使用的依赖(如 `mouce`;`get-selected-text` 若仍被显式命令使用则保留)
- [ ] 8.10 删除所有 i18n locale 中相关 key:`Always show icons` / `Show icon when text is selected` / `Auto Translate` / `Word selection in input` / `Enable word selection for lookup in the input field` / `Hide the icon in the Dock bar` / `Hide the icon in the taskbar` / `Auto hide window when out of focus`
- [ ] 8.11 `pnpm exec tsc --noEmit` + `cargo check --manifest-path src-tauri/Cargo.toml` 通过

## 9. 产品名 i18n 与文档替换

- [ ] 9.1 在所有 `src/common/i18n/locales/<lang>/translation.json` 中,把 value 字符串中的 `NextAI Translator` 替换为 `SimpleAI Translator`
- [ ] 9.2 检查每个 locale 文件 key 集合一致(可用 `jq -r 'keys' file.json | sort` 比较各 locale 文件)
- [ ] 9.3 可更新 `README.md` / `README-CN.md` 的产品名、功能列表与升级说明;不得修改 GitHub 远程 URL、徽章链接或 Releases 链接
- [ ] 9.4 更新 `AGENTS.md` 中的产品名引用、隐私/遥测描述、保留功能清单(若该文件在本仓库需要同步)

## 10. 测试与守卫脚本

- [ ] 10.1 删除引用已删除字段的所有单元测试(`*.spec.ts` / `*.test.ts`):快捷键、Buy me a coffee、autoTranslate、alwaysShowIcons、hideTheIconInTheDock、autoHideWindowWhenOutOfFocus、selectInputElementsText、disableCollectingStatistics、analysis 相关测试
- [ ] 10.2 新增 `scripts/check-no-telemetry.sh`:对 `src/` `src-tauri/src/` `src-tauri/capabilities/` `src-tauri/gen/schemas/` `package.json` `pnpm-lock.yaml` `src-tauri/Cargo.toml` `src-tauri/Cargo.lock` `src/browser-extension/manifest.ts` grep `sentry|aptabase|googletagmanager|google-analytics|react-ga|@sentry|@aptabase`,命中即 exit 1
- [ ] 10.3 新增 `scripts/check-no-old-identity.sh`:检查运行时代码、构建身份字段和自有命名空间中不含 `yetone|nextai-translator|NextAI Translator|openai-translator|xyz\.yetone`;脚本必须排除 `package.json.repository.url`、Tauri updater endpoint URL、README 历史说明、浏览器插件所有者/签名身份字段
- [ ] 10.4 在 `package.json` `scripts` 中加 `"check:no-telemetry"` 与 `"check:no-old-identity"`,并在 CI workflow 中作为合并阻塞 step
- [ ] 10.5 新增/更新一个桌面端集成测试或手动 release checklist:启动后 60 秒内监听 outbound TCP/UDP 连接,确认无指向 sentry.io / google-analytics.com / googletagmanager.com / aptabase.* 的连接(若环境不支持自动化,用 `nettop` 手动验证)
- [ ] 10.6 `pnpm test` 通过

## 11. 构建产物验证

- [ ] 11.1 `pnpm build-tauri` 在本地 macOS 完整构建一次
- [ ] 11.2 `codesign -dv --verbose=4 dist/SimpleAI\ Translator.app` 确认 `Identifier=io.zeroclover.app.simpleai-translator`
- [ ] 11.3 `defaults read /Applications/SimpleAI\ Translator.app/Contents/Info.plist CFBundleName` 返回 `SimpleAI Translator`,`CFBundleIdentifier` 返回新 ID,`CFBundleDisplayName` 返回 `SimpleAI Translator`
- [ ] 11.4 `strings dist/SimpleAI\ Translator.app/Contents/MacOS/<binary> | grep -Ei 'aptabase|sentry|googletagmanager|google-analytics|nextai|yetone|openai-translator'` 应无输出(允许不可控第三方 license/debug symbols 例外)
- [ ] 11.5 `pnpm build-browser-extension` 构建一次,解压输出 zip,`grep -ri 'sentry\|google-analytics\|googletagmanager\|aptabase\|nextai-translator\|yetone' .` 应无输出(license 文件、扩展签名/owner 字段例外);手动检查 `manifest.json` 的 `name` / `description` / `host_permissions`
- [ ] 11.6 在 Chrome 加载未打包扩展、在 Firefox 用 `web-ext run` 加载,验证 popup / options 页 `<title>`、设置面板渲染保留区、选中文字不弹浮标、扩展所有者/ID未被本变更要求修改

## 12. 归档

- [ ] 12.1 在主分支合并本变更后,运行 `openspec archive simpleai-translator-rebrand` 把本提案归档到 `openspec/changes/archive/`
- [ ] 12.2 同步在 `openspec/specs/app-identity/spec.md` / `settings-surface/spec.md` / `no-telemetry/spec.md` 写入归档后的稳定 spec(由 archive 命令自动生成,本步骤为验证)
- [ ] 12.3 删除已不再需要的 `openspec/changes/rebrand-simpleai-and-trim/` 目录(其只含空 scaffold,已被本提案完整替代)
