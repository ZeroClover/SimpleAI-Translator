## MODIFIED Requirements

### Requirement: 新 App schema 初始化与旧字段清理

系统 SHALL 按新 App 处理 settings。读取 settings 时 SHALL 只从存储中读取当前 `ISettings` 字段,SHALL NOT 读取或迁移任何旧字段(包括 `defaultTargetLanguage`);首次读取缺省 settings 时 SHALL 初始化 `providers: []`、`defaultProviderId: null` 与 `defaultModel: null`。若持久化数据中存在旧字段(`apiKeys` / `apiURL` / `apiModel` / `provider` / `azureAPIKeys` / `miniMaxAPIKey` / `geminiAPIKey` / `moonshotAPIKey` / `deepSeekAPIKey` / `claudeAPIKey` / `ollamaAPIURL` / `kimiAccessToken` 等),系统 MUST NOT 将其转换为 ProviderConfig。写回 settings 时 SHALL 只写新 schema 字段;存储中残留的旧字段 key SHALL 保持原样且不影响任何行为,系统 SHALL NOT 维护旧字段 key 列表,也 SHALL NOT 在写入时额外删除它们。

#### Scenario: 新安装初始化为空 Provider 列表

-   **WHEN** 用户首次安装并读取 settings
-   **THEN** `settings.providers` SHALL 为 `[]`
-   **AND** `settings.defaultProviderId` 与 `settings.defaultModel` SHALL 为 `null`
-   **AND** 主界面 SHALL 提示用户先在设置中添加 LLM Provider

#### Scenario: 旧 OpenAI 字段不迁移

-   **WHEN** 持久化 settings 中只有旧字段 `provider === 'OpenAI'`,`apiKeys === 'sk-xxx'`,`apiModel === 'gpt-5.5'`
-   **THEN** 读取后的 `settings.providers` SHALL 仍为 `[]`
-   **AND** 系统 SHALL NOT 创建 OpenAI ProviderConfig
-   **AND** 下次保存 settings 时 SHALL NOT 写回 `provider` / `apiKeys` / `apiModel`
-   **AND** 该保存 SHALL 只执行一次存储写入,SHALL NOT 额外发起删除旧 key 的存储操作

#### Scenario: 旧 Azure 字段不迁移

-   **WHEN** 持久化 settings 中包含 `provider === 'Azure'` 或 `azureAPIKeys` / `azureAPIURL` / `azureAPIURLPath` / `azureAPIModel` 字段
-   **THEN** 读取后的 `settings.providers` SHALL 仍为 `[]`
-   **AND** 系统 SHALL NOT 创建 `openai-chat` ProviderConfig
-   **AND** 下次保存 settings 时 SHALL NOT 写回这些字段

#### Scenario: 未识别 Provider 直接丢弃

-   **WHEN** 持久化 settings 中 `provider === 'SomeLegacyProvider'`
-   **THEN** 系统 SHALL NOT 为其创建 ProviderConfig
-   **AND** SHALL NOT 尝试按 OpenAI 兼容协议兜底

#### Scenario: 旧母语字段不迁移

-   **WHEN** 持久化 settings 中只有旧字段 `defaultTargetLanguage === 'ja'`,没有 `nativeLanguage`
-   **THEN** 读取后的 `settings.nativeLanguage` SHALL 为默认值 `'zh-Hans'`

#### Scenario: 已是新 schema 保持不变

-   **WHEN** settings 已含 `providers` 数组(无论空与否)
-   **THEN** 读取逻辑 SHALL 保留该数组与有效的 `defaultProviderId`
-   **AND** SHALL NOT 读取旧 Provider 字段覆盖新 schema

### Requirement: 浏览器扩展自定义 Endpoint 权限

浏览器扩展 manifest SHALL 只声明 `permissions: ['storage', 'contextMenus']`,固定 `host_permissions` 仅包含官方 LLM endpoint(`https://api.openai.com/*`、`https://api.anthropic.com/*`)以及内置 TTS / 语言检测所需的域名,并以 `optional_host_permissions: ['http://*/*', 'https://*/*']` 覆盖自定义 endpoint。系统 MUST NOT 声明 `webRequest` 权限,MUST NOT 保留 ChatGPT Arkose / Kimi / ChatGLM token 捕获逻辑。

扩展中经后台转发的每个网络请求(包括模型刷新与翻译)SHALL 先从请求 URL 计算 origin(`<scheme>://<host>[:port]/*`,仅限 http / https);若扩展尚无该 origin 权限,SHALL 调用 `permissions.request({ origins: [origin] })`;若用户拒绝,系统 SHALL 以 `NotAllowedError`("Host permission denied for <origin>")拒绝该请求,且 SHALL NOT 发起网络请求。桌面端不走此授权流程。

由用户点击触发的操作(Provider 表单的 "Save" 与 Provider 行的 "Refresh")SHALL 在点击处理函数中、任何其它 `await` 之前,直接调用扩展页面的 `browser.permissions.request`(Chromium 为 `chrome.permissions.request`)请求该 Provider 自定义 endpoint 的 origin,使 Firefox 仍处于用户手势上下文中。已授权的 origin SHALL NOT 弹出提示;endpoint 为空(使用官方默认 endpoint)或当前页面没有 `permissions` API(桌面端、content script)时 SHALL 视为无需授权。"Save" SHALL 不等待授权结果即保存配置,被拒绝时以 toast 提示"Permission to access this endpoint was denied.";"Refresh" SHALL 等待授权结果,被拒绝或请求失败时以 toast 提示同一文案且 SHALL NOT 发起模型列表请求。

#### Scenario: 自定义 endpoint 首次请求授权

-   **WHEN** 用户在 Chromium 或 Firefox 扩展中配置 `endpoint: 'https://api.example.com/v1'` 并点击 "Refresh"
-   **THEN** 系统 SHALL 从 endpoint 计算 origin `https://api.example.com/*`
-   **AND** SHALL 在点击处理函数的第一个 `await` 处调用 `permissions.request({ origins: ['https://api.example.com/*'] })`
-   **AND** 授权通过后才发起 `GET https://api.example.com/v1/models`

#### Scenario: 保存 Provider 时请求授权

-   **WHEN** 用户在 Firefox 扩展的 Provider 表单中填入 `endpoint: 'https://api.example.com/v1'` 并点击 "Save"
-   **THEN** 系统 SHALL 在该点击中同步调用 `permissions.request({ origins: ['https://api.example.com/*'] })`
-   **AND** 无论授权结果如何,SHALL 保存该 ProviderConfig

#### Scenario: 用户拒绝自定义 endpoint 权限

-   **WHEN** `permissions.request` 返回未授权
-   **THEN** 系统 SHALL NOT 发起模型刷新或翻译的网络请求
-   **AND** 模型刷新 SHALL 提示"Permission to access this endpoint was denied.",且该 Provider 的 `modelOptions` SHALL 保持不变
-   **AND** 翻译 SHALL 以包含"Host permission denied for <origin>"的错误结束

#### Scenario: 旧 webRequest token 捕获已移除

-   **WHEN** 在 `src/` 中检索 `webRequest`、`Arkose`、`keyKimiAccessToken`、`keyChatGLMAccessToken`
-   **THEN** SHALL NOT 存在相关监听器或 token 存储逻辑

