import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    build: {
        // 插件产物先落到暂存目录，由 scripts/pack.mjs 再和 WebUI 产物一起组装成 dist/。
        // 这样单独跑 `vite build` 不会把已经组装好的 dist/ 清空（outDir 若是 dist，
        // 又带 emptyOutDir，一旦 WebUI 构建失败，dist/ 就会停在缺文件的半成品状态）。
        outDir: '.build/plugin',
        emptyOutDir: true,
        target: 'esnext',
        minify: false,
        sourcemap: true,
        lib: {
            entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
            formats: ['es'],
            fileName: () => 'index.mjs',
        },
        rollupOptions: {
            // 插件运行在 NapCat（Node）进程内：Node 内置模块必须保持 external，
            // 否则 Vite 会替换成浏览器 stub，运行时报错。
            external: [/^node:/, 'napcat-types'],
        },
    },
});
