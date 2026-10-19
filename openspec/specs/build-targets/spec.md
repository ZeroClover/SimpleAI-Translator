# build-targets Specification

## Purpose
定义 SimpleAI Translator 不再提供的构建与发布目标：userscript 与 Safari Web Extension 已移除，仓库与发布流程不保留它们的任何构建或运行时代码。

## Requirements

### Requirement: 不提供 userscript 与 Safari 目标

项目 SHALL NOT 提供 userscript（Tampermonkey / Violentmonkey）或 Safari Web Extension 构建目标。仓库 SHALL NOT 包含这两个目标的构建配置、平台适配代码、工程文件或打包脚本；`package.json` SHALL NOT 提供 `build-userscript` 脚本，也 SHALL NOT 依赖只为这两个目标存在的工具包；共享代码 SHALL NOT 为它们保留运行时分支。本要求不限制其它既有产物，例如浏览器扩展、桌面端、PopClip / SnipDo 剪贴板扩展、更新器元数据与校验和。

#### Scenario: 发布产物不含 userscript

- **WHEN** release workflow 为一个版本组装 GitHub Release
- **THEN** 产物 SHALL NOT 包含 `.user.js` 文件

#### Scenario: 仓库不含被移除目标

- **WHEN** 检查仓库根目录、`package.json`、`Makefile` 与 `src/`
- **THEN** SHALL NOT 存在 `vite.config.userscript.ts`、`src-safari/`、`src/common/polyfills/userscript.ts` 或 `build-userscript` 脚本与 Make 目标
- **AND** 在 `src/` 中按全词搜索 `isUserscript`、`GM_info`、`GM.getValue` SHALL NOT 命中

#### Scenario: 文档不再介绍被移除目标

- **WHEN** 用户阅读 `README.md` 或 `README-CN.md` 的安装与构建说明
- **THEN** 文档 SHALL NOT 提供 userscript 或 Safari 的安装与构建说明
