import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    build: {
        outDir: 'dist',
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
