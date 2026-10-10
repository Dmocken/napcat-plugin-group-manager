/**
 * 组装构建产物：把三部分拼成一个自包含的 dist/
 *   1. 插件产物 .build/plugin/index.mjs（由 `vite build` 生成）
 *   2. WebUI 产物 src/webui/dist/index.html（单文件，JS/CSS 已内联）
 *   3. 素材 src/assets + 精简版 package.json
 *
 * 设计要点（都是为了不再出现「改了代码但部署后没变化」）：
 *   - dist/ 每次从零重新组装，不会有新旧文件混在一起
 *   - 插件产物先构建到 .build/plugin，所以单独跑 `vite build` 不会破坏已有的 dist/
 *   - 缺少任何一份产物都直接报错退出，不会产出半成品
 *   - 组装完成后校验关键文件是否齐全
 *
 * 用法：
 *   node scripts/pack.mjs                                   # 只组装 dist/
 *   node scripts/pack.mjs --deploy                          # 组装后复制到 NAPCAT_PLUGIN_DIR
 *   node scripts/pack.mjs --deploy --to=/path/to/plugins    # 指定 NapCat 的 plugins 目录
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pluginOut = path.join(root, '.build/plugin/index.mjs');
const pluginMap = path.join(root, '.build/plugin/index.mjs.map');
const webuiOut = path.join(root, 'src/webui/dist/index.html');
const assetsSrc = path.join(root, 'src/assets');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf-8'));

function fail(message) {
    console.error(`\n[pack] ${message}\n`);
    process.exit(1);
}

/** 组装产物必需的三个文件（相对 dist/） */
const REQUIRED = ['package.json', 'index.mjs', 'webui/index.html'];

/* ---------------- 1. 检查输入 ---------------- */

if (!existsSync(pluginOut)) {
    fail('缺少插件产物 .build/plugin/index.mjs —— 请先执行 npm run build（或 npm run build:plugin）');
}
if (!existsSync(webuiOut)) {
    fail('缺少 WebUI 产物 src/webui/dist/index.html —— 请先执行 npm run build（或 npm run build:webui）');
}

/* ---------------- 2. 从零组装 dist/ ---------------- */

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'webui'), { recursive: true });

await cp(pluginOut, path.join(dist, 'index.mjs'));
if (existsSync(pluginMap)) await cp(pluginMap, path.join(dist, 'index.mjs.map'));
await cp(webuiOut, path.join(dist, 'webui/index.html'));
if (existsSync(assetsSrc)) {
    await cp(assetsSrc, path.join(dist, 'assets'), { recursive: true });
}

const outPkg = {
    name: pkg.name,
    plugin: pkg.plugin,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
    type: pkg.type,
    main: pkg.main,
    napcat: pkg.napcat,
};
await writeFile(path.join(dist, 'package.json'), `${JSON.stringify(outPkg, null, 2)}\n`, 'utf-8');

/* ---------------- 3. 校验产物 ---------------- */

const absent = REQUIRED.filter((file) => !existsSync(path.join(dist, file)));
if (absent.length) fail(`产物不完整，缺少：${absent.join('、')}`);

const kb = async (file) => `${((await stat(path.join(dist, file))).size / 1024).toFixed(1)} KB`;
console.log(`[pack] 构建产物已生成：${dist}`);
console.log(`[pack]   index.mjs        ${await kb('index.mjs')}`);
console.log(`[pack]   webui/index.html ${await kb('webui/index.html')}`);
console.log(`[pack]   package.json     v${pkg.version}`);

/* ---------------- 4. 可选：部署到 NapCat ---------------- */

const toArg = process.argv.find((arg) => arg.startsWith('--to='));
const deployTo = toArg ? toArg.slice('--to='.length) : process.env.NAPCAT_PLUGIN_DIR;

if (process.argv.includes('--deploy')) {
    if (!deployTo) {
        fail(
            '没有指定部署目录：请设置环境变量 NAPCAT_PLUGIN_DIR，或用 --to=<目录> 指定 NapCat 的 plugins 目录',
        );
    }
    const target = path.resolve(deployTo, pkg.name);
    await rm(target, { recursive: true, force: true });
    await cp(dist, target, { recursive: true });

    const missingInTarget = REQUIRED.filter((file) => !existsSync(path.join(target, file)));
    if (missingInTarget.length) fail(`部署到 ${target} 失败，缺少：${missingInTarget.join('、')}`);
    console.log(`[pack] 已部署到 ${target}`);
} else {
    console.log('[pack] 部署：把 dist 目录下的全部文件复制到 NapCat 的 plugins/ 目录（目录名随意）');
    console.log('[pack] 或设置 NAPCAT_PLUGIN_DIR 后执行 npm run deploy');
}

console.log('[pack] 注意：部署后需要重启 / 重载 NapCat 插件，并在页面按 Ctrl+F5 强制刷新（页面有缓存）');
