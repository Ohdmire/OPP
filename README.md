<div align="center">
  <img src="./public/opp-icon.png" width="112" height="112" alt="OPP logo" />

  # OPP

  **一站式 osu! 工具集合**

  [![Version](https://img.shields.io/badge/version-0.3.5-ff6aa7?style=for-the-badge)](./src-tauri/tauri.conf.json)
  [![Platform](https://img.shields.io/badge/platform-Windows-5ce1e6?style=for-the-badge&logo=windows11&logoColor=white)](#运行要求)
  [![Tauri](https://img.shields.io/badge/Tauri-2-a673ff?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
  [![Vibe Coding](https://img.shields.io/badge/Vibe_Coding-AI_Collaborative-8b5cf6?style=for-the-badge)](#vibe-coding)

  [功能](#功能概览) · [开始使用](#开始使用) · [开发](#本地开发) · [快速入门](./docs/快速入门.md)
</div>

---

OPP 是一个使用 Tauri、Rust 与 React 构建的 Windows 桌面应用。它集成了你游玩osu！时可能需要的工具。

开发、模块边界与 AI 协作约定见 [项目快速入门](./docs/快速入门.md)。

> [!IMPORTANT]
> OPP 是独立的社区项目，与 ppy Pty Ltd 或 osu! 官方无隶属关系。osu! 是 ppy Pty Ltd 的商标。

## 相似谱面

1. 从 [`osu-difficulty-lab` Releases](https://github.com/osuplusplus/osu-difficulty-lab/releases) 下载与 Analyzer v3 兼容的数据集。
2. 将数据集完整解压到本地目录。
3. 在 OPP 的“相似谱面”页面选择数据集根目录。该目录应直接包含 `metadata.sqlite`、`features-v*.bin`、`indexes/` 和 `normalizers/`。

如果解压后出现两层同名目录，请选择内层、实际包含上述文件的目录。旧版 Analyzer v2 数据集无法直接迁移，需要重新下载或生成 v3 数据集。更多说明见 [相似谱面数据集](./docs/similarity-dataset.md)。

## 功能概览

- 通过官方 osu! API v2 OAuth 登录，查看玩家资料与成绩数据
- 提供谱面镜像批量下载、筛选队列与多镜像自动回退
- 根据本地索引查找相似谱面，并可基于最近成绩或 BP 生成推荐
- 内置 pp calculator，支持不同模式与 Mod
- 支持本地谱面、Skin、截图和回放的预览与管理
- 支持启动 Stable 与 Lazer，并记录一次游戏会话的数据变化
- 支持 tosu、tosu-lyrics 与 OBS 直播工作流
- 支持 Trainer 练习谱面生成和网易云音乐客户端搜索
- 内置各种实用小工具

当前算法口径为 [`rosu-pp 4.0.1`](https://github.com/MaxOhn/rosu-pp/tree/v4.0.1)，对应
[`ppy/osu@28c846b`](https://github.com/ppy/osu/commit/28c846b4d9366484792e27f4729cd1afa2cdeb66)
（2025-10-13）算法快照。PP 表示谱面原生模式下 `NoMod`、满分、最大连击、零 miss
的理论值，不代表某一次实际成绩。

## 开始使用

### 运行要求

- Windows 10 或 Windows 11
- Microsoft Edge WebView2 Runtime
- osu! 个人 OAuth 应用

从仓库的 [Releases](https://github.com/osuplusplus/OPP/releases/latest) 页面下载最新的 Windows x64 EXE。Release 中的 `OPP-vX.Y.Z-windows-x64.exe` 无需安装，可直接运行；首次启动仍需要系统已安装 WebView2 Runtime。

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

任何对OPP有新功能的想法，建议，或者是bug，欢迎在issue处指出！

### **现在碰到的几个比较严重的问题**

crate `rosu`使用的pp计算算法是2025年10月快照，这导致我们本地计算的结果和在线结果存在差异，并且基于rosu的铺面推荐算法，以及本体铺面中的难度分布图，都存在问题。

除此之外,由于我不懂TS，前端UI的设计全交给AI，使得现目前前端就是一个黑盒。




### 计划实现功能
- ~~支持 o!rdr API，从而实现生成回放视频支持~~ v0.2.8已实现
- ~~tosu支持？~~ v0.3.0 已实现
- ~~优化搜索功能~~
- 前端UI重新设计（急需懂前端的朋友帮助QAQ）
- 设计直播工作流
- 成绩图片生成器
- Skin 编辑替换
- 更为专业的玩家数据分析
- Mania 工具链
- Rework Queue
- 好友功能
- ...

### 超级大饼

能否实现一个推图功能：

第一步：实现由图推图 

第二步：实现由用户数据推图

第三步：PROJECT SAVE UNRANK 设计一套用户评价为标准的针对宝藏unrank铺面发掘计划

目前有[osu-difficulty-lab](https://github.com/osuplusplus/osu-difficulty-lab)正在尝试建立一套实验难度体系，用来建立铺面索引

### 关联仓库

- [OPP](https://github.com/osuplusplus/OPP)
- [ppy/osu](https://github.com/ppy/osu)
- [tosuapp/tosu](https://github.com/tosuapp/tosu)
- [HollisMeynell/tosu-lyrics](https://github.com/HollisMeynell/tosu-lyrics)
- [Siflorite/mania-converter-rust](https://github.com/Siflorite/mania-converter-rust) (Apache-2.0)
- [MaxOhn/rosu-pp](https://github.com/MaxOhn/rosu-pp)
- [MaxOhn/rosu-map](https://github.com/MaxOhn/rosu-map)
- [Tauri](https://github.com/tauri-apps/tauri)

感谢所有上游维护者、贡献者以及参与测试和反馈的 osu! 社区用户。
