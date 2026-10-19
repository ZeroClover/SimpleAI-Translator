## MODIFIED Requirements

### Requirement: i18n locale 文件结构对齐

界面语言 SHALL 为以下 6 种 locale:`en`、`zh-Hans`、`zh-Hant`、`ja`、`th`、`tr`,每种对应 `src/common/i18n/locales/<lang>/translation.json`,设置页 i18n 选择框 SHALL 只提供这 6 项。`en` SHALL 作为 `fallbackLng`;所有 6 种 locale 的 key 集合 SHALL 完全相同,新增或删除 key 时 SHALL 同步修改全部 locale。

所有 locale SHALL NOT 包含以下已移除功能的 key:

- `Hotkey`、`Display window Hotkey`、`Please press the hotkey you want to set.`、`Click above to set hotkeys.`、`Shortcuts`
- `Buy me a coffee`、与"赞助"介绍相关的长句 key
- `Always show icons`、`Show icon when text is selected`
- `Auto Translate`
- `Word selection in input`、`Enable word selection for lookup in the input field`、`Read the selected words in input`
- `Hide the icon in the Dock bar`、`Hide the icon in the taskbar`
- `Auto hide window when out of focus`
- `disable collecting statistics`、`Disable collecting statistics`
- `Country Not Supported`、`Country Not Detected`

#### Scenario: 所有 locale key 集合相同

- **WHEN** 比较各 locale `translation.json` 与 `en/translation.json` 的 key 集合
- **THEN** 每个 locale 的 key 集合 SHALL 与 `en` 完全相同,既不缺失也不多出

#### Scenario: 已删 key 不存在

- **WHEN** 在任意一个 `translation.json` 中搜索本需求列出的 key 字符串
- **THEN** SHALL NOT 命中
