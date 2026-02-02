import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
    root: '.',
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                sidepanel: path.resolve(__dirname, 'src/sidepanel/sidepanel.html')
            },
            output: {
                entryFileNames: 'src/sidepanel/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                        return 'src/sidepanel/[name][extname]';
                    }
                    return 'assets/[name][extname]';
                }
            }
        }
    },
    plugins: [
        viteStaticCopy({
            targets: [
                {
                    src: 'manifest.json',
                    dest: '.'
                },
                {
                    src: 'icons',
                    dest: '.'
                },
                {
                    src: 'src/content',
                    dest: 'src'
                },
                {
                    src: 'src/background',
                    dest: 'src'
                }
            ]
        })
    ]
});
