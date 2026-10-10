/**
 * 构建前置检查：确认 Node 版本与构建依赖已就绪。
 *
 * 最常见的失败原因是用 `npm install --production`（或 NODE_ENV=production）安装，
 * 这样会跳过 devDependencies，而 vite / tailwindcss / @vitejs/plugin-react 等
 * 全都在这类里，构建时会报 `ERR_MODULE_NOT_FOUND: Cannot find package '@tailwindcss/vite'`。
 * 与其让用户对着这种报错发呆，不如提前给出明确指引。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 构建 WebUI / 插件必须存在的包 */
const REQUIRED = [
    'vite',
    '@vitejs/plugin-react',
    '@tailwindcss/vite',
    'tailwindcss',
    'typescript',
    'react',
    'react-dom',
];

const missing = REQUIRED.filter(
    (name) => !existsSync(path.join(root, 'node_modules', name, 'package.json')),
);

if (missing.length) {
    console.error(`\n[preflight] 缺少构建依赖：${missing.join('、')}`);
    console.error('[preflight] 这些依赖都在 devDependencies 里，常见原因是安装时加了 --production / --omit=dev，');
    console.error('[preflight] 或者 NODE_ENV=production，或者根本没执行过安装。');
    console.error('[preflight] 请在项目根目录执行（不要加 --production）：');
    console.error('[preflight]   npm install --include=dev');
    console.error('[preflight]   或  pnpm install\n');
    process.exit(1);
}

const major = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(major) || major < 18) {
    console.error(`\n[preflight] Node 版本过低：${process.versions.node}`);
    console.error('[preflight] Vite 6 / Tailwind CSS 4 需要 Node 18+（建议 20 或 22）。\n');
    process.exit(1);
}

// 两个 tsconfig 是 WebUI 构建/类型检查的一部分，缺了说明仓库不完整
const tsconfigs = ['tsconfig.json', 'tsconfig.webui.json'].filter(
    (name) => !existsSync(path.join(root, name)),
);
if (tsconfigs.length) {
    console.error(`\n[preflight] 缺少配置文件：${tsconfigs.join('、')}（仓库不完整？）\n`);
    process.exit(1);
}

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
console.log(`[preflight] OK：${pkg.name} v${pkg.version} · Node ${process.versions.node}`);
