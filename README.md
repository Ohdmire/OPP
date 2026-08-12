<div align="center">
  <img src="./public/opp-icon.png" width="112" height="112" alt="OPP logo" />

  # OPP

  **一站式 osu! 工具集合**

  [![Version](https://img.shields.io/badge/version-0.4.0-ff6aa7?style=for-the-badge)](./src-tauri/tauri.conf.json)
  [![Platform](https://img.shields.io/badge/platform-Windows-5ce1e6?style=for-the-badge&logo=windows11&logoColor=white)](#运行要求)
  [![Tauri](https://img.shields.io/badge/Tauri-2-a673ff?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
  [![Vibe Coding](https://img.shields.io/badge/Vibe_Coding-AI_Collaborative-8b5cf6?style=for-the-badge)](#vibe-coding)

  [功能](#功能概览) · [开始使用](#开始使用) · [开发](#本地开发) · [快速入门](./docs/快速入门.md) · [架构](./docs/架构与开发.md)
</div>

---

OPP 是一个使用 Tauri、Rust 与 React 构建的 Windows 桌面应用。它集成了你游玩osu！时可能需要的工具。

用户操作见 [快速入门](./docs/快速入门.md)，代码模块、数据流与开发约定见 [架构与开发](./docs/架构与开发.md)。

> [!IMPORTANT]
> OPP 是独立的社区项目，与 ppy Pty Ltd 或 osu! 官方无隶属关系。osu! 是 ppy Pty Ltd 的商标。

**创了一个交流吹水群： 1059437719 有任何问题或者功能上的建议欢迎来群中吹水**



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

### 配置相似谱面

1. 从 [`osu-difficulty-lab` Releases](https://github.com/osuplusplus/osu-difficulty-lab/releases) 下载与 Analyzer v3 兼容的数据集。
2. 将数据集完整解压到本地目录。
3. 在 OPP 的“相似谱面”页面选择数据集根目录。该目录应直接包含 `metadata.sqlite`、`features-v*.bin`、`indexes/` 和 `normalizers/`。

如果解压后出现两层同名目录，请选择内层、实际包含上述文件的目录。旧版 Analyzer v2 数据集无法直接迁移，需要重新下载或生成 v3 数据集。更多说明见 [相似谱面数据集](./docs/similarity-dataset.md)。

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
│  ├─ crates/                  # 可独立复用的 Rust 运行时
│  └─ src/
│     ├─ account/              # OAuth、凭据和账号缓存
│     ├─ local_analysis/       # 路径检测、扫描、缓存与资源分析
│     ├─ online_beatmaps/      # 在线谱面查询与下载
│     └─ similarity/           # 相似度数据集、查询和推荐
├─ docs/                       # 用户指南、数据集、架构与变更记录
└─ public/                     # 公共静态资源
```

## 贡献与已知限制

欢迎通过 [Issues](https://github.com/osuplusplus/OPP/issues) 提交问题、功能建议和可复现步骤。提交代码前请先阅读 [架构与开发](./docs/架构与开发.md)，并确保前后端质量检查全部通过。

- 本地 pp 计算基于固定的 `rosu-pp` 算法快照，可能与 osu! 在线服务当前版本存在差异。
- 相似谱面结果取决于本地 Analyzer v3 数据集的覆盖范围与截止时间，不代表实时数据库。
- o!rdr、谱面镜像、网易云音乐、tosu 与 OBS 等外部服务或应用的可用性不由 OPP 保证。

### 关联仓库

- [OPP](https://github.com/osuplusplus/OPP)
- [ppy/osu](https://github.com/ppy/osu)
- [tosuapp/tosu](https://github.com/tosuapp/tosu)
- [HollisMeynell/tosu-lyrics](https://github.com/HollisMeynell/tosu-lyrics)
- [Siflorite/mania-converter-rust](https://github.com/Siflorite/mania-converter-rust) (Apache-2.0)
- [MaxOhn/rosu-pp](https://github.com/MaxOhn/rosu-pp)
- [MaxOhn/rosu-map](https://github.com/MaxOhn/rosu-map)
- [Tauri](https://github.com/tauri-apps/tauri)

## 特别鸣谢

[**Rinne_0** ](https://osu.ppy.sh/users/11511458)和 [**Ribet**](https://osu.ppy.sh/users/19140906) 作为OPP的早期用户，深度参与了软件的测试，提出许多建设性意见，没有你们我可能在中间就放弃了。

感谢所有上游维护者、贡献者以及参与测试和反馈的 osu! 社区用户。
