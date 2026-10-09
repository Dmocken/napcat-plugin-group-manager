/**
 * 打包收尾：
 *   1. 把 WebUI 页面与素材复制进 dist
 *   2. 生成一份干净的 package.json（NapCat 通过它识别插件）
 *   3. 可选：把 dist 部署到 NapCat 插件目录（--deploy 或 NAPCAT_PLUGIN_DIR）
 */

import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf-8'));

await mkdir(dist, { recursive: true });

// WebUI（单文件页面）
await rm(path.join(dist, 'webui'), { recursive: true, force: true });
await cp(path.join(root, 'src/webui'), path.join(dist, 'webui'), { recursive: true });

// 素材（图片等）：{image=/assets/xxx.png} 会从这里读取
const assetsSrc = path.join(root, 'src/assets');
if (existsSync(assetsSrc)) {
    await rm(path.join(dist, 'assets'), { recursive: true, force: true });
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

console.log(`[pack] 构建产物已生成：${dist}`);
console.log('[pack] 把 dist 目录下的全部文件复制到 NapCat 的 plugins/ 目录即可（目录名随意）');

const deployTo = process.argv.includes('--deploy') ? process.env.NAPCAT_PLUGIN_DIR : null;
if (process.argv.includes('--deploy')) {
    if (!deployTo) {
        console.warn('[pack] 未设置环境变量 NAPCAT_PLUGIN_DIR，跳过部署');
    } else {
        const target = path.join(deployTo, pkg.name);
        await rm(target, { recursive: true, force: true });
        await cp(dist, target, { recursive: true });
        console.log(`[pack] 已部署到 ${target}`);
    }
}
