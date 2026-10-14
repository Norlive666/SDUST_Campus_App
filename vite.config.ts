import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
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
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/jsxsd/, ''),
      },
    },
  },
});
