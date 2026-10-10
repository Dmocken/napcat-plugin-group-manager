#!/usr/bin/env bash
#
# deploy.sh —— 群管助手（napcat-plugin-group-manager）服务器一键部署
#
#   1. git pull：默认执行（--no-pull 跳过）
#   2. 装依赖：构建依赖（devDependencies）缺失时自动补装，用 --include=dev
#   3. 编译：npm run build，并校验 dist/ 是否完整（缺文件直接报错，不铺半成品）
#   4. 部署：先清空目标插件目录，再把 dist/ 铺进去（不套多余的 dist 目录）
#   5. 检测：NapCat 是否允许第三方插件注册（官方插件白名单）
#      - 没这个限制 → 提示无需处理
#      - 有这个限制但本插件不在白名单 → 自动加白（改 napcat.mjs，先备份为 napcat.mjs.bak）
#      - 已在白名单 → 原样跳过
#   6. 打印后续操作：WebUI 重载 / 重启命令
#
# 用法（在服务器上执行）：
#   bash deploy.sh                              # 拉代码 -> 编译 -> 部署 -> 检测白名单
#   bash deploy.sh --no-pull                    # 不拉代码，用本地代码编译部署
#   bash deploy.sh --no-patch                   # 只部署，不改 napcat.mjs
#   bash deploy.sh --napcat-dir /root/Napcat/opt/QQ/resources/app/app_launcher/napcat
#   bash deploy.sh --plugins-dir /root/Napcat/opt/QQ/resources/app/app_launcher/napcat/plugins
#   bash deploy.sh --src-dir /root/napcat-plugin-group-manager
#
# 可用环境变量（优先级低于命令行参数）：
#   SRC_DIR             源码目录；脚本放在仓库里时默认就是脚本所在目录
#   NAPCAT_DIR          NapCat 根目录（含 napcat.mjs），留空则自动探测
#   PLUGIN_DIR          NapCat 的 plugins 目录，留空则取 $NAPCAT_DIR/plugins
#   RESTART_CMD         部署完成后自动执行的重启命令，如 "bash ~/napcat.sh"
#   DO_PULL=0           等价于 --no-pull（默认 1，即默认拉取）
#   DO_PATCH=0          等价于 --no-patch
#
# 说明：NapCat 升级会覆盖 napcat.mjs，升级后重跑本脚本即可重新加白。
#       误改了 napcat.mjs 可用备份还原：cp napcat.mjs.bak napcat.mjs
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 脚本通常就放在仓库根目录；只有放在仓库外面时才用 <脚本目录>/napcat-plugin-group-manager
if [[ -n "${SRC_DIR:-}" ]]; then
    :
elif [[ -f "$SCRIPT_DIR/package.json" ]]; then
    SRC_DIR="$SCRIPT_DIR"
else
    SRC_DIR="$SCRIPT_DIR/napcat-plugin-group-manager"
fi

NAPCAT_DIR="${NAPCAT_DIR:-}"
PLUGIN_DIR="${PLUGIN_DIR:-}"
DO_PULL="${DO_PULL:-1}"
DO_PATCH="${DO_PATCH:-1}"
RESTART_CMD="${RESTART_CMD:-}"

# 构建 WebUI / 插件必须存在的依赖（都在 devDependencies 里）
BUILD_DEPS=(vite typescript react react-dom tailwindcss @tailwindcss/vite @vitejs/plugin-react)
# 部署产物必须齐的三样：少了就是构建没跑完，往 NapCat 里铺会出各种怪问题
REQUIRED=(package.json index.mjs webui/index.html)

usage() {
    awk 'NR>2 { if ($0 !~ /^#/) exit; sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)      usage ;;
        --pull)         DO_PULL=1; shift ;;
        --no-pull)      DO_PULL=0; shift ;;
        --no-patch)     DO_PATCH=0; shift ;;
        --patch)        DO_PATCH=1; shift ;;
        --src-dir)      SRC_DIR="$2"; shift 2 ;;
        --napcat-dir)   NAPCAT_DIR="$2"; shift 2 ;;
        --plugins-dir)  PLUGIN_DIR="$2"; shift 2 ;;
        *)              echo "未知参数: $1（用 -h 看用法）" >&2; exit 1 ;;
    esac
done

# ---------- 0. 定位源码目录 ----------
if [[ ! -f "$SRC_DIR/package.json" ]]; then
    echo "错误：源码目录里没有 package.json -> $SRC_DIR" >&2
    echo "用 --src-dir 指定，例如：bash $0 --src-dir /root/napcat-plugin-group-manager" >&2
    exit 1
fi
cd "$SRC_DIR"
SRC_DIR="$(pwd)"
PLUGIN_ID="$(node -p "require('./package.json').name" 2>/dev/null || echo napcat-plugin-group-manager)"

# ---------- 1. 定位 NapCat ----------
find_napcat_dir() {
    local cands=() d found
    [[ -n "$NAPCAT_DIR" ]] && cands+=("$NAPCAT_DIR")
    cands+=(
        "$HOME/Napcat/opt/QQ/resources/app/app_launcher/napcat"
        "$HOME/NapCat/opt/QQ/resources/app/app_launcher/napcat"
        "/root/Napcat/opt/QQ/resources/app/app_launcher/napcat"
        "$HOME/Napcat"
        "/opt/QQ/resources/app/app_launcher/napcat"
    )
    for d in "${cands[@]}"; do
        [[ -n "$d" && -f "$d/napcat.mjs" ]] && { printf '%s\n' "$d"; return 0; }
    done
    # 兜底：全盘找一份 napcat.mjs
    found="$(find / -xdev -maxdepth 9 -type f -name napcat.mjs 2>/dev/null | head -n 1 || true)"
    [[ -n "$found" ]] && { dirname "$found"; return 0; }
    return 1
}

if [[ -z "$NAPCAT_DIR" ]]; then
    NAPCAT_DIR="$(find_napcat_dir)" || {
        echo "错误：找不到 napcat.mjs，请显式指定：" >&2
        echo "  bash $0 --napcat-dir /root/Napcat/opt/QQ/resources/app/app_launcher/napcat" >&2
        exit 1
    }
fi
[[ -z "$PLUGIN_DIR" ]] && PLUGIN_DIR="$NAPCAT_DIR/plugins"

echo "=============== 群管助手 一键部署 ==============="
echo "源码目录 : $SRC_DIR"
echo "插件 ID  : $PLUGIN_ID"
echo "NapCat   : $NAPCAT_DIR"
echo "插件目录 : $PLUGIN_DIR/$PLUGIN_ID"
echo

# ---------- 2. 拉代码 ----------
if [[ "$DO_PULL" == "1" ]]; then
    echo "--- git pull ---"
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "不是 git 仓库，跳过（$SRC_DIR）"
    elif [[ -z "$(git remote)" ]]; then
        echo "没有配置远端 remote，跳过"
    else
        if [[ -n "$(git status --porcelain)" ]]; then
            echo "警告：有未提交的本地改动，仍尝试 git pull ..."
        fi
        git pull || {
            echo "git pull 失败（冲突/网络/无上游分支？），未继续部署" >&2
            echo "处理完再重跑，或用 --no-pull 直接拿本地代码部署" >&2
            exit 1
        }
    fi
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "当前版本：$(git log -1 --format='%h %ad %s' --date=short 2>/dev/null || echo '(未知)')"
    fi
    echo
fi

# ---------- 3. 装依赖（缺才装） ----------
echo "--- 依赖 ---"
need_install=0
[[ -d node_modules ]] || need_install=1
for dep in "${BUILD_DEPS[@]}"; do
    [[ -f "node_modules/$dep/package.json" ]] || need_install=1
done

if [[ "$need_install" == "1" ]]; then
    if [[ "${NODE_ENV:-}" == "production" ]]; then
        echo "提示：检测到 NODE_ENV=production，已显式用 --include=dev 安装构建依赖"
    fi
    echo "构建依赖缺失，执行 npm install --include=dev ..."
    npm install --include=dev
else
    echo "构建依赖齐全，跳过安装"
fi
echo

# ---------- 4. 编译 ----------
echo "--- 编译 ---"
npm run build

missing=()
for f in "${REQUIRED[@]}"; do
    [[ -f "dist/$f" ]] || missing+=("$f")
done
if [[ ${#missing[@]} -gt 0 ]]; then
    echo "错误：dist/ 不完整，缺少 ${missing[*]}" >&2
    echo "      说明构建没有完整跑完，请检查上面的 npm run build 输出" >&2
    exit 1
fi
echo "dist/ 校验通过：${REQUIRED[*]}"
echo

# ---------- 5. 部署 ----------
echo "--- 部署 ---"
TARGET="$PLUGIN_DIR/$PLUGIN_ID"
mkdir -p "$PLUGIN_DIR"
# 先清空目标目录，避免上次部署残留的旧文件混在里面
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -r dist/. "$TARGET/"
echo "已复制到: $TARGET"
ls -1 "$TARGET"

missing=()
for f in "${REQUIRED[@]}"; do
    [[ -f "$TARGET/$f" ]] || missing+=("$f")
done
if [[ ${#missing[@]} -gt 0 ]]; then
    echo "错误：插件目录缺少 ${missing[*]}（不要多套一层 dist/）" >&2
    exit 1
fi
echo

# ---------- 6. 检测 / 加白 ----------
echo "--- 第三方插件注册检测 ---"
NAP_MJS="$NAPCAT_DIR/napcat.mjs"
if [[ ! -f "$NAP_MJS" ]]; then
    echo "警告：$NAP_MJS 不存在，跳过白名单检测（旧版 NapCat 可能用别的入口）"
    WL_CODE=0
else
    TMP_JS="$(mktemp "${TMPDIR:-/tmp}/napcat-wl.XXXXXX.mjs")"
    trap 'rm -f "$TMP_JS"' EXIT

    cat > "$TMP_JS" <<'NODE'
// 检测 / 修改 NapCat 打包产物里的「官方插件白名单」（ESM，临时文件后缀是 .mjs）
import fs from 'node:fs';
const file = process.argv[2];
const id = process.argv[3];
const apply = process.argv[4] === 'apply';

// 白名单里的官方插件 ID，任选一个当锚点，另外几个用来确认「这段确实是白名单」
const IDS = ['napcat-plugin-qce', 'napcat-plugin-builtin', 'napcat-plugin-cleaner', 'napcat-plugin-ssqq'];

const src0 = fs.readFileSync(file, 'utf8');

function locate(src) {
    for (const anchor of IDS) {
        let from = 0;
        for (;;) {
            const at = src.indexOf(anchor, from);
            if (at < 0) break;
            const pre = src.slice(Math.max(0, at - 400), at);
            if (IDS.filter((x) => x !== anchor).every((n) => pre.includes(n))) {
                const s = src.lastIndexOf('[', at);
                const e = src.indexOf(']', at);
                if (s >= 0 && e > at) return { s, e, at, anchor };
            }
            from = at + 1;
        }
    }
    return null;
}

const r = locate(src0);
if (!r) {
    if (src0.includes('whitelist')) {
        console.error('发现 whitelist 相关代码，但定位不到白名单数组，未做任何修改');
        console.error('请人工确认后手动加白，或把下面输出发给开发者：');
        console.error(`  grep -o '.\\{200\\}napcat-plugin-qce.\\{200\\}' "${file}"`);
        process.exit(1);
    }
    console.log('该版本 NapCat 未内置“官方插件白名单”限制，无需加白');
    process.exit(0);
}

const body = src0.slice(r.s, r.e + 1);
if (body.includes(`"${id}"`) || body.includes(`'${id}'`)) {
    console.log(`白名单检测：已放行（${id} 已在白名单内）`);
    process.exit(0);
}

if (!apply) {
    console.log(`白名单检测：未放行（${id} 不在白名单，加 --patch 可自动加白）`);
    process.exit(2);
}

const at = r.at;
const quote = src0[at - 1] === "'" ? "'" : '"';
const insertAt = at + r.anchor.length + 1;
if (src0[insertAt - 1] !== quote) {
    console.error('白名单检测：字面量引号解析失败，未做任何修改');
    process.exit(1);
}

const patched = src0.slice(0, insertAt) + ',' + quote + id + quote + src0.slice(insertAt);

const backup = `${file}.bak`;
if (!fs.existsSync(backup)) {
    fs.writeFileSync(backup, src0);
    console.log(`已备份原文件：${backup}`);
} else {
    console.log(`已存在备份，保留原备份：${backup}`);
}

fs.writeFileSync(file, patched);

const r2 = locate(fs.readFileSync(file, 'utf8'));
if (!r2 || !(fs.readFileSync(file, 'utf8').slice(r2.s, r2.e + 1).includes(`"${id}"`) ||
              fs.readFileSync(file, 'utf8').slice(r2.s, r2.e + 1).includes(`'${id}'`))) {
    console.error(`白名单检测：写入后校验失败，请还原：cp "${backup}" "${file}"`);
    process.exit(1);
}
console.log(`白名单检测：未放行 -> 已自动加白（新增 ${id}）`);
NODE

    set +e
    node "$TMP_JS" "$NAP_MJS" "$PLUGIN_ID" "$([[ "$DO_PATCH" == "1" ]] && echo apply || echo check)"
    WL_CODE=$?
    set -e
fi
echo

# ---------- 7. 收尾 ----------
echo "=============== 完成 ==============="
if [[ "${WL_CODE:-0}" == "2" ]]; then
    echo "注意：插件未加入白名单，NapCat 会拒绝加载（日志: not in official plugin whitelist）"
    echo "      重跑一次不加 --no-patch 即可自动加白"
fi
echo "下一步（任选其一）："
echo "  1) 打开 NapCat WebUI -> 插件管理 -> 找到「$PLUGIN_ID」-> 重载（或重启）"
if [[ -f "$HOME/napcat.sh" ]]; then
    echo "  2) 命令行重启：bash $HOME/napcat.sh"
elif [[ -f "$HOME/Napcat/napcat.sh" ]]; then
    echo "  2) 命令行重启：bash $HOME/Napcat/napcat.sh"
fi
echo "  3) 浏览器打开插件页面后按 Ctrl+F5 强制刷新（页面是单文件，缓存很顽固）"
echo "  4) 查看是否加载成功：grep -i '$PLUGIN_ID' \"$NAPCAT_DIR\"/../logs/* 2>/dev/null || true"
echo
echo "提示：napcat.mjs 打过补丁后，NapCat 升级会覆盖它，升级后重跑本脚本即可。"

if [[ -n "$RESTART_CMD" ]]; then
    echo
    echo "--- 执行 RESTART_CMD: $RESTART_CMD ---"
    bash -c "$RESTART_CMD" || echo "重启命令执行失败，请手动重启"
fi
