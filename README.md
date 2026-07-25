<div align="center">
  <img src="./public/opp-icon.png" width="112" height="112" alt="OPP logo" />

  # OPP

  **面向 osu! 玩家的个人档案与本地资源分析桌面工具**

  [![Version](https://img.shields.io/badge/version-0.2.4-ff6aa7?style=for-the-badge)](./src-tauri/tauri.conf.json)
  [![Platform](https://img.shields.io/badge/platform-Windows-5ce1e6?style=for-the-badge&logo=windows11&logoColor=white)](#运行要求)
  [![Tauri](https://img.shields.io/badge/Tauri-2-a673ff?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
  [![Vibe Coding](https://img.shields.io/badge/Vibe_Coding-AI_Collaborative-8b5cf6?style=for-the-badge)](#vibe-coding)

  [功能](#功能概览) · [开始使用](#开始使用) · [开发](#本地开发) · [需求路线](./docs/需求分析.md) · [发布检查](./docs/发布检查清单.md)
</div>

---

OPP 是一个使用 Tauri、Rust 与 React 构建的 Windows 桌面应用。它将 osu! API v2 个人资料与本机 osu!stable / osu!lazer 资源放在同一个分析空间中，同时保持本地文件只读。

> [!IMPORTANT]
> OPP 是独立的社区项目，与 ppy Pty Ltd 或 osu! 官方无隶属关系。osu! 是 ppy Pty Ltd 的商标。

## 功能概览

### 在线资料

- 通过官方 osu! API v2 OAuth 登录。
- 浏览四模式个人统计、地区与全球排名。
- 查看 Top 100 最佳成绩以及完整成绩字段。
- 将 Client Secret、Access Token 和 Refresh Token 保存到 Windows 凭据管理器。

### 本地谱面

- 自动检测 osu!stable 与 osu!lazer，也可以手动选择目录。
- 按 BeatmapSet 聚合同一集合的不同难度。
- 分析 CS、AR、OD、HP、BPM、时长、物件、NPS、NoMod 星数、最大连击与理论满分 PP。
- 按需计算各模式原生 strain 时间序列。
- 支持标题、艺术家、Mapper、标签、ID、星数、BPM、时长和结构参数筛选。
- Stable 谱面集使用经过后端校验和缩放的本地背景图。
- 在数据源与谱面详情中标注计算引擎版本、发布日期、`ppy/osu` 上游提交日期、规则集版本与实际计算时间。

当前算法口径为 [`rosu-pp 4.0.1`](https://github.com/MaxOhn/rosu-pp/tree/v4.0.1)，对应
[`ppy/osu@28c846b`](https://github.com/ppy/osu/commit/28c846b4d9366484792e27f4729cd1afa2cdeb66)
（2025-10-13）算法快照。PP 表示谱面原生模式下 `NoMod`、满分、最大连击、零 miss
的理论值，不代表某一次实际成绩。

### 本地皮肤

- 解析 legacy `skin.ini`，保留 Section、键顺序、重复键和颜色。
- 统计 Stable Skin 的递归资源数量、体积与扩展名分布。
- 分页预览 PNG、JPG、WebP、GIF、BMP 图片。
- 试听 WAV、MP3、OGG 音效。
- 使用不透明资源 ID 和独立媒体接口，为后续视觉编辑与资源替换做准备。

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

- 当前需求池与优先级见 [需求分析](./docs/需求分析.md)。
- 发布前检查事项见 [发布检查清单](./docs/发布检查清单.md)。
- Bug 与功能建议请通过 GitHub Issues 提交，并附上 OPP 版本、osu! 客户端类型和复现步骤。
- 涉及本地资源写入、Realm 读取、第三方下载源或版权内容的功能，需要先明确安全与合规边界。

## Vibe Coding

OPP 采用 **Vibe Coding / AI 协作开发** 方式推进：由人定义产品方向、边界与验收标准，AI 协助分析、实现、重构和测试。
