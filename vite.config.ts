import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error - plain JS module shared with the production server
import { handleApi } from './server/proxy.js';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'station-import-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!(await handleApi(req, res))) next();
        });
      },
    },
  ],
  server: { port: 5173, host: true },
  build: { outDir: 'dist', sourcemap: true },
});
