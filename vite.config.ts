import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { offlineShell } from './pwa/plugin';

export default defineConfig({
  plugins: [vue(), offlineShell()],
  build: {
    rollupOptions: {
      input: {
        campus: path.resolve(__dirname, 'index.html'),
        remote: path.resolve(__dirname, 'remote-control.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api/jsxsd': {
        target: 'https://jwglxt.sdust.edu.cn/jsxsd',
        changeOrigin: true,
        cookieDomainRewrite: "",
        cookiePathRewrite: "/api/jsxsd/",
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/jsxsd/, ''),
      },
    },
  },
});
