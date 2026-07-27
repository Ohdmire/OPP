<div align="center">
  <img src="./public/opp-icon.png" width="112" height="112" alt="OPP logo" />

  # OPP

  **一站式 osu! 工具集合**

  [![Version](https://img.shields.io/badge/version-0.2.8-ff6aa7?style=for-the-badge)](./src-tauri/tauri.conf.json)
  [![Platform](https://img.shields.io/badge/platform-Windows-5ce1e6?style=for-the-badge&logo=windows11&logoColor=white)](#运行要求)
  [![Tauri](https://img.shields.io/badge/Tauri-2-a673ff?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
  [![Vibe Coding](https://img.shields.io/badge/Vibe_Coding-AI_Collaborative-8b5cf6?style=for-the-badge)](#vibe-coding)

  [功能](#功能概览) · [开始使用](#开始使用) · [开发](#本地开发) · [快速入门](./docs/快速入门.md)
</div>

---

OPP 是一个使用 Tauri、Rust 与 React 构建的 Windows 桌面应用。它将 osu! API v2 个人资料与本机 osu!stable / osu!lazer 资源放在同一个分析空间中，同时保持本地文件只读。

开发、模块边界与 AI 协作约定见 [项目快速入门](./docs/快速入门.md)。

> [!IMPORTANT]
> OPP 是独立的社区项目，与 ppy Pty Ltd 或 osu! 官方无隶属关系。osu! 是 ppy Pty Ltd 的商标。

## 功能概览

- 通过官方 osu! API v2 OAuth 登录,查看个人全面数据
- 提供铺面镜像下载批量下载，提供强大筛选器
- 内置 pp calculator 支持不同模式MOD
- 支持本地铺面，皮肤，截图，回放预览，管理
- 支持启动双端游戏，自动记录一次游戏数据变化
- 内置各种实用小工具


当前算法口径为 [`rosu-pp 4.0.1`](https://github.com/MaxOhn/rosu-pp/tree/v4.0.1)，对应
[`ppy/osu@28c846b`](https://github.com/ppy/osu/commit/28c846b4d9366484792e27f4729cd1afa2cdeb66)
（2025-10-13）算法快照。PP 表示谱面原生模式下 `NoMod`、满分、最大连击、零 miss
的理论值，不代表某一次实际成绩。

## Stable 与 Lazer 的区别

| 能力 | osu!stable | osu!lazer |
|:---|:---:|:---:|
| 谱面元数据与难度 | 完整 | 完整 |
| 谱面集归属 | 精确 | 部分推断 |
| Skin 配置 | 完整目录 | legacy 配置候选 |
| Skin 图片与音效归属 | 支持 | 暂不支持 |
| 读取 `client.realm` | 不需要 | **不会读取** |

Lazer 的原始文件名和资源关系保存在 Realm 中。当前版本只读扫描其哈希仓库，因此不会把无法确认的 Skin 或谱面集关系伪装成完整结果。

## 开始使用

### 运行要求

- Windows 10 或 Windows 11
- Microsoft Edge WebView2 Runtime
- osu! 个人 OAuth 应用

从仓库的 [Releases](../../releases/latest) 页面下载最新的 Windows 安装包。

### 配置 OAuth

1. 打开 [osu! 账户设置](https://osu.ppy.sh/home/account/edit)。
2. 创建一个仅供个人使用的 OAuth 应用。
3. 将回调地址设置为：

   ```text
   http://127.0.0.1:42831/oauth/callback
   ```

4. 启动 OPP，填写 Client ID 与 Client Secret。
5. 在系统浏览器中完成 osu! 授权。

请勿把自己的 Client Secret、Token、凭据导出文件或应用数据提交到仓库。

## 本地开发

### 环境

- Node.js 22+
- pnpm 11+
- Rust stable MSVC toolchain
- Windows SDK 与 WebView2

```powershell
pnpm install
pnpm tauri dev
```

### 质量检查

```powershell
pnpm lint
pnpm test
pnpm build

cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

pnpm tauri build
```

生成的 NSIS 安装包位于：

```text
src-tauri/target/release/bundle/nsis/
```

## 项目结构

```text
OPP/
├─ src/                         # React 前端
│  ├─ app/                     # 应用壳、导航与全局模式
│  ├─ features/                # 在线资料、成绩、本地谱面与 Skin
│  └─ shared/                  # 公共组件、类型和 Tauri API
├─ src-tauri/
│  └─ src/
│     ├─ local_analysis/       # 路径检测、扫描、缓存与资源分析
│     ├─ oauth.rs              # 本地 OAuth 回调
│     └─ credentials.rs        # Windows 凭据管理器
├─ docs/                       # 产品需求与发布文档
└─ public/                     # 公共静态资源
```

## 需求与贡献

- Bug 与功能建议请通过 GitHub Issues 提交，并附上 OPP 版本、osu! 客户端类型和复现步骤。


### 计划实现功能
- ~~支持 o!rdr API，从而实现生成回放视频支持~~ v0.2.8已实现
- 成绩图片生成器
- tosu支持？
- Skin 编辑替换
- 更为专业的玩家数据分析
- Mania 工具链
- Rework Queue
- 好友功能
- ...
- 终极设想：支持插件功能

### 超级大饼

能否实现一个推图功能：

第一步：实现由图推图

第二步：实现由用户数据推图

第三步：PROJECT SAVE UNRANK 设计一套用户评价为标准的针对宝藏unrank铺面发掘计划

目前有[osu-difficulty-lab](https://github.com/osuplusplus/osu-difficulty-lab)正在尝试建立一套实验难度体系，用来建立铺面索引




### 开源依赖与致谢

OPP 使用 osu! API v2 与 OAuth 2.0，并使用 React、React Router、TanStack Query、Radix UI、Lucide、Recharts、Tailwind CSS、Tauri、rosu-map、rosu-pp、reqwest、image、walkdir 和 zip 等开源项目。谱面规则与算法实现参考 [ppy/osu](https://github.com/ppy/osu)、[rosu-pp](https://github.com/MaxOhn/rosu-pp)，桌面能力参考 [Tauri 文档](https://tauri.app/)。感谢所有上游维护者、贡献者以及参与测试和反馈的 osu! 社区用户。
