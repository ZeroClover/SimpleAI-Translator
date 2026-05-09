## Context

`slim-to-translation-core` 把代码瘦到了"翻译核心 + 多 Provider + TTS + 语言检测"四块,但仓库的**应用身份**(产品名、Bundle ID、运行时代码命名空间、文案、所有提及 NextAI Translator 的位置)仍然是上一次重命名(从 OpenAI Translator 到 NextAI Translator)留下的中间状态:`tauri.conf.json` 的 `identifier` 还停留在最早的 `xyz.yetone.apps.openai-translator`,`config.rs` 里有一段从该旧 ID 把数据迁移到 `xyz.yetone.apps.nextai-translator` 的代码,而 `productName` 与所有 UI 文案又都是 NextAI。同时,设置面板里仍然挂着早期为浏览器扩展 + 桌面双形态强行抽象出来的若干旋钮(快捷键区、`alwaysShowIcons` / `autoTranslate` / `selectInputElementsText` / `hideTheIconInTheDock` / `autoHideWindowWhenOutOfFocus`)、捐赠 Modal、以及 Sentry + GA + Aptabase 三套埋点(配套有 `disableCollectingStatistics` 开关)。

本变更要在一次发布中完成:**(A) 产品身份切换到 SimpleAI Translator + `io.zeroclover.app.simpleai-translator`**,**(B) 把上述设置项与全部第三方遥测彻底删除**。这两个目标必须捆绑发布是因为:Bundle ID 改变本身就会导致 macOS 把新版本视作另一个 App,旧 App 的所有用户数据自动失访 —— 这是把"删功能引发的 settings schema 不兼容"风险与"换身份引发的数据失访"风险合并到同一次破坏性发布里的最划算时机。

约束:
- 仓库当前已有 `slim-to-translation-core` 的实施(`tasks.md` 多数已勾选);本变更必须**叠加**在那次精简之上,而不是回退或重做。
- `slim-to-translation-core/proposal.md` 已确立"按新 App 处理,不迁移旧数据"的整体姿态;本变更继承该姿态。
- `tauri.conf.json` 的 `identifier` 与 macOS `.app` 包名(`productName`)是 Tauri updater 签名链路、deep link scheme、`getAppDataDir()` 的输入;同步改动必须一次到位,否则会把更新签名/数据目录拆到两个 ID 上。
- 浏览器插件的代码与功能精简属于本变更范围,包括 manifest 可见名称、content script 自动触发逻辑、commands、host permissions 等;但浏览器插件所有者、商店条目、Firefox `gecko.id` / `applications.gecko.id`、Chrome 扩展 ID、签名身份不属于本变更范围。
- GitHub 远程仓库不属于本变更范围:`package.json.repository.url`、README 徽章/链接、Tauri updater endpoint URL 不在本次变更中强制改动。
- 用户(`zero@root.me`)是仓库 owner,新 Bundle ID 前缀 `io.zeroclover.app.*` 是其个人命名空间;本变更不要求与任何外部组织协调。

## Goals / Non-Goals

**Goals:**

- 一次性把仓库中所有"应用身份字段"(应用名、桌面 Bundle ID、命名空间前缀、IPC socket、浏览器插件可见 name/description、Tauri 窗口标题、`<title>`、产品名相关 i18n 键的字符串值、README/AGENTS 中的产品名文案)切换为 SimpleAI Translator + `io.zeroclover.app.simpleai-translator`。
- 删除"快捷键设置区"、"Buy me a coffee"、`alwaysShowIcons` / `autoTranslate` / `selectInputElementsText` / `hideTheIconInTheDock` / `autoHideWindowWhenOutOfFocus` 这几个 UX 旋钮的**全部代码、UI、类型字段、i18n 键、依赖**。
- 删除 `disableCollectingStatistics` 设置项与三套统计 SDK(Sentry / Google Analytics / Aptabase)的全部初始化、调用点、依赖、host permissions、以及对应 i18n 键;实现"零遥测"承诺。
- 让本仓库构建产物(扩展 zip / Tauri `.app` / Tauri `.dmg`)在 `strings` / `grep` 检查下不再出现 `sentry.io` / `googletagmanager` / `google-analytics` / `aptabase` / `nextai-translator` / `openai-translator` / `xyz.yetone` 等遗留字符串。
- 让设置面板首次打开时不再有任何"已被移除但还在 UI 上"的孤儿 FormItem。
- 保留并不修改 `slim-to-translation-core` 引入的 Provider 多配置、TTS、语言检测、翻译核心代码 —— 这些 capability 不在本次重写范围内。

**Non-Goals:**

- 不重新设计 Provider 配置或 TTS 行为(由 `slim-to-translation-core` 负责)。
- 不引入新的遥测系统替代被删的三套 —— "零遥测"是终态,不是过渡。
- 不为旧 Bundle ID(`xyz.yetone.apps.openai-translator` / `xyz.yetone.apps.nextai-translator`)的用户数据提供任何迁移路径或导入工具;旧用户重新走"首次启动"流程。
- 不引入"用户可选的全局快捷键"作为快捷键区的替代品;翻译触发入口收敛为"托盘菜单点击 / 浏览器扩展按钮点击 / 输入框回车"。
- 不修改"翻译触发"的核心键位(回车键 / Shift+Enter 换行)—— 这些是 `Translator.tsx` 局部组件级 keybinding,不属于"全局快捷键"范畴,不在删除范围内。
- 不修改 Tauri updater 的更新机制或 endpoint URL,只更新更新器窗口标题等本地展示文案。
- 不修改浏览器插件所有者、商店条目、Firefox `gecko.id` / `applications.gecko.id`、Chrome 扩展 ID 或签名身份。
- 不修改 GitHub 远程仓库、`package.json.repository.url`、README 徽章/链接或 Tauri updater endpoint URL。
- 不强制为本次发布做"零遥测"以外的隐私加固(如禁止用户配置自定义 Endpoint 出站)。

## Decisions

### D1. Bundle ID 改为 `io.zeroclover.app.simpleai-translator`,不做反向迁移

**决定**:`tauri.conf.json` 的 `identifier` 直接写新值;删除 `src-tauri/src/config.rs` 中所有从旧 ID 读 `~/Library/Application Support/<old>/` 并复制到新目录的代码。

**为什么不迁移**:
- 旧 Bundle ID 下持久化的是 `slim-to-translation-core` 之前的 schema(包含 `apiKeys` / `azureAPIKeys` / `vocabulary` 等已删字段);自动迁移意味着要在新 App 里写一份"旧 schema → 新 Provider 配置"的反推映射,而 `slim-to-translation-core` 已显式选择"不兼容旧 Provider 字段"。本变更继承该姿态,不为旧用户造一条只会回到"反正都要重填 API Key"终点的路径。
- 旧的历史记录(若启用)可以让旧用户用旧版 App 导出后手动导入,但导出/导入工具在 `slim-to-translation-core` 中不存在,且不在本次范围内。

**对用户的影响**:旧用户安装新版本后看到的是"全新空 App";旧版本仍可继续运行(macOS 不会自动卸载旧 `.app`),用户可手动从旧版导出 API Key 等敏感信息。

### D2. 命名空间前缀切到 `__zeroclover-simpleai-translator-*`,旧前缀不保留

**决定**:`PREFIX`、四个 content script DOM ID、Tauri IPC socket 路径全部更名;`__yetone-nextai-translator-*` 不留兼容入口。

**为什么**:
- 这些命名空间只在"运行中浏览器页面 / 运行中操作系统进程"内可见,没有任何持久化(localStorage 的 key 从 `__yetone-*` 改为 `__zeroclover-*` 也意味着旧扩展存的设置不会被新扩展看到 —— 这恰好与 D1 的"按新 App 处理"一致)。
- 同一台机器上同时跑旧扩展(若用户没卸载)与新扩展时,前缀不冲突意味着两边各自显示自己的 popup card,而不是新扩展不小心复用旧扩展遗留的 DOM 节点(那会引入难诊断的 UI bug)。
- 不留兼容前缀让 grep 检查变得简单 —— `git grep -i 'yetone\|nextai\|openai-translator' src/ src-tauri/` 应只剩 commit history。

**Alternatives considered**:
- 保留 `__yetone-*` 作为读后备:被否,因为引入了"哪些键读旧的、哪些写新的"两套规则,长期维护成本远超一次性切换。

### D3. 浏览器插件只改功能与可见名称,不改所有者/发布身份

**决定**:`src/browser-extension/manifest.ts` 的 `name` / `description`、host permissions、commands,以及 content script / background 中与被删功能相关的代码可以随本变更修改;但 Firefox `browser_specific_settings.gecko.id` / `applications.gecko.id`、Chrome 扩展 ID、Chrome Web Store 条目、Firefox AMO owner、签名身份不在本变更中修改或决定。

**为什么**:
- 浏览器插件 owner / store listing / extension ID 是发布与签名身份,不等同于产品名文案或功能代码。
- 原始提示词要求删除的是设置项与功能路径,不是重新分发浏览器插件或转移插件所有权。
- 保留扩展 ID 不阻止删除快捷键命令、自动翻译、选词浮标或遥测 host permissions;这些属于代码和权限面收敛。
- Chrome extension ID 不是由 manifest `name` 决定;把发布身份放进本变更会制造不必要的产品决策。

### D4. 遥测一次性删干净,不留 feature flag

**决定**:删除整个 `src/common/analysis.ts`、`@aptabase/tauri` 所有 import 与调用、`tauri-plugin-aptabase` Cargo 依赖、`@sentry/react` 与 `react-ga4` npm 依赖、扩展 manifest 中三个相关 host permissions、以及 `disableCollectingStatistics` 字段与 UI;不引入"以后可能加回来"的开关或环境变量门控。

**为什么不留 stub**:
- "可禁用的统计"在隐私视角下是反模式 —— 任何带遥测的版本都需要在隐私文档里说明数据流,无论默认是否开启。"零遥测"叙述只在彻底无相关代码时成立。
- 浏览器扩展商店审核(尤其 Firefox AMO)会读 manifest host permissions;留有但不使用的 `*.googletagmanager.com` 会被审核员要求解释。
- 留 stub 增加未来贡献者"我能不能加回一个埋点"的歧义 —— 删干净相当于把"是否做遥测"上升为产品决策,需要新的提案。

**Alternatives considered**:
- 把 `setupAnalysis()` 改为空实现保留函数签名:被否,因为所有调用点也要删,空实现没有承载力。
- 用 OpenTelemetry 自托管替代:被否,超出本提案范围;若未来需要本地诊断,应作为新提案讨论。

### D5. `autoTranslate` / `alwaysShowIcons` / `selectInputElementsText` 三个浏览器扩展强相关旋钮一并删除

**决定**:不保留任何"自动触发翻译"的路径(包括浏览器扩展 content script 中的 `settings.autoTranslate` 分支;若 `Translator.tsx` 或其它组件存在同类 debounce 自动翻译分支也一并删除)、不保留"选中文字弹气泡图标"、不保留"输入框 input/textarea 双击选词"。所有触发都需用户显式按下回车或点击翻译按钮。

**为什么**:
- 这些是浏览器扩展形态在和"用户在网页上的注意力流"竞争时引入的便利,但同时也是隐私视角下"内容被无意中送往 LLM"的最大风险面。
- 与 D4(零遥测)语义一致:产品对外网络请求收敛到"用户显式触发的翻译 + 用户显式触发的 TTS + Tauri updater"三类。
- 桌面端用户可以通过"系统级文本服务"(macOS Services)或剪贴板自行接入显式触发;浏览器扩展用户可以点击工具栏图标或右键菜单项触发,而不是依赖"选词即翻"。

**Alternatives considered**:
- 只删"选中弹图标",保留"自动翻译":被否,因为两者共享同一类风险面,删一半既留风险又留代码复杂度。
- 把"自动翻译"改为右键菜单条目:可作为后续提案,但不在本次范围。

### D6. 删除全部全局快捷键,但保留 `Translator.tsx` 局部键位

**决定**:删除 `ISettings.hotkey` / `displayWindowHotkey`、`HotkeyRecorder` 组件、Tauri 全局快捷键注册、托盘 accelerator、`src/tauri/utils.ts` 中的 `bindHotkey` / `bindDisplayWindowHotkey` helper、浏览器扩展 manifest `commands` 与 background command listener、content script 的 `hotkeys-js` 绑定、Tauri capabilities 中的 global-shortcut permissions,以及 `react-hotkeys-hook` 在 Settings 中的使用;但 `Translator.tsx` 内部对回车 / Shift+Enter / Esc 等局部按键的响应保留。

**为什么**:
- "全局快捷键"涉及操作系统权限申请(macOS Accessibility / Windows / Linux 各异)、与其它应用冲突、用户配置 UI、`react-hotkeys-hook` 依赖;成本高、与"轻量翻译器"定位匹配度低。
- 局部键位(在翻译器窗口或浏览器扩展弹窗已聚焦时响应回车)不申请系统权限,无冲突风险,是任何文本输入 UI 的基本预期,不需要"快捷键设置区"承载。

### D7. macOS 始终保留 Dock 图标(`Regular` activation policy);删除 `hideTheIconInTheDock`

**决定**:`src-tauri/src/main.rs` 中所有 `set_activation_policy(ActivationPolicy::Accessory)` 分支删除;`config.rs` 中 `hide_the_icon_in_the_dock` 字段删除;`ISettings` 字段、Settings UI、i18n 键全部删除。

**为什么**:
- "Accessory" 模式让 App 不出现在 Dock / Cmd+Tab,是为"托盘小工具"形态设计的;`slim-to-translation-core` 后本应用是"在前台显示翻译结果的窗口型 App",`Regular` 是更符合用户预期的默认。
- 删除该字段顺带消除了"用户切换该选项后如何在不重启 App 的情况下切换 activation policy"的边界条件代码。

### D8. 失去焦点不再自动隐藏窗口

**决定**:删除 `TranslatorWindow.tsx` 中 `autoHideWindowWhenOutOfFocus` 副作用与依赖;窗口的关闭/隐藏由用户主动操作(关闭按钮 / Cmd+W / Esc)。

**为什么**:
- 该行为在用户切到另一应用查证翻译时会被频繁触发,导致回到翻译器后丢失上下文;实际产品反馈不正向。
- 删除后也消除"焦点变化 ↔ 窗口可见性"这条副作用链路在 Tauri 多窗口(translator / settings / history / updater)间的微妙互动。

### D9. i18n 文件保持结构对齐,统一删除被删 key

**决定**:每个 locale `translation.json` 中,被删功能引用的所有 key(`Hotkey` / `Display window Hotkey` / `Buy me a coffee` / `Always show icons` / `Show icon when text is selected` / `Auto Translate` / `Word selection in input` / `Hide the icon in the Dock bar` / `Hide the icon in the taskbar` / `Auto hide window when out of focus` / `disable collecting statistics` / 以及说明性长句对应的 key)整批删除;产品名相关 key 的 string value 替换。

**为什么**:
- i18n 文件之间的键集合保持一致是 lint 规则的基本约束;新增/删除必须同步。
- 直接删而不是改成空字符串可以让 `i18next` 在意外引用时报 missing key,而不是渲染空白(更易在 PR review / 测试中被发现)。

### D10. 用 grep 测试守卫零遥测与零旧 ID 残留

**决定**:在 CI 中加一组失败时阻塞合并的 grep 断言:
- `git grep -i 'sentry\|aptabase\|google-analytics\|googletagmanager\|react-ga4\|@sentry\|@aptabase'` 应只命中本变更的文档(`openspec/changes/simpleai-translator-rebrand/*.md`),不命中 `src/` / `src-tauri/src/` / `src-tauri/capabilities/` / `src-tauri/gen/schemas/` / `package.json` / `pnpm-lock.yaml` / `Cargo.toml` / `Cargo.lock` / `manifest.ts`。
- `git grep -i 'yetone\|nextai-translator\|NextAI Translator\|openai-translator'` 应不命中运行时代码、构建身份字段或自有命名空间;允许命中 `openspec/changes/**`、README 中明确解释"曾用名"的段落、`package.json.repository.url`、Tauri updater endpoint URL、以及浏览器插件签名/所有者身份字段。
- 构建产物 grep:`dist/` / `src-tauri/target/release/` 中不出现上述字符串(允许 license 文件、debug symbols 例外)。

**为什么**:
- 自然语言验收(reviewer 手动看)对"删干净"类目标极易漏检,grep 测试是最低成本的硬性回归保护。
- 失败信息直接指向遗漏的文件,降低修复成本。

## Risks / Trade-offs

- [旧用户首次升级不知道数据不见了] → 在用户可见升级说明中显式说明:本版本的 Bundle ID 已变更,旧版本数据不会被自动迁移;附旧版本数据目录路径(`xyz.yetone.apps.openai-translator` / `xyz.yetone.apps.nextai-translator`)以便手动备份。
- [浏览器插件发布身份被误改] → tasks 与 specs 明确禁止修改 Firefox `gecko.id`、Chrome 扩展 ID、商店条目和签名身份;代码 review 重点检查 `manifest.ts` 只改 name/description/commands/host permissions 等功能字段。
- [漏掉一处产品名/Bundle ID 字符串导致 mixed identity] → 用 D10 的 grep 测试守卫;另外在 PR 中要求 reviewer 手动检查:Tauri `.app` 包内 `Info.plist` 的 `CFBundleName` / `CFBundleIdentifier` / `CFBundleDisplayName`、扩展 zip 内 `manifest.json` 的 `name` / `description`。
- [删依赖触发其它代码引用错误] → `pnpm install` 之后 `pnpm exec tsc --noEmit` 与 `cargo check --manifest-path src-tauri/Cargo.toml` 必须通过;CI 把这两个作为合并前 gate。
- [删除全局快捷键后,部分依赖快捷键的工作流用户失去入口] → 在升级说明中点出"全局快捷键已移除,触发翻译请通过托盘菜单 / 扩展按钮";可作为后续提案重新评估,但本变更不提供。
- [Aptabase plugin 删除后,Tauri 启动顺序中其它 plugin 的注册顺序可能受影响] → 实施时按现有 plugin 顺序逐个删除并 `cargo check --manifest-path src-tauri/Cargo.toml` + `pnpm dev-tauri` 启动一次确认无 panic。
- [Tauri capability / generated schema 未同步清理] → 删除 Aptabase 和 global shortcut 依赖后,必须同步清理 `src-tauri/capabilities/migrated.json` 并重新生成或更新 `src-tauri/gen/schemas/*`;否则可能出现构建校验失败或 grep 守卫误报。
- [`alwaysShowIcons` 删除涉及 `bind_mouse_hook` 整段代码,但该 hook 可能也供其它 feature 使用] → 实施前先 `git grep bind_mouse_hook` 与 `git grep MouseHookEvent` 等关联符号确认引用面;若仅 `alwaysShowIcons` 一处则整段删除,否则只删该字段相关分支。本设计倾向于"完整删除整段 hook"——`slim-to-translation-core` 后画词与划词图标都没了,鼠标 hook 应已无其他消费者。
- [新 Bundle ID 与某些用户机器上"安全软件 / EDR"白名单的不匹配] → 不影响功能但会触发首次签名提示;不在本变更可处理范围内,升级说明可提示。
- [grep 守卫被绕过:有人用变量拼接旧字符串] → 接受残余风险;字符串拼接构造旧 ID 在本仓库代码风格里是反常态,PR review 是次级保护。

## Migration Plan

本变更采用"破坏性发布,无数据迁移"策略,具体步骤:

1. **代码层切换**(单 PR):
   - 按 tasks.md 顺序依次提交 / 在同一 PR 内按主题分 commit:身份字段切换 → 命名空间切换 → 设置项删除 → 遥测删除 → i18n 同步 → 文档 → grep 守卫。
   - 每一步局部验证(`pnpm exec tsc --noEmit` / `cargo check --manifest-path src-tauri/Cargo.toml` / `pnpm test` / `pnpm dev-tauri` 启动一次)。
2. **依赖移除**:
   - `pnpm remove @sentry/react react-ga4 @aptabase/tauri`;评估并按需 `pnpm remove react-hotkeys-hook hotkeys-js @tauri-apps/plugin-global-shortcut`(只在确认无任何剩余引用后)。
   - 编辑 `src-tauri/Cargo.toml` 移除 `tauri-plugin-aptabase` 与 `tauri-plugin-global-shortcut`;`cargo update --manifest-path src-tauri/Cargo.toml` + `cargo check --manifest-path src-tauri/Cargo.toml`。
3. **构建产物 grep 守卫**:
   - 在 CI workflow(或 `package.json` script)加 `scripts/check-no-telemetry.sh` 与 `scripts/check-no-old-identity.sh`,二者失败即阻塞合并。
4. **预发布手动验证**:
   - macOS 本地 `pnpm build-tauri` 产物:
     - `codesign -dv --verbose=4 dist/SimpleAI\ Translator.app` 确认 `Identifier=io.zeroclover.app.simpleai-translator`。
     - `defaults read /Applications/SimpleAI\ Translator.app/Contents/Info.plist CFBundleName` 应返回 `SimpleAI Translator`。
     - `strings dist/SimpleAI\ Translator.app/Contents/MacOS/<binary> | grep -i 'aptabase\|sentry\|googletagmanager\|nextai\|openai-translator'` 应无输出。
   - 浏览器扩展 `pnpm build-browser-extension` 产物:
     - 解压 zip,`grep -ri 'sentry\|google-analytics\|googletagmanager\|aptabase\|nextai-translator\|yetone' .` 应无输出(license 例外)。
     - `manifest.json` 的 `name` / `description` / `permissions` 与本提案一致;不检查或修改 Firefox/Chrome 扩展 ID。
5. **发布说明**:
   - 若本次同时撰写发布说明,只说明本地 App 名称、Bundle ID 与功能删除;不要求修改 GitHub 远程仓库、Chrome Web Store 条目、Firefox AMO owner 或扩展签名身份。

**回退策略**:
- 代码回退:本变更落地后保留 `pre-rebrand` git tag;若新发布上线后 24h 内出现重大 bug,可在 git tag 上拉新分支 cherry-pick 修复。桌面 Bundle ID 一旦发布后不应来回切换;浏览器插件扩展 ID本变更不触碰。
- 用户回退:旧版本 `.app` 仍可运行;旧扩展若用户未卸载仍可工作。两者数据互不可见,这是 D1 的预期行为,不视作"需要回退"的故障。

## Open Questions

- README 升级说明里是否要附"如何从旧 App 数据目录手动导出 API Key"的步骤?倾向于"附",但具体路径与文件名需要测试旧版 schema 后再写;暂列为后续 PR 任务。README 的远程仓库链接不在本变更中修改。
- 是否需要在新版本启动时检测 `~/Library/Application Support/xyz.yetone.apps.{openai,nextai}-translator/` 存在并显示一次性提示("检测到旧版数据,本版本不会自动迁移,请手动备份")?倾向于"不需要"——这与 D1 的"按新 App 处理"姿态相悖,且会重新引入"读旧目录"的代码路径。最终决定保持"不检测、不提示、纯靠 Release notes 告知"。
- 是否在删除 `react-hotkeys-hook`、`hotkeys-js`、`@tauri-apps/plugin-global-shortcut` 前先用 `git grep useRecordHotkeys\|useHotkeys\|hotkeys-js\|plugin-global-shortcut\|global-shortcut` 确认无其它使用?是,作为 tasks 中明确步骤。
