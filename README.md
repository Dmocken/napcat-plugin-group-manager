# 群管助手 · napcat-plugin-group-manager

NapCat（OneBot 11）群管理插件：禁言 / 踢人 / 随机禁言 / 黑历史 / 新人禁言 / 静默成员检查 / 加群审核 / 撤回统计。

自带一套 WebUI 配置页面，支持「一条配置绑定多个群」——按群独立设置功能开关、使用权限与提示文案。

- 🖥️ **WebUI 可视化配置**：概览 / 全局设置 / 群配置三个页面
- 🧩 **分群配置**：一条「群配置」可绑定多个群，群与群之间互不影响
- 🛡️ **三级权限**：Bot 管理员 → 群主 / 管理员 → 成员名单
- 📝 **文案可改**：每个功能的提示语都能在页面上按群编辑，留空用内置默认值
- 🔁 **重复加群检测**：离线成员快照 + 实时补充，支持给 bot 不在的群导入名单

## 功能一览

| 功能 | 命令 | 说明 |
| --- | --- | --- |
| 手动禁言 / 踢人 / 解禁 / 撤回 | `/ban @用户 时长 单位`、`/kick @用户`、`/unban @用户`、`/撤回消息`（引用一条消息） | 时长单位：秒 / 分 / 时 / 天 |
| 随机禁言 | `sm`、`smplus`（裸命令，无需前缀） | 有权限时随机禁言被 @ 的人；无权限时禁言自己 |
| 黑历史 | `/入典`（引用一条纯文字消息）、`/查看黑历史 [编号 / @某人]`、`/删除黑历史 编号` | 群内记录与查询 |
| 新人禁言 | `/newban open`、`/newban close` | 新人入群自动禁言并通知；退群重进会重新禁言 |
| 静默成员检查 | `/check`、`/check kick [原因]`、`/check user QQ号`、`/check debug` | 入群超 N 天且从未发言的成员 |
| 加群审核 | `/join open`、`/join close` | 自动审批加群申请，见下文 |
| 撤回消息统计 | `/recall open`、`/recall close`；私聊 `/recall 群号 QQ号` | 被撤回次数达到阈值时提醒 |
| 系统 | `/ping`（Bot 管理员）、`/help` | |

> 命令前缀默认 `/`（可在插件配置里改）；`sm` / `smplus` 是裸命令，不受前缀影响。

## 环境要求

- **NapCat ≥ 4.14.0**
- 只运行插件：不需要 Node，用构建好的 `dist/` 即可
- 从源码构建：Node 18+（建议 20 / 22）

## 安装

### 方式一：用构建好的产物（推荐）

把 `dist/` 目录下的**全部文件**复制到 NapCat 的 `plugins/` 目录（目录名随意，例如 `napcat-plugin-group-manager`），然后重启 NapCat。

`dist/` 是自包含的，只有三样东西：

| 文件 | 作用 |
| --- | --- |
| `index.mjs` | 插件后端 |
| `webui/index.html` | 配置页面（JS / CSS 已内联成单文件） |
| `package.json` | NapCat 靠它识别插件 |

### 方式二：从源码构建

```bash
npm install --include=dev     # 构建依赖都在 devDependencies，别加 --production
npm run build                 # 组装出完整的 dist/
```

部署到 NapCat（二选一）：

```bash
# 指定插件目录后一键部署（会覆盖同名目录）
NAPCAT_PLUGIN_DIR=/path/to/napcat/plugins npm run deploy

# 或者手动复制
cp -r dist/* /path/to/napcat/plugins/napcat-plugin-group-manager/
```

### 方式三：服务器一键部署（deploy.sh）

仓库根目录的 `deploy.sh` 把「拉代码 → 装依赖 → 编译 → 部署 → 白名单检测」串成一条命令，适合在服务器上反复部署：

```bash
bash deploy.sh                              # 拉代码 -> 编译 -> 部署 -> 检测白名单
bash deploy.sh --no-pull                    # 不拉代码，用本地代码部署
bash deploy.sh --no-patch                   # 只部署，不改 napcat.mjs
bash deploy.sh --napcat-dir /root/Napcat/opt/QQ/resources/app/app_launcher/napcat
bash deploy.sh --plugins-dir /root/Napcat/opt/QQ/resources/app/app_launcher/napcat/plugins
```

它依次做这些事：

1. `git pull`（`--no-pull` 跳过）
2. **只在构建依赖缺失时**执行 `npm install --include=dev`，避免用 `--production` 装出缺 `@tailwindcss/vite` 的 `node_modules`
3. `npm run build`，并**校验 `dist/` 是否完整**：缺 `index.mjs` / `webui/index.html` / `package.json` 就直接报错退出，绝不往 NapCat 里铺半成品
4. 先清空目标插件目录，再把 `dist/` 铺进去，避免上次部署的旧文件残留
5. 检测 NapCat 的「官方插件白名单」（第三方插件注册限制）：不需要则跳过；需要但未放行则自动加白（改 `napcat.mjs`，先备份为 `napcat.mjs.bak`；`--no-patch` 可关闭）
6. 打印重启 / 重载与 Ctrl+F5 强刷的提示

可用环境变量（优先级低于命令行参数）：`SRC_DIR`（源码目录，脚本放在仓库里时默认就是它所在目录）、`NAPCAT_DIR`、`PLUGIN_DIR`、`RESTART_CMD`（部署后自动执行的重启命令，如 `"bash ~/napcat.sh"`）、`DO_PULL=0`、`DO_PATCH=0`。

> NapCat 升级会覆盖 `napcat.mjs`，升级后重跑一次本脚本即可重新加白；误改了可以还原：`cp napcat.mjs.bak napcat.mjs`。

### npm 脚本

| 脚本 | 作用 |
| --- | --- |
| `npm run build` | 前置检查 → 构建后端 → 构建 WebUI → 组装 `dist/` |
| `npm run deploy` | 同 `build`，并额外复制到 `NAPCAT_PLUGIN_DIR` |
| `npm run build:plugin` / `build:webui` | 只构建其中一半（产物在 `.build/plugin`、`src/webui/dist`） |
| `npm run pack` | 只重新组装 `dist/`（要求两份产物都已构建过） |
| `npm run typecheck` | TypeScript 类型检查（后端 + WebUI） |
| `npm run dev:webui` | 启动 WebUI 开发服务器 |

构建脚本的几个约定（专门为了避免「改了代码，部署后却没变化」）：

- 后端产物先落到 `.build/plugin/`，**只有 `pack` 会写 `dist/`**，而且每次都从零重新组装，不会新旧文件混杂
- 缺少任何一份产物都会直接报错退出，不会产出半成品，也不会破坏已有的 `dist/`
- `npm run build` 第一步会检查 Node 版本与构建依赖，缺了会直接告诉你怎么装

## 配置

### 插件配置面板（NapCat 里）

只放全局的扁平项：插件总开关、调试日志、命令前缀、**插件页面访问密码**。

密码留空表示不校验 —— 任何人都能打开页面（包括读到 AI 的 API Key），建议设置。

### 插件页面

NapCat WebUI → 插件详情 → 「群管助手」，路径：

```
/plugin/napcat-plugin-group-manager/page/dashboard
```

入口没显示时，浏览器直接打开 `/plugin/napcat-plugin-group-manager/api/ui` 是同一个页面。

页面分三块：

- **概览**：运行状态与统计、各群功能矩阵、数据目录（可复制路径）、最近错误
- **全局设置**：运行参数、Bot 管理员、通用提示文案、成员快照
- **群配置**：新增「群配置」条目，一条可绑定多个群；条目下分三个页签
  - **绑定群**：一个群只能出现在一条配置里，把功能相同的群放进同一条
  - **功能**：拖动排序、逐个开关功能；展开后可设置「允许群主 / 管理员使用」「成员名单」以及各功能参数
  - **提示文案**：按功能集中修改提示语，留空即使用内置默认值

权限优先级：**Bot 管理员**（全局最高）> **群主 / 管理员**（该功能打开时）> **成员名单**（名单内成员始终可用）。

文案里可用的占位符：`{user}` `{time}` `{seconds}` `{clock}` `{id}` `{content}` `{group}` `{count}` `{error}`，
以及 `{image=/assets/xxx.png}` 用来插入图片（图片放在数据目录 `assets/` 或插件目录 `assets/`）。

## 加群审核

收到加群申请（主动加群；邀请入群不处理）时的审批顺序：

1. **群人数上限**：达到上限直接拒绝（参数 `群人数上限`，0 表示不检查）
2. **重复加群检测**：申请人已在「参与查重的群」里 → 拒绝，理由用该配置的「重复加群拒绝理由」
3. **答案判定**，三种方式可选：
   - **关键词审核**：只用词表判断，不调用 AI
   - **AI 审核**：只由模型判断；调用失败时私聊管理员，本次申请保持待处理
   - **AI 失败降级**：优先用模型，失败时自动改用词表继续审批，并私聊管理员告知
4. **QQ 等级**：等级 ≥ 阈值立即通过；否则延迟指定秒数后自动通过（取不到等级时直接放行，避免申请一直卡着）

参数默认值：QQ 等级阈值 `10`、低等级延迟通过 `1800` 秒、群人数上限 `2000`。
AI 走 OpenAI 兼容接口（默认 DeepSeek），页面上有「测试 API Key」。

### 重复加群检测

OneBot 没有「查某个 QQ 加了哪些群」的接口，所以采用**离线快照 + 实时补充**：

- 在「群配置 → 功能 → 加群审核 → 重复加群检测」打开开关，并勾选**参与查重的群**
- 范围按这条群配置**独立生效**，不同群配置之间互不影响（不会出现不同类型群互相误拦）
- 检测时先查快照，快照里没有记录的群再调接口实时拉取成员（缓存 10 分钟）
- 命中后按该配置「提示文案」里的**重复加群拒绝理由**拒绝

## 成员快照

「全局设置 → 成员快照」维护一份离线成员名单，落盘为 `dup_snapshot.json`。

| 操作 | 说明 |
| --- | --- |
| 导出选中群成员 | 多选 bot 已加入的群，拉取成员名单写入快照，同时记下群名 |
| 下载 | 把快照文件存到本地（留档 / 换机迁移） |
| 导入 | **合并**导入：同名群覆盖，其它群保留；用于给 bot 不在的群补名单 |
| 清理 | 删除快照文件，彻底重来 |

文件格式（导入时兼容两种；旧格式没有群名，界面会退化成显示群号）：

```json
{
  "updatedAt": 1700000000000,
  "groups": { "123456789": ["10001", "10002"] },
  "names": { "123456789": "示例群" }
}
```

**让 bot 不在的群参与查重**：把该群的成员名单整理成上面的格式 → 「成员快照」里导入 → 到「群配置 → 加群审核 → 参与查重的群」勾上它（列表里会带「快照」标签并显示群名）。

## 数据与备份

所有数据都在 NapCat 给插件的**数据目录**下（页面「概览」里能看到完整路径、可一键复制）：

| 文件 | 内容 |
| --- | --- |
| `config.json` | 全局配置 + 全部群配置条目 |
| `dup_snapshot.json` | 成员快照（旧的 `group_members.json` 会被兼容读取） |
| `errors.log` | 最近错误记录（按行 JSON，超过 256KB 自动裁剪） |
| `assets/` | 自定义图片（`{image=...}` 会从 `dataPath/assets`、插件目录 `assets` 里找） |

备份整个数据目录即可；换机时把目录放回去。

## 目录结构

```
src/
├── index.ts            # 插件入口：生命周期、注册页面与接口
├── config.ts           # NapCat 插件配置面板 Schema（只放全局项）
├── constants.ts        # 功能元信息 / 默认参数 / 默认文案（前后端共用）
├── types.ts
├── core/               # 基础设施：状态与配置读写、命令路由、事件分发、权限、
│                       # 文案模板、定时器、消息与 OneBot Action 封装
├── handlers/           # 各功能的命令与事件处理
│                       # ban / black / check-silent / join-verify / newban /
│                       # ping / random-ban / recall-stats
├── services/           # 业务服务：加群审核的 AI 判定与词表判定、重复加群检测、
│                       # HTTP API 路由
└── webui/              # 配置页面（React + Vite，构建成单文件 HTML）
    ├── components/     # 通用组件、UI 基础组件、群配置相关组件
    ├── pages/          # 概览 / 全局设置 / 群配置
    ├── lib/            # API 封装、类型、工具
    └── store.ts        # 前端状态（zustand）
scripts/
├── preflight.mjs       # 构建前置检查（Node 版本、构建依赖）
└── pack.mjs            # 组装 dist/，可选部署

deploy.sh               # 服务器一键部署（拉代码 / 装依赖 / 编译 / 部署 / 白名单检测）
```

## 常见问题

**改了代码，部署后页面 / 参数还是旧的？**

按顺序检查：

1. `npm run build` 是否**真的成功**（看到 `[pack] 构建产物已生成` 才算；失败时 `dist/` 可能不完整）
2. `dist/` 是否**整目录**覆盖到了 NapCat 的 `plugins/`
3. 是否**重启 / 重载**了 NapCat 插件（插件初始化时才读 `index.mjs` 和页面文件）
4. 页面按 **Ctrl+F5** 强刷（单文件 HTML 没有 hash，浏览器缓存很顽固）

必要时用浏览器 F12 → Network 看 `.../api/meta` 的返回，判断是后端旧还是前端旧。

**构建报 `Cannot find package '@tailwindcss/vite'`？**

构建依赖都在 `devDependencies`。用 `npm install --include=dev`（或 `pnpm install`）重装，别加 `--production` / `--omit=dev`。`npm run build` 的第一步会提前检查并给出提示。

**加群审核没反应？**

打开「调试日志」看 NapCat 日志：插件会打印加群请求的原始字段、判定结果与审批调用。

**取不到 QQ 等级？**

不同 NapCat 版本 `get_stranger_info` 返回的等级字段不一致；取不到时插件会跳过等级判断直接放行，避免申请一直卡在待处理。

## 许可

MIT
