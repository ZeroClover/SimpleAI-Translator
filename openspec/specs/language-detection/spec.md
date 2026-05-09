# language-detection Specification

## Purpose
TBD - created by archiving change slim-to-translation-core. Update Purpose after archive.
## Requirements
### Requirement: 输入语言检测引擎集合

系统 SHALL 提供一个语言检测子系统,通过 `settings.languageDetectionEngine: LanguageDetectionEngine` 暴露给用户选择,联合类型恰好为 `'local' | 'google' | 'baidu' | 'bing'`。系统 MUST NOT 引入其它检测引擎,SHALL 在缺省时使用 `'local'`。

#### Scenario: 默认本地检测

- **WHEN** 用户首次安装、未修改语言检测设置
- **THEN** `settings.languageDetectionEngine` SHALL 默认为 `'local'`

#### Scenario: 切换到远端引擎

- **WHEN** 用户在设置中切换为 `'google'`
- **THEN** 后续检测 SHALL 通过 Google 检测路径执行

### Requirement: 自动检测在翻译流程中触发

系统 SHALL 在主翻译界面中,在用户停止输入(防抖)或显式触发翻译时,对当前文本调用语言检测,并把结果写回 `detectFrom` 状态。系统 SHALL 仅在用户未手动锁定源语言时执行自动检测。

#### Scenario: 用户未锁定源语言

- **WHEN** 源语言下拉处于"自动"状态,用户输入 `Hola, ¿cómo estás?`
- **THEN** 系统 SHALL 在防抖窗口结束后调用语言检测
- **AND** `detectFrom` SHALL 被设为 `'es'`(西班牙语)
- **AND** 该状态 SHALL 在主界面以"已识别为西班牙语"提示

#### Scenario: 用户已手动锁定源语言

- **WHEN** 用户已显式选择源语言为 `'en'`,然后输入西班牙语文本
- **THEN** 系统 SHALL NOT 自动覆盖用户选择
- **AND** `detectFrom` SHALL 保持 `'en'`

### Requirement: 检测失败的降级

系统 SHALL 在远端引擎请求失败、超时、限流时,降级到 `'local'` 引擎再尝试一次;若仍失败,SHALL 把 `detectFrom` 置为 "auto" 并允许翻译流程继续。

#### Scenario: Google 检测失败降级到 local

- **WHEN** `languageDetectionEngine === 'google'`,请求超时
- **THEN** 系统 SHALL 用 local 引擎再检测一次
- **AND** 若 local 给出非空结果,SHALL 使用该结果

#### Scenario: 全部失败仍可翻译

- **WHEN** 所有检测引擎均失败
- **THEN** `detectFrom` SHALL 等价于"auto"
- **AND** 翻译流程 SHALL NOT 因此中断,LLM prompt 中以"自动识别"方式表述源语言

### Requirement: 目标语言选择

系统 SHALL 允许用户在主界面与设置中选择目标语言;设置中的 `defaultTargetLanguage` 决定首次打开时的默认目标语言。系统 SHALL 在用户切换目标语言后立即对当前输入重新触发翻译(若已有结果且开启 `autoTranslate`)。

#### Scenario: 默认目标语言生效

- **WHEN** 用户首次打开应用,`settings.defaultTargetLanguage === 'zh-Hans'`
- **THEN** 主界面目标语言下拉 SHALL 显示"简体中文"作为初始选中

#### Scenario: 切换目标语言重新翻译

- **WHEN** 已存在翻译结果,`settings.autoTranslate === true`,用户把目标语言从 `'zh-Hans'` 切到 `'ja'`
- **THEN** 系统 SHALL 自动对当前源文本重新触发一次翻译
- **AND** 旧结果 SHALL 被新结果替换

### Requirement: 检测结果与翻译目标的合理性约束

系统 SHALL 在检测出的源语言与用户选定目标语言一致时,仍执行翻译(由 LLM 决定如何处理同语言输入,例如改写为更标准形式),但 MUST NOT 弹出错误对话框。

#### Scenario: 源等于目标

- **WHEN** `detectFrom === 'en'` 且 `detectTo === 'en'`
- **THEN** 系统 SHALL 仍发起翻译
- **AND** SHALL NOT 阻塞用户操作或弹出错误
