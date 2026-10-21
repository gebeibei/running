import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import yaml from '@modyfi/vite-plugin-yaml';
import svgr from 'vite-plugin-svgr';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const colorClassMapping: { [key: string]: string } = {
  '#1a1a1a': 'svg-color-bg',
  '#222': 'svg-color-bg',
  '#444': 'svg-color-inactive-cell',
  '#4dd2ff': 'svg-color-active-cell',
  '#fff': 'svg-color-text',
  '#e1ed5e': 'svg-color-text',
};

/**
 * MapLibre GL 用 `new URL('maplibre-gl-worker.mjs', import.meta.url)` 推导 worker
 * 地址，打包后 worker 文件不会被一起产出，地图会报 "Worker failed to load"。
 * 应用 bundle 是多 chunk 的，worker 只能以单文件形式加载，所以在页面构建
 * 结束后再单独打包一份自包含的 worker，落在它推导出的路径上。
 */
function mapLibreWorker(): Plugin {
  const workerFile = path.resolve(
    rootDir,
    'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'
  );
  return {
    name: 'maplibre-worker',
    apply: 'build',
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: true,
          minify: true,
          emptyOutDir: false,
          outDir: path.resolve(rootDir, 'dist/assets'),
          lib: {
            entry: workerFile,
            formats: ['es'],
            fileName: () => 'maplibre-gl-worker.mjs',
          },
          rollupOptions: {
            // rolldown 已废弃 inlineDynamicImports，单文件产物用 codeSplitting: false
            output: { codeSplitting: false },
          },
        },
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    mapLibreWorker(),
    yaml(),
    svgr({
      include: ['**/*.svg'],
      svgrOptions: {
        exportType: 'named',
        namedExport: 'ReactComponent',
        plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx'],
        svgoConfig: {
          floatPrecision: 2,
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  removeTitle: false,
                  removeViewBox: false,
                },
              },
            },
            {
              name: 'addClassesByFillColor',
              fn: () => {
                return {
                  element: {
                    enter: (node: {
                      attributes: {
                        fill?: string;
                        stroke?: string;
                        class?: string;
                      };
                    }) => {
                      const fillColor = node.attributes.fill;
                      if (fillColor) {
                        const lowerCaseFill = fillColor.toLowerCase();
                        if (colorClassMapping[lowerCaseFill]) {
                          node.attributes.class =
                            colorClassMapping[lowerCaseFill];
                        }
                      }
                      const strokeColor = node.attributes.stroke;
                      if (strokeColor) {
                        const lowerCaseStroke = strokeColor.toLowerCase();
                        if (colorClassMapping[lowerCaseStroke]) {
                          const existingClass = node.attributes.class || '';
                          const newClass = colorClassMapping[lowerCaseStroke];
                          if (!existingClass.includes(newClass)) {
                            node.attributes.class =
                              `${existingClass} ${newClass}`.trim();
                          }
                        }
                      }
                    },
                  },
                };
              },
            },
          ],
        },
      },
    }),
  ],
  base: process.env.PATH_PREFIX ? `${process.env.PATH_PREFIX}/` : '/',
  define: {
    'import.meta.env.VERCEL': JSON.stringify(process.env.VERCEL),
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      '@config': path.resolve(rootDir, 'config.yml'),
      '@core': path.resolve(rootDir, './src/core'),
      '@themes': path.resolve(rootDir, './src/themes'),
      '@assets': path.resolve(rootDir, './assets'),
    },
  },
  build: {
    manifest: true,
    modulePreload: false,
    outDir: './dist',
  },
});
