import type { OnboardingStep } from "./tourContent";

export const CURRENT_PAGE_ONBOARDING_VERSION = 2;
const TRAINER_EMPTY_STATE_ONBOARDING_VERSION = 3;

export interface PageGuide {
  id: string;
  title: string;
  version: number;
  steps: OnboardingStep[];
}

interface ModuleGuide {
  title: string;
  purpose: string;
  example: string;
  target?: string;
  targetText?: string;
  targetTextSelector?: string;
  expandSelector?: string;
  expandTarget?: boolean;
}

interface PageGuideCopy {
  id: string;
  title: string;
  summary: string;
  modules: ModuleGuide[];
}

const copies: Record<string, PageGuideCopy> = {
  "/online/beatmaps": {
    id: "online-beatmaps",
    title: "在线谱面",
    summary: "这个页面负责搜索、筛选、试听和批量下载官网谱面。引导会依次展开各筛选模块，但不会自动发起搜索或下载。",
    modules: [
      { title: "模式、分类与排序", purpose: "决定搜索哪个游戏模式、谱面状态和结果排序方式，是搜索范围的第一层控制。", example: "选择 osu! 模式、Ranked 分类和按热度排序，再继续设置其他条件。", targetText: "模式、分类与排序", expandTarget: true },
      { title: "内容筛选", purpose: "按是否包含视频、Storyboard、是否玩过以及成绩等级等内容属性缩小结果。", example: "只想找未玩过且带视频的谱面时，在这里组合相应条件。", targetText: "内容筛选", expandTarget: true },
      { title: "标题与日期", purpose: "按曲名、艺术家、Mapper、标签和创建日期查找特定内容。", example: "输入 Mapper 名称，并把日期限制在最近一年，然后点击搜索。", targetText: "标题与日期", expandTarget: true },
      { title: "数值范围", purpose: "限制星数、BPM、长度、AR、OD、CS 等数值，适合精确寻找练习目标。", example: "查找 5.0–5.8 星、180–210 BPM、长度不超过 180 秒的谱面。", targetText: "数值范围", expandTarget: true },
      { title: "结果、试听与批量下载", purpose: "搜索结果卡片用于查看谱面集和难度详情、试听音乐、加入收藏夹；勾选后可通过下载面板批量处理。", example: "先试听一张谱面，打开详情确认难度，再勾选两张谱面加入下载队列。", target: '[data-page-guide-content="true"]' },
    ],
  },
  "/collections": {
    id: "collections",
    title: "谱面收藏夹",
    summary: "这个页面统一管理 Stable 收藏夹、Lazer 只读收藏和 OPP 分享图包。",
    modules: [
      { title: "收藏夹内容", purpose: "左侧每个收藏夹模块展示谱面条目、解析状态和待写回状态，并提供导出、补全下载和删除操作。", example: "在某个收藏夹中移除一个难度，确认出现“待写回”后，再使用顶部“写回游戏”。", target: '[data-page-guide-content="true"]' },
      { title: "新建收藏夹", purpose: "创建一个新的 OPP/Stable 可写收藏夹，之后可从在线、本地或相似谱面页添加难度。", example: "输入“本周练习”，点击创建，再去本地谱面页把目标难度加入其中。", targetText: "新建收藏夹" },
      { title: "导入分享码", purpose: "解析其他用户提供的 OPPC2 分享码，预览后导入为新的收藏夹。", example: "粘贴以 OPPC2. 开头的分享码，点击解析，核对谱面数量后确认导入。", targetText: "导入分享码" },
      { title: "游戏来源", purpose: "说明 Stable/Lazer 收藏数据是否可用、是否只读，帮助判断修改能否写回。", example: "看到 Stable 可写、Lazer 只读时，只对 Stable 收藏夹执行删除或写回。", targetText: "游戏来源" },
    ],
  },
  "/online/similar": {
    id: "similar-beatmaps",
    title: "相似谱面",
    summary: "这个页面使用本地 Analyzer v3 特征索引，以谱面、最近成绩或 BP 为种子生成相似结果。",
    modules: [
      { title: "查询来源", purpose: "选择单个 Beatmap ID、最近成绩或 BP 推荐，并设置返回数量。查询内容只在本机索引中计算。", example: "输入 Beatmap ID 1234567，保留默认权重，点击查找相似谱面。", target: '[data-page-guide-content="true"]' },
      { title: "高级参数", purpose: "高级模式可切换动态或手动权重，并调整难度特征和星数范围。只有在设置中开启高级功能后才显示。", example: "想强调读图相似度时，展开高级参数并提高 Reading 权重，再重新查询。", targetText: "高级参数", targetTextSelector: "button", expandTarget: true },
      { title: "候选谱面筛选", purpose: "浮动筛选面板限制候选结果的 BPM、长度、AR、OD、CS 和星数，不会改变相似度权重。", example: "推荐结果过宽时，打开筛选并设置 180–220 BPM、5–7 星。", target: ".opp-candidate-filter-panel", expandSelector: '[aria-label="打开候选谱面筛选"]' },
      { title: "相似结果与对比", purpose: "结果区展示距离、特征对比和推荐来源，可试听、快捷下载或跳转在线谱面详情。", example: "先查看距离最小的结果，再对比雷达图，试听确认风格后下载。", target: '[data-page-guide-content="true"]' },
    ],
  },
  "/trainer": {
    id: "trainer",
    title: "谱面练习生成器",
    summary: "这个页面把从本地谱面导入的难度生成独立训练副本，不会改动原谱面。",
    modules: [
      { title: "源谱面信息", purpose: "顶部模块确认当前难度、BPM、基础参数和物件数，避免对错误的难度生成副本。", example: "确认曲名与难度名称正确，并记录原始 BPM 和 AR/OD。", target: '[data-page-guide-content="true"]' },
      { title: "速度与难度", purpose: "Rate 同步改变音频速度和谱面时间轴，AR、OD、CS、HP 可以独立覆盖。", example: "把 Rate 设置为 1.10、AR 设置为 9.5，其余参数保留原值。", targetText: "速度与难度" },
      { title: "区间训练", purpose: "按 BPM 或起止秒数只保留目标物件，用于拆分长图或练习特定速度段。", example: "设置最低 BPM 190、最高 BPM 220，并截取 60–120 秒。", targetText: "区间训练" },
      { title: "生成训练谱面", purpose: "把当前参数写成 Songs 目录中的新副本；原谱面文件保持不变。", example: "检查参数后点击“一键生成到 Songs”，再在 osu! 中刷新谱面列表。", targetText: "生成训练谱面" },
    ],
  },
  "/data": {
    id: "data-center",
    title: "数据中心",
    summary: "这个页面把当前账户和所选游戏模式的官方资料、成绩与档案放在同一条纵向工作流中。",
    modules: [
      { title: "概览与统计", purpose: "展示 PP、排名、准确率、活跃度和长期趋势，用于快速判断账号当前状态。", example: "切换到 Mania 模式，对比全局排名和近期开图活跃度。", target: "#overview" },
      { title: "BP 1–100", purpose: "列出最高价值的最佳成绩，并支持按曲名、Mapper、难度或 Mod 搜索。", example: "搜索 HDHR，查看该 Mod 组合在 BP 前 100 中的分布。", target: "#scores" },
      { title: "BP 101–200 与 Pinned", purpose: "补充中段 BP，并单独展示个人主页中手动置顶的成绩。", example: "在 Pinned 区检查展示成绩，再与 BP 排名位置对照。", target: "#pinned" },
      { title: "详细档案", purpose: "按身份、社交、徽章、成就和历史用户名等主题浏览完整资料。", example: "切换档案标签查看历史用户名和徽章，不影响当前游戏模式。", target: "#profile" },
    ],
  },
  "/local/maps": {
    id: "local-maps",
    title: "本地谱面",
    summary: "这个页面扫描、筛选并查看 Stable/Lazer 本地谱面，是相似查询和 Trainer 的主要入口。",
    modules: [
      { title: "数据源设置", purpose: "折叠区显示当前客户端目录、可用性和扫描状态，可重新选择目录或刷新索引。", example: "目录移动后展开这里，重新选择 osu! 根目录并执行扫描。", target: '[aria-label="数据源设置"]', expandTarget: true },
      { title: "谱面筛选", purpose: "按标题、艺术家、Mapper、标签、在线 ID 和难度参数筛选本地索引。", example: "输入艺术家名，再把星数限制为 5–6 星，快速找到练习候选。", target: '[data-page-guide-content="true"]' },
      { title: "谱面集与难度详情", purpose: "展开谱面集后查看每个难度的结构与参数，并可查找相似谱面、导入 Trainer 或加入收藏夹。", example: "展开一个谱面集，选择 Insane 难度并点击“导入 Trainer”。", target: '[data-page-guide-content="true"]' },
    ],
  },
  "/local/skins": {
    id: "local-skins",
    title: "本地皮肤",
    summary: "这个页面浏览 Skin 配置、图片和音效资源，并支持安全替换资源。",
    modules: [
      { title: "数据源设置", purpose: "确认当前客户端与 Skin 目录是否有效，并在目录变化后重新扫描。", example: "切换到 Stable，展开数据源设置并确认 Skins 路径可用。", target: '[aria-label="数据源设置"]', expandTarget: true },
      { title: "Skin 列表与预览", purpose: "选择一个 Skin 后预览封面、游玩元素和可播放音效。", example: "选择常用 Skin，打开光标图片并试听 hitnormal 音效。", target: '[data-page-guide-content="true"]' },
      { title: "Skin 配置段", purpose: "skin.ini 按段折叠展示；展开后可以检查键值、颜色和版本差异。", example: "展开 [General]，检查 Name、Author 和 Version；引导不会自动替换任何文件。", targetText: "[General]", targetTextSelector: "summary", expandTarget: true },
    ],
  },
  "/local/media": {
    id: "local-media",
    title: "截图与回放",
    summary: "这个页面集中浏览当前客户端的截图和回放，并提供预览、复制与定位操作。",
    modules: [
      { title: "媒体类型", purpose: "在截图和回放之间切换，列表会按当前类型和搜索条件更新。", example: "先选择“截图”，查找最近文件；再切到“回放”读取回放信息。", target: '[aria-label="媒体类型"]' },
      { title: "本地媒体列表", purpose: "显示文件名、时间和基础信息，点击条目后在右侧打开详情。", example: "搜索歌曲名，选择匹配的回放文件查看详情。", targetText: "本地媒体" },
      { title: "预览与文件操作", purpose: "截图可预览和复制；回放可读取元数据、复制路径或在资源管理器中定位。", example: "选中截图后复制到剪贴板；选中回放后点击“在资源管理器中显示”。", target: '[data-page-guide-content="true"]' },
    ],
  },
  "/local/media/render": {
    id: "replay-render",
    title: "回放渲染",
    summary: "这个页面校验本地回放并提交给 o!rdr 生成视频；引导不会执行真实提交。",
    modules: [
      { title: "素材", purpose: "搜索并选择本地回放，随后检查能否匹配到已提交的 osu!standard 谱面。", example: "输入文件名关键词，选择回放，确认出现 Beatmap ID 和“已匹配”提示。", targetText: "素材" },
      { title: "输出与音频", purpose: "设置视频分辨率以及总音量、音乐和打击音比例。", example: "选择 1920x1080，把音乐调到 80%、打击音调到 65%。", targetText: "输出与音频" },
      { title: "高级选项", purpose: "折叠区控制计分板、PP、光标、背景、Storyboard 和播放行为。引导会临时展开，离开步骤后恢复。", example: "展开后关闭计分板、保留 PP，并把游戏背景暗度设为 80%。", targetText: "高级选项", targetTextSelector: "button", expandTarget: true },
      { title: "提交身份与皮肤", purpose: "填写视频署名、选择官方或自定义皮肤，并可临时提供验证 Key。", example: "署名填写玩家名，选择官方皮肤；先使用开发者模拟成功模式验证流程。", targetText: "提交身份与皮肤" },
      { title: "任务进度与导出", purpose: "提交后显示任务状态和视频链接，完成时可打开、复制或导出到本地。", example: "等待状态变为 completed，再点击“导出到本地”选择保存位置。", targetText: "等待提交" },
    ],
  },
  "/tosu": {
    id: "tosu",
    title: "tosu 直播集成",
    summary: "这个页面管理 tosu 服务、自动启动、OBS WebSocket 和实时歌词浏览器源。",
    modules: [
      { title: "tosu 服务", purpose: "选择 tosu.exe、启动或停止由 OPP 管理的服务，并显示 API 是否可达。", example: "先选择 tosu.exe，点击启动，等待顶部状态变为“API 已连接”。", targetText: "tosu 服务" },
      { title: "直播自动化", purpose: "控制检测到 osu! 或 OBS 时是否自动启动 tosu，以及是否显示确认提示。", example: "开启“检测到 OBS 后启动 tosu”，保留启动确认提示。", targetText: "直播自动化" },
      { title: "OBS WebSocket", purpose: "保存 OBS 地址和密码、读取场景，并刷新所选场景中的浏览器源。", example: "填写 ws://127.0.0.1:4455，保存并测试，读取场景后选择直播场景。", targetText: "OBS WebSocket" },
      { title: "OBS 实时歌词", purpose: "管理歌词代理并提供可添加到 OBS 的本地浏览器源地址。", example: "选择 tosu-proxy.exe，启动后复制歌词地址到 OBS 浏览器源。", targetText: "OBS 实时歌词" },
    ],
  },
  "/tools": {
    id: "tools",
    title: "工具集合",
    summary: "这个页面包含彼此独立的 osu! 辅助工具；引导只说明用法，不会自动修改系统设置。",
    modules: [
      { title: "手速测试", purpose: "在指定时长内统计有效按键次数、KPS，并换算近似 BPM。", example: "选择 10 秒，点击开始后交替按两个键，结束时查看 KPS 与 BPM。", targetText: "手速测试" },
      { title: "文件默认打开端", purpose: "设置 Windows 双击 .osz 和 .osk 时交给 Stable 还是 Lazer。", example: "把 .osz 设置为 Lazer、.osk 设置为 Stable，然后分别保存。", targetText: "文件默认打开端" },
      { title: "显示器伽马", purpose: "实时调整主显示器中间调，1.00 为系统默认值，可一键复原。", example: "小幅拖到 1.10 检查画面，测试后点击“复原”回到 1.00。", targetText: "显示器伽马" },
      { title: "Malody 谱面转换", purpose: "把一个或多个 .mcz 转换为同目录下的 .osz，同名输出会安全跳过。", example: "选择两个 .mcz 文件，转换后查看每项完成、跳过或失败状态。", targetText: "Malody 谱面转换" },
    ],
  },
  "/settings": {
    id: "settings",
    title: "设置",
    summary: "这个页面管理账户、外观、默认模式、本地目录、下载和缓存等全局偏好。",
    modules: [
      { title: "账户", purpose: "查看当前连接账户，重新完成 OAuth 认证，或退出并清理登录状态。", example: "授权失效时点击“重新认证”，在浏览器完成授权后返回 OPP。", targetText: "账户" },
      { title: "主题", purpose: "切换浅色/深色外观和主题色，修改会立即应用到整个软件。", example: "开启浅色主题并选择绿色，确认侧栏和按钮颜色同步变化。", targetText: "主题" },
      { title: "默认游戏模式", purpose: "设置应用启动和在线数据默认使用的 osu!、Taiko、Catch 或 Mania。", example: "主要玩 Mania 时选择 Mania，之后数据中心会优先加载该模式。", targetText: "默认游戏模式" },
      { title: "试听", purpose: "控制在线谱面和相似谱面的音频预览音量。", example: "先调到 40%，返回在线谱面试听，再按需要微调。", targetText: "试听" },
      { title: "游戏目录", purpose: "分别管理 Stable 和 Lazer 目录，是本地谱面、Skin、媒体与工具功能的数据基础。", example: "点击自动检测；若失败，手动选择包含 Songs 或对应数据文件的目录。", targetText: "游戏目录" },
      { title: "工具与缓存", purpose: "开启相似谱面高级设置、清理资料缓存并限制本地缩略图占用。", example: "开启高级设置，把缩略图缓存上限设为 512 MB。", targetText: "工具与缓存" },
      { title: "谱面下载", purpose: "选择默认镜像、保存位置，以及下载完成后是否自动交给 osu! 导入。", example: "选择 Hinai、多源回退，设置 Downloads 文件夹，并开启下载后自动打开。", targetText: "谱面下载" },
      { title: "关于与引导", purpose: "查看版本和项目仓库，并可重新启动软件总体引导。页面标题旁问号只重播设置页引导。", example: "点击“重新查看新手引导”复习总体功能；关闭后仍可用问号回到本页说明。", targetText: "关于" },
    ],
  },
};

function stepsFor(copy: PageGuideCopy): OnboardingStep[] {
  return [
    {
      title: `认识“${copy.title}”`,
      description: copy.summary,
      target: '[data-page-guide-title="true"]',
    },
    ...copy.modules.map((module) => ({
      title: module.title,
      description: module.purpose,
      example: module.example,
      target: module.target,
      targetText: module.targetText,
      targetTextSelector: module.targetTextSelector,
      expandSelector: module.expandSelector,
      expandTarget: module.expandTarget,
    })),
    {
      title: "本页引导完成",
      description: `你已经了解“${copy.title}”的主要模块。以后可以点击页面标题旁的问号，随时重新查看本页引导。`,
    },
  ];
}

export function getPageGuide(pathname: string): PageGuide | null {
  if (pathname === "/trainer" && document.querySelector('[data-page-guide-content="true"] .min-h-64')) {
    return {
      id: "trainer",
      title: "谱面练习生成器",
      version: TRAINER_EMPTY_STATE_ONBOARDING_VERSION,
      steps: [
        {
          title: "先导入一张本地谱面",
          description: "生成器需要一张本地难度作为源文件。当前还没有导入内容，因此这里会显示开始入口。",
          example: "点击“前往本地谱面”，展开一张谱面的难度列表，再选择“导入 Trainer”。",
          target: '[data-page-guide-content="true"] .min-h-64',
        },
        {
          title: "导入后可以做什么",
          description: "导入后可调整速度、AR、OD、CS、HP、BPM 和时间区间，并生成一个不会修改原谱面的训练副本。",
          target: '[data-page-guide-title="true"]',
        },
      ],
    };
  }
  const copy = copies[pathname];
  return copy
    ? { id: copy.id, title: copy.title, version: CURRENT_PAGE_ONBOARDING_VERSION, steps: stepsFor(copy) }
    : null;
}

export function needsPageOnboarding(storedVersion: number | undefined, guide: PageGuide) {
  return (storedVersion ?? 0) < guide.version;
}
