## 1. 准备与基线

- [x] 1.1 在 `main` 上打 tag `v-pre-slim` 作为回退基线
- [x] 1.2 在 `pnpm why` + `grep` 双重确认下,记录 `tesseract.js` 等候删依赖的引用清单到本地笔记
- [x] 1.3 浏览并记录 `Translator.tsx` / `Settings.tsx` 中所有 OCR / 写作 / 画词 / Action 相关代码块行号(便于后续删除时核对)

## 2. 类型与存储 schema

- [x] 2.1 在 `src/common/types.ts` 新增 `ProviderProtocol = 'openai-chat' | 'openai-responses' | 'anthropic'` 联合类型
- [x] 2.2 在 `src/common/types.ts` 新增 `ProviderConfig` 接口(`id / name / protocol / apiKey / endpoint? / model / extraHeaders?`)
- [x] 2.3 在 `ISettings` 中新增 `providers: ProviderConfig[]` 与 `defaultProviderId: string | null`
- [ ] 2.4 从 `ISettings` 删除旧 Provider 字段(`apiKeys` / `apiURL` / `apiModel` / `provider` / `chatgptModel` / `azure*` / `miniMax*` / `gemini*` / `moonshot*` / `deepSeek*` / `customModelName`),不标 deprecated、不保留读取路径
- [x] 2.5 删除 `ISettings` 中 `defaultTranslateMode` / `writingTargetLanguage` / `writingHotkey` / `writingNewlineHotkey` / `ocrHotkey` / `autoCollect` 字段
- [x] 2.6 删除 `TranslateMode` 类型导出与所有引用,在 `translate.ts` 内仅保留 `'translate'` 单一隐式模式
- [x] 2.7 在 `src/common/utils.ts` 中实现新 schema 初始化/规范化:缺省返回 `providers: []`、`defaultProviderId: null`;旧字段只在写回时清理或读取时忽略,不转换为 ProviderConfig
- [x] 2.8 在 `getSettings()` / `setSettings()` 周边确保只读写新 schema 字段,不会写回 `provider`、`apiKeys`、`azure*`、`chatgpt*` 等旧字段
- [x] 2.9 为 settings 初始化/清理编写单元测试:覆盖新安装为空 Provider、旧 OpenAI 字段不迁移、旧 Azure 字段不迁移、未识别 Provider 不兜底、已是新 schema 保持不变

## 3. 新 Provider 协议引擎

- [ ] 3.1 在 `src/common/engines/interfaces.ts` 中改写 `IEngine` 与导出 `getEngine(providerConfig: ProviderConfig): IEngine`
- [x] 3.2 新建 `src/common/engines/protocols/openai-chat.ts`,实现 OpenAI Chat Completions SSE 流式翻译(从原 `abstract-openai.ts` 与 `openai.ts` 提炼,删除 polishing/summarize/analyze/explain-code/big-bang 分支)
- [x] 3.3 新建 `src/common/engines/protocols/openai-responses.ts`,实现 OpenAI Responses API(`/v1/responses`)流式翻译
- [x] 3.4 新建 `src/common/engines/protocols/anthropic.ts`,实现 Anthropic Messages API SSE 流式翻译(从原 `claude.ts` 提炼)
- [x] 3.5 在 `src/common/openai-api-path.ts` 中扩展 endpoint 归一化函数,使其能处理 base URL 与含 `/chat/completions`、`/responses`、`/messages`、`/audio/speech` 完整路径两种输入
- [x] 3.6 在 `src/common/engines/index.ts` 中实现新 `getEngine(providerConfig)` 工厂,根据 `protocol` 返回对应实现
- [x] 3.7 为三种协议各写一份单元测试:成功流、4xx、5xx、网络中断、`signal.abort()` 行为;覆盖 Chat Completions `choices[].delta.content` + `[DONE]`,Responses `response.output_text.delta` + `response.completed`,Anthropic `content_block_delta(text_delta)` + `message_stop`
- [x] 3.8 为 `openai-api-path` 的归一化新增 case 并通过 `openai-api-path.spec.ts`
- [x] 3.9 在每个协议实现中暴露 `listModels(providerConfig): Promise<string[]>`:`openai-chat` / `openai-responses` 调用 `GET {endpoint}/models`(`Authorization: Bearer ...`);`anthropic` 调用 `GET {endpoint}/v1/models`(`x-api-key` + `anthropic-version: 2023-06-01`)
- [x] 3.10 新建 `src/common/engines/model-filter.ts`,导出 `filterChatModels(ids)`(黑名单:embedding / realtime / audio / whisper / transcribe / moderation / tts / dall-e / gpt-image / image / sora / search-preview)与 `filterTTSModels(ids)`(白名单:`/^tts-1(-hd)?$/i`、`/^gpt-4o-mini-tts(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/i`)
- [x] 3.11 为 `model-filter.ts` 编写单元测试:覆盖 spec 中"标准 OpenAI 列表过滤"、"未知前缀的新模型保留"、"大小写不敏感"三类场景,以及 `filterTTSModels` 接受 `gpt-4o-mini-tts-YYYY-MM-DD` 但不接受 `gpt-4o-tts`
- [x] 3.12 为 `listModels` 编写单元测试:覆盖成功、404/405、超时、响应缺 `data` 字段四类降级路径

## 4. translate.ts 重写

- [x] 4.1 删除 `TranslateQuery` 中 `mode / writing / articlePrompt` 字段,保留 `text / detectFrom / detectTo / selectedWord? / signal / onMessage / onError / onFinish / onStatusCode?`
- [x] 4.2 删除 `TranslateQueryBigBang` 重载与所有 `mode === 'polishing' | 'summarize' | 'analyze' | 'explain-code' | 'big-bang'` 分支
- [x] 4.3 修改 `translate(query)` 内部:从 `getSettings()` 取 `defaultProviderId` 与对应 `ProviderConfig`(若主界面传入了临时 `providerId`,优先使用该值);以新 `getEngine(providerConfig)` 调用
- [x] 4.4 保留并简化 `isAWord` + 单词模式 prompt 选择逻辑,确认 `selectedWord` 路径仍工作
- [x] 4.5 删除 `translate.ts` 中所有与已删模式相关的 prompt 构造函数
- [x] 4.6 更新或新增 `translate.ts` 单元测试,覆盖普通句子翻译、单词模式、`signal.abort` 中止、错误上报路径

## 5. 主界面 Translator.tsx 瘦身

- [x] 5.1 删除 `Translator.tsx` 中 OCR 相关 import(`tesseract.js`、`createWorker`、`RecognizeResult`)、状态(`isOCRProcessing`、worker)、UI(上传图片按钮、OCR 提示、OCR 进度)与处理函数
- [x] 5.2 删除写作助手相关 UI、状态、热键监听(`writingHotkey` / `writingNewlineHotkey`)
- [x] 5.3 删除画词面板入口、`vocabularyType` 状态、`'vocabulary'` 类型分支、与 `vocabularyService` 的交互调用
- [x] 5.4 删除 ActionManager / Action 选择器入口与 `'big-bang'` / `'polishing'` 等模式按钮
- [ ] 5.5 替换"Provider 选择"控件:把原来按 `provider` 枚举画的下拉,改为渲染 `settings.providers` 列表的下拉(显示 `name`,选中后写入运行时状态,不修改 `defaultProviderId`)
- [ ] 5.6 翻译触发逻辑改为传入运行时选定的 `providerId` 给 `translate(...)`(若未临时切换则等于 `defaultProviderId`)
- [ ] 5.7 为"无可用 Provider"场景渲染禁用态 + 引导文案(链接到设置页)
- [ ] 5.8 验证 `SpeakerIcon` / `SpeakerMotion` 仍能朗读源文与译文,且不依赖任何已删模块

## 6. Settings.tsx 重构

- [x] 6.1 删除 OCR 热键、写作热键、写作语言等设置项 UI
- [x] 6.2 删除画词、Action、生词本相关设置项 UI
- [ ] 6.3 删除按厂商列出的 API Key / API URL / Model 表单(OpenAI、Azure、Gemini、MiniMax、DeepSeek、Moonshot 等独立块)
- [ ] 6.4 新增 "LLM Providers" 区块:列表 + 新增按钮 + 编辑/删除/设为默认
- [ ] 6.5 新增 "添加/编辑 Provider" 表单组件 `ProviderForm.tsx`(在 `components/Form/` 内或独立文件):字段 `name / protocol(下拉) / apiKey / endpoint(可选) / model(Combobox) / extraHeaders(可选高级折叠)`
- [ ] 6.6 表单内不提供第三方厂商模板;只提供协议选择、官方默认 endpoint 说明与用户手填 endpoint/model 输入
- [ ] 6.7 表单校验:`name` / `apiKey` / `model` 非空;`endpoint` 若非空必须为合法 URL
- [ ] 6.8 实现"设为默认":修改 `settings.defaultProviderId`
- [ ] 6.9 实现"删除":若被删条目为默认,落到 `providers[0].id`;若删后为空,设为 `null`
- [ ] 6.10 实现"模型 Combobox":apiKey 输入框 blur 后若 endpoint+apiKey 完整则自动调用 `listModels` + `filterChatModels` 渲染下拉;提供"刷新"按钮重新拉取;失败时降级为纯文本输入并 toast;允许任意手填值优先生效
- [ ] 6.11 保留并完善 TTS provider / voice / volume / rate 设置 UI
- [ ] 6.12 在 TTS 设置区新增 OpenAI TTS 子区:provider 引用下拉(仅显示 `openai-chat` / `openai-responses`,Anthropic 条目隐藏或禁用)、模型 Combobox(经 `filterTTSModels` 白名单过滤,空时引导手填)、voice 下拉(内置 `alloy / ash / ballad / coral / echo / fable / onyx / nova / sage / shimmer / verse / marin / cedar` + 自定义输入/voice id)、音频格式下拉(默认 mp3,含 pcm)
- [x] 6.13 实现"dangling 引用检测":在 `getSettings` 或 settings 写回前检查 `settings.tts.openai.providerId` 是否仍存在于 `settings.providers`,若不存在则把 `settings.tts.provider` 回退为 `'edge'` 并通过 toast 通知
- [ ] 6.14 保留 languageDetectionEngine、defaultTargetLanguage、热键(主热键、显示窗口热键)、proxy、theme 等保留设置

## 7. OpenAI TTS Backend

- [x] 7.1 在 `src/common/types.ts` 扩展 `TTSProvider` 联合为 `'edge' | 'system' | 'openai'`
- [x] 7.2 在 `ISettings.tts` 中新增可选字段 `openai?: { providerId: string; model: string; voice: string | { id: string }; format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'; instructions?: string }`
- [x] 7.3 新建 `src/common/tts/openai-tts.ts`:实现 `speak({ text, lang, signal })`,内部读取 `settings.tts.openai`,从 `settings.providers` 找到对应 ProviderConfig,组装 `POST {endpoint}/audio/speech` 请求(`Authorization: Bearer <apiKey>` + `extraHeaders`),请求体 `{ model, voice, input, response_format, speed?, instructions? }`,响应转 `Blob` 并通过 `<audio>` 播放
- [x] 7.4 在 `src/common/tts/index.ts` 中按 `settings.tts.provider` 分派到 edge / system / openai 三个 backend
- [x] 7.5 endpoint 路径归一化复用 `openai-api-path` 工具,确保自定义 endpoint 与官方 endpoint 在 `/audio/speech` 拼接上一致
- [x] 7.6 错误处理:401 / 4xx / 5xx / 网络错误 → toast 可读消息,按钮恢复非播放态;不自动 fallback 到 edge / system
- [x] 7.7 实现长文本分段:OpenAI TTS 单次 `input` 不超过 4096 字符,超长文本按句子/段落拆分并顺序播放
- [x] 7.8 将全局 `rate` 映射为 OpenAI `speed` 并 clamp 到 `0.25..4.0`;仅在 `gpt-4o-mini-tts` 同系列模型上发送 `instructions`
- [x] 7.9 单元测试:成功播放、401 鉴权失败、404 路径未实现、引用 Provider 不存在自动回退 edge、长文本分段、`tts-1` 不发送 instructions 六类场景

## 8. 删除已废弃模块与文件

- [x] 8.1 删除 `src/common/components/Vocabulary.tsx`
- [x] 8.2 删除 `src/common/components/ActionManager.tsx`、`ActionForm.tsx`
- [x] 8.3 若 `IconPicker.tsx` 仅 Action 用,删除;否则核查后保留
- [x] 8.4 删除 `src/common/internal-services/action.ts`、`vocabulary.ts`
- [x] 8.5 删除 `src/common/services/action.ts`、`vocabulary.ts`
- [x] 8.6 完全删除 Promotion 系统:`src/common/services/promotion.ts`、`src/common/hooks/usePromotionShowed.ts`、`src/common/hooks/usePromotionNeverDisplay.ts`;从 `src/common/hooks/global.ts` 删除 `promotionShowedMap` / `promotionNeverDisplayMap`
- [x] 8.7 删除 `src/common/constants.ts` 中 `builtinActionModes` 数组及其类型
- [ ] 8.8 删除 `src/common/engines/{azure,cerebras,chatglm,chatgpt,claude,cohere,deepseek,gemini,groq,kimi,minimax,moonshot,ollama,openai}.ts`
- [ ] 8.9 删除 `src/common/engines/abstract-openai.ts` + `abstract-openai.spec.ts`(逻辑已迁入 `protocols/openai-chat.ts`),或就地改名简化
- [ ] 8.10 删除 `src/common/engines/abstract-engine.ts`(若新接口完全替代)
- [ ] 8.11 删除 IndexedDB 中 `Action` 表,简化 `HistoryItem` schema(`id / createdAt / fromLang / toLang / sourceText / translatedText / providerId / model`),旧 history 表 drop & recreate
- [x] 8.12 在 `src/tauri/utils.ts` 移除 OCR 全局热键注册 + 写作热键注册
- [x] 8.13 删除 Rust OCR/写作模块与命令:`src-tauri/src/ocr.rs`、`src-tauri/src/writing.rs`;从 `src-tauri/src/main.rs` 移除 `mod ocr` / `mod writing` 与 `cut_image` / `screenshot` / `start_ocr` / `finish_ocr` / `writing_command` / `finish_writing` / `write_to_input` invoke handlers
- [x] 8.14 从 `src-tauri/src/tray.rs` 删除 OCR 菜单与 `ocr()` 调用;从 `src-tauri/src/windows.rs` 删除 `ACTION_MANAGER_WIN_NAME` / `SCREENSHOT_WIN_NAME` 及对应 show/get 函数
- [x] 8.15 删除 Tauri 前端窗口与绑定:`src/tauri/windows/ActionManagerWindow.tsx`、`ScreenshotWindow.tsx`;从 `src/tauri/App.tsx`、`src/tauri/bindings.ts`、`src/tauri/windows/TranslatorWindow.tsx` 移除 action_manager / screenshot / OCR / writing 入口
- [x] 8.16 从 `src-tauri/capabilities/migrated.json` 删除 `action_manager` / `screenshot`;删除 `src-tauri/resources/bin/ocr_apple` 与 `src-tauri/resources/bin/ocr_intel`
- [x] 8.17 在 `src/browser-extension/` 与 `src-safari/` background 脚本中移除 OCR、写作、画词相关消息处理与上下文菜单条目
- [x] 8.18 移除浏览器扩展 `webRequest` permission 与 ChatGPT Arkose / Kimi / ChatGLM token 捕获 listener;删除旧厂商固定 `host_permissions`,实现自定义 endpoint 的 optional host permission 请求/拒绝处理
- [x] 8.19 从 `Translator.tsx` 删除 promotion 拉取/定时刷新/focus 刷新/设置入口提示点/`headerPromotionID` 与 `openaiAPIKeyPromotionID` 传递;从 `Settings.tsx` 删除 header promotion、OpenAI API Key promotion、disclaimer promotion modal、promotion 相关统计事件
- [x] 8.20 删除浏览器扩展 promotion id 传递:`src/browser-extension/common.ts` 中的 `optionsPageOpenaiAPIKeyPromotionIDKey` / `optionsPageHeaderPromotionIDKey`,options page 读取逻辑,background `openOptionsPage` 对 promotion id 的 storage 写入

## 9. i18n 与文案清理

- [ ] 9.1 在所有 `src/common/i18n/locales/*/translation.json` 中删除"Upload an image for OCR translation"、"OCR Hotkey"、"Writing"、"Vocabulary"、"Polishing"、"Summarize"、"Analyze"、"Explain Code"、"Action"等已无引用的键
- [ ] 9.2 新增 LLM Provider 列表 / 表单相关 i18n 键(中英为主,其它语言保留 fallback 到英文即可)
- [ ] 9.3 新增"无可用 Provider"引导文案 i18n 键
- [ ] 9.4 新增 OpenAI TTS 相关 i18n 键(关联 Provider、模型、voice、音频格式、错误提示)
- [x] 9.5 删除 Promotion 相关文案、样式与测试 fixture;确认 UI 不再出现 promotion、推广、公告、API Key 提示点等旧文案

## 10. 依赖与构建

- [x] 10.1 从 `package.json` 移除 `tesseract.js` 与其它经核查仅供已删模块使用的依赖;从 `src-tauri/Cargo.toml` 移除仅供 OCR/写作用的 `screenshots`、`image`、`text-diff`、`similar`;运行 `pnpm install` 更新 lockfile
- [x] 10.2 运行 `pnpm lint` 与 `tsc --noEmit`,修复因删除产生的 import / type 报错
- [x] 10.3 运行 `pnpm test`(vitest)使所有单元测试绿
- [x] 10.4 运行 `pnpm test:e2e`(playwright)修复或删除已不可达的 e2e 用例(OCR / 写作 / 画词 / Action 相关)
- [ ] 10.5 在浏览器扩展中(Chromium 或 Firefox)启动 `pnpm dev-chromium` 手测翻译 + 朗读(三种 backend) + Provider 切换 + 模型刷新
- [ ] 10.6 在桌面端运行 `pnpm dev-tauri` 手测同上 + 主热键 + 显示窗口热键

## 11. 文档与发布

- [ ] 11.1 更新 `README.md` / `README-CN.md`:功能列表、provider 列表、模型自动发现说明、OpenAI TTS 章节、截图替换、移除 OCR/写作/画词章节
- [ ] 11.2 在 `AGENTS.md` 中更新代码地图与"被移除模块"清单
- [ ] 11.3 撰写 `CHANGELOG.md`(若不存在则新增)BREAKING 段:列出删除项、说明旧 Provider/旧历史数据不迁移、回退方法(切到 `v-pre-slim` tag)
- [ ] 11.4 在 `package.json` 中升级 major 版本号(0.1.x → 1.0.0,或按现行约定)
- [ ] 11.5 在 GitHub Release notes 中复述 BREAKING 内容并附旧 tag 链接

## 12. 验证

- [ ] 12.1 重新运行 `openspec status --change slim-to-translation-core`,确认所有 artifact `done` 且 change `isComplete: true`
- [ ] 12.2 全文搜索仓库,确认不存在对 `tesseract`、`vocabulary`、`writingHotkey`、`ocrHotkey`、`'polishing'`、`'summarize'`、`'analyze'`、`'explain-code'`、`'big-bang'`、`builtinActionModes` 的残留引用
- [ ] 12.3 全文搜索 `engines/azure|cerebras|chatglm|chatgpt|claude|cohere|deepseek|gemini|groq|kimi|minimax|moonshot|ollama|openai` 路径无残留 import;`openai` 仅允许出现在新协议/官方 endpoint/文档语境
- [ ] 12.4 在干净的浏览器 profile 与全新 Tauri 配置下重启,验证首次启动引导(无 Provider 时禁用翻译并提示)
- [ ] 12.5 用一份带旧 settings 的浏览器 profile 启动,验证旧 OpenAI / Azure / 未识别 Provider 字段不会产出 ProviderConfig,保存后不再写回旧字段
- [ ] 12.6 配置一份 OpenAI Provider,验证 Provider 表单的"刷新模型"下拉显示已过滤的对话模型,Combobox 手填值仍可生效
- [ ] 12.7 把 TTS 切到 OpenAI,验证模型 Combobox 仅显示 `tts-1` / `tts-1-hd` / `gpt-4o-mini-tts` / `gpt-4o-mini-tts-YYYY-MM-DD`,选定后朗读成功
- [ ] 12.8 删除被 OpenAI TTS 引用的 Provider,验证 TTS 自动回退到 Edge 并 toast 提示
- [ ] 12.9 在浏览器扩展中配置自定义 endpoint,验证 optional host permission 授权通过后可刷新模型,拒绝授权时不会发起请求
- [ ] 12.10 全文搜索 `Azure`、`azureAPI`、`api-key`、`webRequest`、`Arkose`、`keyKimiAccessToken`、`keyChatGLMAccessToken`、`action_manager`、`screenshot`、`ocr_images`、`resources/bin/ocr`、`writing-text`,确认仅允许文档/变更说明中的残留
- [ ] 12.11 全文搜索 `promotion`、`Promotion`、`promotions.json`、`optionsPageOpenaiAPIKeyPromotionIDKey`、`optionsPageHeaderPromotionIDKey`、`promotion_view`、`promotion_clicked`,确认不存在运行时代码残留
