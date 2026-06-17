# 代码库优化清单

基于对 Tauri 2 项目最佳实践的分析，按优先级整理。每项含**问题**、**证据（文件:行）**、**建议**。

---

## 🔴 高优先级

### 1. `package.json` 残留 Electron 死配置

**问题**：项目已迁移到 Tauri，`src/` 下无任何 Electron 源码（`find src -path "*electron*"` 为空），但 package.json 仍保留完整 Electron 配置。

**证据**：
- `package.json:65` — `"electron-store": "^8.1.0"`（生产依赖，全代码库无 `import`）
- `package.json:123-124` — `"electron": "^23.1.3"`、`"electron-util": "0.17.x"`（无引用）
- `package.json:152-195` — 整个 `"build"` 块指向不存在的 `dist/electron/main`、`src/electron/assets/images/icon.png`
- `package.json:6` — `"main": "index.js"`（不存在的文件）

**建议**：
- 删除 `"build"` 整块、`"main"` 字段
- 删除依赖：`electron-store`、`electron`、`electron-util`
- 影响：`pnpm install` 减少数百 MB 无用包

### 2. 仓库根目录 4.9MB 未跟踪二进制 `actionlint`

**问题**：`actionlint`（4.9 MB 可执行文件）和 `.pnpm-store/` 在工作区根目录。

**证据**：
- `actionlint` 文件大小 4.9M，`git ls-files --error-unmatch actionlint` 显示未跟踪
- `.gitignore` 未忽略 `.pnpm-store/`

**建议**：
- `actionlint` 改为 CI 中通过 `taiki-e/install-action` 动态安装，或移至 `scripts/` 并加入 `.gitignore`
- `.gitignore` 补充 `.pnpm-store/`

### 3. 删除 `package.json-e` 本地残留

**问题**：`package.json-e` 与 `package.json` 内容几乎一致，`.gitignore` 已忽略 `*.json-e`（不会进 git），但留在工作区有误导性。

**建议**：直接删除 `package.json-e`。

---

## 🔴 高优先级：Tauri 安全 / 最佳实践

### 4. Capabilities 权限过宽（安全风险）

**问题**：`src-tauri/capabilities/migrated.json` 是 Tauri v1 迁移自动生成的"万能权限"，违反 Tauri 2 最小权限原则。

**证据**：
- `"fs:read-all"` + `"fs:write-all"` + scope `"**"` — 前端可读写任意路径
- 60+ 个 `core:window:allow-*`，多数未用（如 `set-cursor-position`、`set-ignore-cursor-events`）
- `"windows"` 数组含 `"thumb"`，代码中只有 `translator/settings/updater/history` 四个窗口
- 文件名 `migrated.json` 无语义

**建议**：
- 删除 `"thumb"` 窗口
- `fs` 收紧到实际目录（项目只读写 `config.json`，应只需 `$CONFIG/**`）
- 文件重命名为 `main.json`，按窗口拆分权限

### 5. `main.rs` 手动 `Box::leak` Tokio runtime（反模式）

**问题**：`src-tauri/src/main.rs:68-91` 手动构造 Tokio runtime 并永久 `Box::leak`，再 `tauri::async_runtime::set(...)` 覆盖 Tauri 默认 runtime，无注释说明原因。

**建议**：Tauri 2 默认已提供 `tauri::async_runtime`（基于 tokio）。除非有"全局共享自定义 multi-thread runtime"的明确需求，应删除 `init_tokio_runtime()`，直接用 `tauri::async_runtime::spawn`。

### 6. `withGlobalTauri: true` + `csp: null`

**证据**：
- `src-tauri/tauri.conf.json:65` — `withGlobalTauri: true` 把 Tauri API 注入 `window.__TAURI__`，但项目已用 specta 生成的 `src/tauri/bindings.ts`，两套访问方式冗余
- `src-tauri/tauri.conf.json:68` — `csp: null` 完全关闭 CSP

**结论**（已评估）：
- `withGlobalTauri: true` **保留**：`src/common/utils.ts:441` 的 `isTauri()` 检查 `window.__TAURI__`，是整个 desktop/web 分支的判定原语；关闭会破坏桌面检测。
- **CSP 已设置**：default-src 'self'，script-src 'self'，style-src 'self' 'unsafe-inline'（Styletron/Base Web 运行时注入），connect-src 开放（用户自定义 LLM 端点）。


---

## 🟡 中优先级：文件组织结构

### 7. `src/common/` 根目录文件过多、缺乏分层

**问题**：`src/common/` 根目录直接堆 13 个 `.ts` 文件 + 子目录混在一起，扁平化过度。

**证据**：
- `translate.ts`、`types.ts`、`utils.ts`（718 行）、`token.ts`、`store.ts`、`user-event.ts`、`usehooks.ts`、`universal-fetch.ts`、`geo.ts`、`geo-data.ts`、`traditional-or-simplified.ts`（17 KB）、`openai-api-path.ts`、`i18n.js` + `i18n.d.ts` + `i18n/`、`constants.ts`
- `i18n.js` / `i18n.d.ts` / `i18n/` 三件套分散：`i18n.js` 是普通 JS（AGENTS.md 要求 TS）；`i18n.d.ts` 只有一行 `declare module 'i18next'`（见 #11）
- `store.ts`（zustand）vs `store/setting.ts`（jotai atom）共存 — `store/` 目录只有 1 个文件
- `geo.ts` / `geo-data.ts` 拆分注释写 "a separate file for bypassing spell check"（过时 hack）

**建议**：
- 合并 `i18n.js` + `i18n/` 为 `i18n/index.ts`
- 评估 `store.ts` 并入 `store/` 目录
- 合并 `geo.ts` / `geo-data.ts`

### 8. 状态管理库不统一（4 种并存）

**问题**：项目同时使用 zustand、jotai、react-hooks-global-state、swr。

**证据**：
- zustand — `src/common/store.ts`
- jotai — `src/common/store/setting.ts`、`src/common/components/Translator.tsx`、`src/tauri/components/Window.tsx`
- react-hooks-global-state — `src/common/hooks/global.ts`（只有 1 个 `pinned` boolean）
- swr — `src/common/hooks/useSettings.ts`、`useThemeType.ts`

**建议**：选定 1 个全局状态库（推荐 zustand，已承担跨窗口状态），逐步迁移 `pinned`（`react-hooks-global-state` 全项目只用了 1 个 boolean，可立即替代）和 `showSettingsAtom`。

### 9. 测试文件位置与 `test` 脚本不一致

**问题**：AGENTS.md 说 "unit tests live next to the code (`__tests__/foo.test.ts` or `foo.spec.ts`)"，但实际两套并存，且 `test` 脚本指向不存在的目录。

**证据**：
- `src/common/__tests__/translate.test.ts`（唯一用 `__tests__/` 目录）
- 其余 9 个用 `*.spec.ts` 同级
- `package.json:21` — `"test": "vitest test"` 指向不存在的 `test/` 目录

**建议**：
- 统一到 `*.spec.ts` 同级风格（或统一 `__tests__/`）
- `"test": "vitest test"` → `"test": "vitest run"`（vitest 自动发现 spec/test）

### 10. ⏸️ `src-tauri/src/edge_tts.rs` 1152 行单文件（暂不拆分）

**问题**：Edge TTS 完整 WebSocket 协议、token 生成、语音列表、SSML 构造、流式合成全部塞在一个文件。

**结论**（已评估，暂不动）：文件虽大但内聚——60 余个函数共享 `EdgeTtsError`/`CLOCK_SKEW_MILLIS` 等私有状态，且 `mod tests` 通过 `use super::*` 覆盖 auth/headers/text 多个关注点（含硬编码 token 期望值）。强行拆分会破坏私有可见性、迁移测试、且收益有限。按"避免过度设计"原则留待下次该模块大改时随业务改动一起拆。

---

## 🟢 低优先级 / 小改进

### 11. ✅ `src/common/i18n.d.ts` 破坏类型安全（已修复）

**问题**：`src/common/i18n.d.ts` 只有一行 `declare module 'i18next' {}`，会覆盖 i18next 自带类型，丢失所有类型安全。

**处理**：随 Item 7 的 i18n.js → i18n/index.ts 转换一并删除（否则 tsc 报 `Property 'use' does not exist`）。

### 12. `usehooks.ts` 命名与位置违反约定

**问题**：AGENTS.md 要求 hooks 用 `camelCase` 且放在 `hooks/` 目录。

**证据**：`src/common/usehooks.ts` 既不命名规范（应为 `useLazyEffect` 或 `use-lazy-effect`），又在根目录而非 `hooks/`。仅导出 `useLazyEffect`。

**建议**：移到 `src/common/hooks/useLazyEffect.ts`。

### 13. ✅ `Makefile` 与 `package.json scripts` 职责重叠（已处理）

**问题**：`build-browser-extension`、`build-userscript`、`clean` 既在 Makefile 也在 package.json scripts（package.json 调用 make）。

**结论**（已评估）：**保留 Makefile**。CI（release.yaml / test-build.yaml）直接调用 `make build-*`，且 clip-extension 的 zip/cp 打包步骤不适合塞进 package.json；package.json 的薄封装是合理的 `pnpm` 入口。处理掉的实际问题：
- 删除无人引用的 `change-version` 目标；
- 修复 `sed -i -e` 跨平台 bug（macOS BSD 会误建 `-e` 备份文件），改用临时文件重定向，GNU/BSD 均正确。

### 14. `typos.toml` 存在但 `actionlint` 在根目录

**问题**：项目用了拼写与 action lint，但 `actionlint` 二进制直接放根目录。

**建议**：见 #2，改为 CI 动态安装。

---

## ✅ 已符合最佳实践（无需改动）

- **specta + tauri-specta** 生成类型安全的 `src/tauri/bindings.ts`，前端用 `commands`/`events` 而非裸 `invoke` 字符串（除 `legacy-tauri-ipc.ts:40` 一处）
- `src-tauri/gen/schemas/` 正确纳入版本控制
- Rust `Cargo.toml` 用 `cfg(target_os = ...)` 平台条件依赖，划分清晰
- `engines/` 用 protocol 接口隔离 LLM provider
- Vite 配置正确设置 `clearScreen: false`、`strictPort`、`TAURI_DEBUG` sourcemap

---

## 推荐执行顺序

影响从大到小、风险从低到高：

1. **清 `package.json`**：删 electron 依赖、`build` 块、`main` 字段（纯清理，无运行时风险）
2. **删 `package.json-e`、根目录 `actionlint`，补 `.gitignore`**
3. **`vitest test` → `vitest run`**（修复失效的 test 脚本）
4. **收紧 `capabilities/migrated.json`**：删 `thumb` 窗口、`fs:read-all/write-all` → 精确目录（安全收益最大）
5. **删除空的 `i18n.d.ts`**（恢复类型安全，无副作用）
6. （中等）评估去掉 `init_tokio_runtime` 的 `Box::leak`
7. （重构）统一状态管理库、整理 `src/common/` 根目录文件、拆分 `edge_tts.rs`
