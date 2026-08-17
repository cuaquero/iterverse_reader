# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

本仓库（koodo-bridge）是 Koodo Reader 的 BTECH（Bridgerland Technical College）定制分支：一个纯 Web 电子书阅读器（React CRA + Redux），面向 Cloudflare 部署并计划嵌入 Canvas LMS（通过 LTI）。

**重要变更**：上游 Koodo Reader 是跨平台 Electron 应用，但本分支已完全移除 Electron 打包 —— 没有 `main.js`、没有原生 SQLite（better-sqlite3）、没有桌面安装包/IPC 通道。所有数据库操作现在都走浏览器端存储（IndexedDB via `localforage`，或 File System Access API 用于本地文件夹同步），详见 `src/utils/storage/databaseService.ts` 的非 Electron 分支。代码中仍大量存在 `isElectron`（来自 `react-device-detect`）判断分支和 `window.require("electron")` 调用 —— 这些在本分支中永远不会执行（`isElectron` 恒为 `false`），是有意保留的死代码，而非 bug；除非有新的理由重新引入 Electron，否则不需要清理它们。

### 三层架构

| 层 | 位置 | 职责 |
|---|------|------|
| React 应用 | `src/` | UI, Redux 状态管理, 书籍渲染, 浏览器端存储 |
| 阅读引擎 | `src/assets/lib/kookit-extra.min.mjs` | 闭源 ESM — 书籍解析、SQL 语句、同步工具 |
| Go HTTP 服务 | `httpserver/` | 可选的 KOReader / OPDS 集成 |

## 重要提醒

**不要**尝试读取 `src/assets/lib/` 下的这些文件：
- `kookit-extra.min.mjs`
- `kookit.min.js`
- `kookit-extra-browser.min.js`

这些是混淆/压缩后的产物，无法阅读。如需查阅源码，请直接读取本地源码仓库：
- `D:\Project\kookit`
- `D:\Project\kookit-extra`

### Redux 切片

`book`, `reader`, `manager`, `viewArea`, `backupPage`, `sidebar`, `progressPanel`

每个切片在 `src/store/actions/` 和 `src/store/reducers/` 中各有一个文件。

### Redux State 类型

`stateType` 定义在 `src/store/index.tsx` 中，所有 `mapStateToProps` 应使用此类型。

### Container 模式

`index.tsx` (Redux connect) → `component.tsx` → `interface.tsx`，位于 `src/containers/` 下。

### 页面路由

- `/manager/*` — 主界面（书库、笔记、回收站等）
- `/epub`, `/pdf`, `/mobi`, `/txt`, `/md` 等格式路径 — 阅读器
- `/login`, `/stats`, `/redirect`

### 支持的电子书格式

EPUB, PDF, MOBI, AZW3, AZW, TXT, FB2, CBR/CBZ/CBT/CB7, MD, DOCX, HTML/XML/XHTML/MHTML/HTM

## 常用命令

```bash
# 安装依赖（初次）
yarn

# 开发模式（浏览器热重载）
yarn start

# 构建生产版本（静态文件，用于 Cloudflare Pages 等部署）
yarn build

# 运行测试
yarn test
```

## 开发规范

- 用户可见文本必须使用 `react-i18next` 的 `t("key")`，不得硬编码
- TypeScript 避免 `any`，在 `interface.tsx` 中定义类型
- 状态类型用 `stateType`（`src/store/index.tsx`）
- 数据库操作通过 `src/utils/storage/databaseService.ts`（浏览器端 IndexedDB/localforage），不要引入新的 Electron/IPC 依赖
- 新增 i18n key 需在 `src/assets/locales/en.json` 中添加
- Reader 工具函数（`src/utils/reader/`）会影响 iframe 中书籍渲染，修改后需手动回归测试
- 不要将令牌、密码或完整书籍路径记录到 info 级别日志

## 项目结构

```
.
├── httpserver/             # Go HTTP 服务 (KOReader/OPDS)
├── public/                 # 静态资源 + WASM 库 (7z, unrar, pdfjs)
├── src/
│   ├── assets/
│   │   ├── lib/            # 阅读引擎 (kookit-extra.min.mjs) + 类型定义
│   │   ├── locales/        # 多语言翻译 JSON (40+ 语言)
│   │   ├── styles/         # 全局 CSS
│   │   └── images/         # 图片资源
│   ├── components/         # 可复用 UI 组件
│   ├── constants/          # 常量定义
│   ├── containers/         # 容器组件 (Redux stateful)
│   │   ├── lists/          # 列表 (bookList, cardList, noteList, navList, contentList)
│   │   ├── panels/         # 面板 (navigationPanel, operationPanel, progressPanel, settingPanel)
│   │   ├── settings/       # 设置页面各选项卡
│   │   ├── sidebar/        # 侧边栏
│   │   └── viewer/         # 书籍阅读视图
│   ├── models/             # 数据模型 (Book, Bookmark, Note, HtmlBook, Plugin)
│   ├── pages/              # 页面级组件 (manager, reader, login, redirect, stats)
│   ├── router/             # React Router 路由配置
│   ├── store/              # Redux (actions + reducers)
│   └── utils/              # 工具函数
│       ├── file/           # 文件操作 (bookUtil, coverUtil, fontUtil, sqlUtil, export, backup, restore)
│       ├── reader/         # 阅读器逻辑 (highlightUtil, noteUtil, styleUtil, ttsUtil, themeUtil, etc.)
│       ├── request/        # HTTP 请求
│       └── storage/        # 存储服务 (databaseService, syncService)
└── scripts/                # i18n 工具脚本 (extract-untranslated, merge-translations)
```
