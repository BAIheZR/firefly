import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main.js',
        vite: {
          build: {
            rollupOptions: {
              // ws 依赖可选原生模块 bufferutil/utf-8-validate（未安装），
              // 外部化后运行时按 CJS 动态 require，缺失时自动回退，避免打包报错
              external: ['ws'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.js',
        onstart(options) {
          options.reload()
        },
      },
      {
        // 错误报告弹窗专用 preload
        entry: 'electron/errorPreload.js',
        onstart(options) {
          options.reload()
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    // 监听所有网卡：允许局域网内的手机/其他设备访问，用于联机功能测试
    host: true,
    // 联机 ws 服务代理：手机/其它设备只访问 3000 这一个端口即可联机，
    // 用 服务器地址 = 本机IP:3000/mp-ws 即可，免去 8765 端口的防火墙与多端口问题
    proxy: {
      '/mp-ws': {
        target: 'ws://127.0.0.1:8765',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})