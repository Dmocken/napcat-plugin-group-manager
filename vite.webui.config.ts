/**
 * WebUI 前端构建配置（独立于后端插件构建）
 *
 * 关键约束：产物必须是「单文件 HTML」——JS / CSS 全部内联回 index.html。
 *
 * 原因：同一个页面会被 NapCat 通过三种不同层级的路径暴露：
 *   - /plugin/<pluginId>/page/dashboard  （router.page，读取 htmlFile）
 *   - /plugin/<pluginId>/files/static/*  （router.static，指向 webui 目录）
 *   - /plugin/<pluginId>/api/ui          （readFileSync 后内联返回 HTML）
 * 若 HTML 里引用外部 ./assets/xxx.js，浏览器会把它解析成
 * /plugin/<id>/page/assets/xxx.js 之类的错误路径而 404。
 * 内联成单文件后，三种入口都能正常工作，服务端无需改动。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const webuiRoot = path.join(projectRoot, 'src/webui');

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 内联脚本里若出现 `</script>` 字面量会提前闭合标签，需要转义（语义不变） */
function safeInlineScript(code: string): string {
    return code.replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--');
}

/** 同理处理样式中的 `</style>` */
function safeInlineStyle(css: string): string {
    return css.replace(/<\/style>/gi, '<\\/style>');
}

/** 把 Vite 产出的 JS / CSS 资源内联进 index.html，并移除独立文件 */
function inlineSingleFile(): Plugin {
    return {
        name: 'inline-single-file',
        apply: 'build',
        enforce: 'post',
        generateBundle(_options, bundle) {
            const htmlName = Object.keys(bundle).find((file) => file.endsWith('.html'));
            if (!htmlName) return;

            const htmlAsset = bundle[htmlName];
            if (htmlAsset.type !== 'asset') return;

            let html = String(htmlAsset.source);
            const leftovers: string[] = [];

            for (const [fileName, output] of Object.entries(bundle)) {
                if (fileName === htmlName) continue;
                const base = escapeRegExp(path.basename(fileName));

                if (output.type === 'asset' && fileName.endsWith('.css')) {
                    const linkRe = new RegExp(`<link[^>]*href="[^"]*${base}"[^>]*>`);
                    if (linkRe.test(html)) {
                        const css = safeInlineStyle(String(output.source));
                        // 必须用函数形式：代码里的 $& / $' 会被字符串替换误解析
                        html = html.replace(linkRe, () => `<style>\n${css}\n</style>`);
                        delete bundle[fileName];
                    }
                    continue;
                }

                if (output.type === 'chunk' && fileName.endsWith('.js')) {
                    const scriptRe = new RegExp(`<script[^>]*src="[^"]*${base}"[^>]*>\\s*</script>`);
                    if (scriptRe.test(html)) {
                        const code = safeInlineScript(output.code);
                        html = html.replace(scriptRe, () => `<script type="module">\n${code}\n</script>`);
                        delete bundle[fileName];
                    } else {
                        leftovers.push(fileName);
                    }
                }
            }

            // modulepreload 属于代码分割的产物，单文件构建里不应存在
            html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '');

            if (leftovers.length) {
                this.warn(`以下 chunk 未能内联，单文件产物可能不完整：${leftovers.join(', ')}`);
            }

            htmlAsset.source = html;
        },
    };
}

export default defineConfig({
    root: webuiRoot,
    base: './',
    plugins: [react(), tailwindcss(), inlineSingleFile()],
    resolve: {
        alias: {
            '@': webuiRoot,
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'esnext',
        minify: 'esbuild',
        sourcemap: false,
        cssCodeSplit: false,
        // 单文件产物没有代码分割，polyfill 只会往产物里塞无用的模块预加载逻辑
        modulePreload: false,
        // 强制内联所有静态资源，保证产物只有一个 index.html
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        chunkSizeWarningLimit: 4096,
        reportCompressedSize: false,
    },
});
