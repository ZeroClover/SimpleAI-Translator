## Why

当前 nextai-translator 在翻译之外承载了画词(Vocabulary)、OCR(Tesseract)、润色/总结/分析/代码解释/写作助手等多类衍生功能,并内置了近 20 个 LLM Provider 引擎(Azure、Cerebras、ChatGLM、ChatGPT、Claude、Cohere、DeepSeek、Gemini、Groq、Kimi、MiniMax、Moonshot、Ollama、OpenAI 等)。这导致核心翻译路径被淹没在大量功能、设置项与 Provider 适配代码中,提高了维护成本、扩大了攻击面、让用户配置与 UI 变得复杂。我们希望把项目重新聚焦回"翻译器"这一核心定位,降低维护负担并让"使用任意兼容供应商"的体验更顺畅。

## What Changes

- **BREAKING** 移除非翻译功能模块:画词/生词本(Vocabulary)、OCR(Tesseract.js)、写作助手(writing/writingTargetLanguage/writingHotkey/writingNewlineHotkey)、远程推广/提示位(Promotion),以及 `polishing` / `summarize` / `analyze` / `explain-code` / `big-bang` 等 TranslateMode。
- **BREAKING** 翻译模式收敛为单一 `translate` 模式;移除 `Action` / `ActionManager` / `ActionForm` 自定义动作系统中与上述模式相关的内容(若 Action 系统仅服务这些模式则整体移除)。
- **BREAKING** 精简 LLM Provider 集合,只保留三类协议形态:
  - `openai-chat`:OpenAI Chat Completions 兼容
  - `openai-responses`:OpenAI Responses API 兼容
  - `anthropic`:Anthropic Messages API
  其余具体厂商引擎(Azure、Cerebras、ChatGLM、ChatGPT 网页版、Cohere、DeepSeek、Gemini、Groq、Kimi、MiniMax、Moonshot、Ollama 等)均移除,且不再提供这些厂商的内置 endpoint、模板或迁移路径。
- 新增**多供应商配置**能力:每种 Provider 类型(`openai-chat` / `openai-responses` / `anthropic`)均可由用户添加任意多份配置(每份包含名称、API Key、可选自定义 Endpoint、模型),用户在翻译时可选择使用其中一份。默认 Endpoint 只指向官方 OpenAI / Anthropic;用户可自行覆盖 Endpoint 来接入与这三类协议兼容的第三方服务。
- 新增**模型动态发现**能力:Provider 表单中"模型"字段不再是单纯的手填输入框,而是通过调用对应协议的模型列表 API(OpenAI `GET /v1/models`;Anthropic `GET /v1/models`)拉取该凭据下可用的模型列表,并按用途过滤掉与翻译无关的模型(嵌入、实时语音、音频、转录、审核、TTS、图像/视频生成、专用搜索等)。用户既可从过滤后的下拉中选择,也可在下拉无结果或选择"自定义"时手填模型名作为兜底。
- 新增 **OpenAI TTS** backend:在现有 Edge TTS / 系统 TTS 之外,允许用户选择 OpenAI TTS 作为朗读引擎;该 backend 复用某个已存在的 `openai-chat` / `openai-responses` Provider 配置(通过其 id 引用其 endpoint + apiKey + extraHeaders),通过同一凭据拉取可用的 TTS 模型并过滤为 `gpt-4o-mini-tts`(含同系列 snapshot) / `tts-1` / `tts-1-hd`,允许用户选择模型、voice、音频格式与语速。
- **BREAKING** 重写设置(Settings)与存储 schema:旧的扁平 `apiKeys` / `apiURL` / `provider` / `azureAPIKeys` 等单一 Provider 字段被替换为 `providers: ProviderConfig[]` 与 `defaultProviderId`;本变更按新 App 处理,不迁移、不保留、不兜底旧 Provider 配置。
- 保留并继续维护:翻译核心(`translate.ts`)、朗读(TTS,含 Edge TTS 与系统 TTS)、输入语言检测(`LanguageDetectionEngine`)、必要的 i18n、设置 UI、历史记录(可选,见 design 取舍)。
- 同步删除上述功能相关的 i18n 文案、热键、Tauri 端集成(如 OCR 全局热键、写作热键)、Promotion 远程配置拉取、依赖项(`tesseract.js` 等)与测试。

## Capabilities

### New Capabilities

- `translation-core`:聚焦后的翻译主流程 —— 输入语言检测、目标语言选择、调用 LLM 获取翻译结果、流式渲染、复制/朗读输出。
- `llm-provider-config`:三类 Provider(`openai-chat` / `openai-responses` / `anthropic`)的多份配置管理:增删改查配置、设置默认配置、为单次翻译临时切换配置、自定义 Endpoint 与模型。
- `text-to-speech`:朗读能力 —— 朗读源文本与翻译结果,包含 Edge TTS、系统 TTS 与 OpenAI TTS 三种 backend(后者复用 LLM Provider 凭据);音量/语速/voice/模型选择。
- `language-detection`:输入文本的语言检测,支持本地与可选的远端检测引擎(`local` / `google` / `baidu` / `bing`),以及目标语言推断。

### Modified Capabilities

无既有 spec(`openspec/specs/` 当前为空),本次为首批引入的能力规约。

## Impact

- **代码影响**:
  - 删除 `src/common/engines/` 下除三类抽象/协议实现外的所有 provider 文件;重写 `src/common/engines/index.ts` 与 `abstract-openai.ts`,新增 `abstract-anthropic.ts`、`openai-responses.ts`(若不存在)。
  - 新增 `src/common/engines/protocols/*.ts` 中的 `listModels(providerConfig): Promise<string[]>` 入口,以及统一的模型过滤工具 `filterChatModels(ids)` / `filterTTSModels(ids)`(`src/common/engines/model-filter.ts`)。
  - 在 `src/common/tts/` 下新增 `openai-tts.ts` backend,与 Edge / system 并列。
  - 删除 `src/common/components/Vocabulary.tsx`、`ActionForm.tsx`、`ActionManager.tsx`、`IconPicker.tsx`(若仅 Action 用)。
  - 删除 `src/common/internal-services/{action,vocabulary}.ts` 与 `src/common/services/{action,vocabulary,promotion}.ts`;删除 `src/common/hooks/usePromotionShowed.ts`、`usePromotionNeverDisplay.ts` 以及 `Translator.tsx` / `Settings.tsx` 中所有 promotion UI、远程拉取、提示点、disclaimer 与统计事件。
  - 大幅瘦身 `src/common/components/Translator.tsx`(移除 OCR、写作模式、画词面板等分支),瘦身 `Settings.tsx`(移除对应设置项,新增 Provider 配置列表 UI)。
  - 大幅瘦身 `src/common/translate.ts`(移除非 `translate` 模式分支)、`src/common/types.ts`(重写 `ISettings` 与新增 `ProviderConfig`)、`src/common/constants.ts`(移除 `builtinActionModes` 中非翻译项)。
  - 浏览器扩展侧移除 `webRequest` 权限与 ChatGPT Arkose / Kimi / ChatGLM token 捕获逻辑;删除旧厂商固定 `host_permissions`,改为官方 endpoint 固定权限 + 自定义 endpoint 的运行时可选 host permission;删除 options page promotion id 传递逻辑。
  - Tauri 侧移除 OCR 与写作的完整链路:Rust 模块/命令(`src-tauri/src/ocr.rs`、`writing.rs`、`main.rs` invoke 注册)、托盘 OCR 菜单、`action_manager` / `screenshot` 窗口、前端 bindings/window 映射、capabilities、`resources/bin/ocr_*` 与仅供这些功能使用的 Cargo 依赖。
- **依赖影响**:移除 `tesseract.js` 等仅用于已删功能的依赖;清理被删 provider 引入的 SDK(若存在)。
- **存储/迁移影响**:本变更按新 App 处理。首次启动初始化 `providers: []`、`defaultProviderId: null`;旧 `localStorage` / IndexedDB 中的旧 Provider 字段、生词本、Action 数据、OCR/写作设置均不迁移,并在新 schema 写回时清理或忽略。
- **i18n 影响**:批量删除已移除功能相关的翻译键。
- **测试影响**:删除/重写引擎、translate、组件相关测试;新增 Provider 配置管理测试。
- **文档影响**:更新 `README.md` / `README-CN.md` / `AGENTS.md` 中的功能列表、provider 列表与截图说明。
