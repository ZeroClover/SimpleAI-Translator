# language-detection Specification

## Purpose
定义翻译界面如何识别源文本语言(本地启发式或 Google / Baidu / Bing 远端检测)并据此确定源语言与目标语言,以及用户手动选择源/目标语言时的行为。
## Requirements
### Requirement: 输入语言检测引擎集合

系统 SHALL 提供一个语言检测子系统,通过 `settings.languageDetectionEngine: LanguageDetectionEngine` 暴露给用户选择,联合类型恰好为 `'local' | 'google' | 'baidu' | 'bing'`。系统 MUST NOT 引入其它检测引擎;设置缺省或为空时 SHALL 使用 `'local'`。检测前系统 SHALL 把文本截断到前 1000 个字符;`'local'` 引擎 SHALL 只分析前 200 个字符,基于字符集权重在 `en`、`zh-Hans`/`zh-Hant`(按繁简判断)、`ko`、`vi`、`th`、`hmn`、`ja`、`ru`、`es`、`fr`、`de` 中给出结果,无法判断时返回 `'en'`。

#### Scenario: 默认本地检测

- **WHEN** 用户首次安装、未修改语言检测设置
- **THEN** `settings.languageDetectionEngine` SHALL 为 `'local'`
- **AND** 检测 SHALL 在本地完成,不发起网络请求

#### Scenario: 切换到远端引擎

- **WHEN** 用户在设置中切换为 `'google'`
- **THEN** 后续检测 SHALL 通过 `translate.google.com` 的检测请求执行

#### Scenario: 本地检测繁体中文

- **WHEN** `languageDetectionEngine === 'local'`,输入为繁体中文文本
- **THEN** 检测结果 SHALL 为 `'zh-Hant'`

### Requirement: 检测在提交翻译时触发

系统 SHALL 在用户显式提交翻译(在输入框按 Enter 或点击提交按钮)时,以及外部传入待翻译文本(浏览器扩展内容脚本传入的文本、桌面端翻译窗口收到的 `change-text` 事件文本)时,对该文本调用一次语言检测,并把结果设为当前源语言。系统 SHALL NOT 在用户输入过程中做防抖自动检测。每次提交 SHALL 重新检测,检测结果 SHALL 覆盖此前的源语言(包括用户手动选择的源语言)。

#### Scenario: 提交时检测源语言

- **WHEN** 用户输入 `Ça va très bien.` 并按 Enter,`languageDetectionEngine === 'local'`
- **THEN** 系统 SHALL 调用语言检测
- **AND** 源语言下拉 SHALL 显示检测结果 `'fr'`
- **AND** 系统 SHALL 以该源语言发起翻译

#### Scenario: 手动选择源语言

- **WHEN** 用户在源语言下拉中手动选择 `'en'`
- **THEN** 系统 SHALL 以 `'en'` 作为源语言对当前输入重新翻译,不调用语言检测
- **AND** 用户之后再次提交时,系统 SHALL 重新检测并以检测结果覆盖源语言

### Requirement: 远端检测失败的处理

远端引擎(`google` / `baidu` / `bing`)在 HTTP 响应非成功,或返回的语言无法映射为 `LangCode` 时,SHALL 改用本地检测结果,并继续翻译流程。`google` 与 `baidu` 的结果 SHALL 经各自映射表转换为 `LangCode`;`bing` 返回的 BCP-47 语言代码本身为 `LangCode`(如 `zh-Hans`、`zh-Hant`、`yue`、`pt`)时 SHALL 原样使用,带地区或书写系统后缀的变体(如 `pt-PT`、`mn-Cyrl`)SHALL 映射为其基础语言(`pt`、`mn`),其它代码 SHALL 视为未知并改用本地检测。若远端检测请求本身抛出异常(如网络不可达),`detectLang` SHALL 改用 `'local'` 引擎对同一文本检测并返回其结果,该次提交 SHALL 以该结果继续发起翻译。

#### Scenario: 远端返回非成功状态

- **WHEN** `languageDetectionEngine === 'baidu'`,检测请求返回 HTTP 5xx
- **THEN** 系统 SHALL 对同一文本执行本地检测
- **AND** 翻译流程 SHALL 以本地检测结果为源语言继续

#### Scenario: Bing 返回语言变体

- **WHEN** `languageDetectionEngine === 'bing'`,上游返回 `pt-PT`
- **THEN** 检测结果 SHALL 为 `'pt'`

#### Scenario: Bing 返回中文

- **WHEN** `languageDetectionEngine === 'bing'`,上游返回 `zh-Hant`
- **THEN** 检测结果 SHALL 为 `'zh-Hant'`

#### Scenario: 检测请求抛出异常

- **WHEN** `languageDetectionEngine === 'google'`,检测请求因网络不可达而抛出异常,输入为 `今天天气很好`
- **THEN** 系统 SHALL 改用 local 引擎检测,结果为 `'zh-Hans'`
- **AND** 该次提交 SHALL 以 `'zh-Hans'` 为源语言发起翻译

### Requirement: 目标语言选择

系统 SHALL 用 `settings.nativeLanguage`(默认 `'zh-Hans'`)与 `settings.translationTargetLanguage`(默认 `'en'`;当母语与 `'en'` 同语言时默认 `'zh-Hans'`)自动决定目标语言:源语言与母语属于同一语言(`en-*` 视同 `en`,`ko-banmal` 视同 `ko`)时 SHALL 以 `translationTargetLanguage` 为目标,否则 SHALL 以 `nativeLanguage` 为目标。用户在主界面手动选择的目标语言 SHALL 在后续检测出的源语言与选择时的源语言相同时保持不变,源语言变化时 SHALL 恢复自动决定。用户切换目标语言后,系统 SHALL 立即对当前输入重新翻译。

#### Scenario: 非母语输入翻译为母语

- **WHEN** `settings.nativeLanguage === 'zh-Hans'`,用户提交英文文本
- **THEN** 目标语言 SHALL 为 `'zh-Hans'`

#### Scenario: 母语输入翻译为翻译目标语言

- **WHEN** `settings.nativeLanguage === 'zh-Hans'`、`settings.translationTargetLanguage === 'en'`,用户提交简体中文文本
- **THEN** 目标语言 SHALL 为 `'en'`

#### Scenario: 切换目标语言重新翻译

- **WHEN** 输入框有文本,用户把目标语言从 `'zh-Hans'` 切到 `'ja'`
- **THEN** 系统 SHALL 立即以 `'ja'` 为目标对当前输入重新翻译
- **AND** 之后提交同一源语言的文本时,目标语言 SHALL 保持 `'ja'`

#### Scenario: 交换源与目标语言

- **WHEN** 已有译文,用户点击源/目标语言之间的交换按钮
- **THEN** 系统 SHALL 交换源语言与目标语言
- **AND** SHALL 以当前译文作为新的输入发起翻译

### Requirement: 检测结果与翻译目标的合理性约束

系统 SHALL 在源语言与目标语言相同时仍执行翻译(由 LLM 决定如何处理同语言输入),MUST NOT 弹出错误对话框或阻塞用户操作。

#### Scenario: 源等于目标

- **WHEN** 源语言为 `'en'` 且用户手动把目标语言选为 `'en'`
- **THEN** 系统 SHALL 仍发起翻译
- **AND** SHALL NOT 阻塞用户操作或弹出错误
