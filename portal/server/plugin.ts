/**
 * Runs the tool inside the portal's own small server (the one start-portal.bat starts),
 * so there is one window to keep open and nothing else to install.
 */
import type { Plugin } from 'vite';
import { apiMiddleware } from './api';
import { closeBrowser } from './browser';
import { setCaptureDir } from './capture';
import { log, setLogDir } from './log';
import { VERSION } from '../src/version';

export function portalBackend(): Plugin {
  const attach = (server: { middlewares: { use: (fn: ReturnType<typeof apiMiddleware>) => unknown }; httpServer: { once: (e: 'close', fn: () => void) => unknown } | null }) => {
    server.middlewares.use(apiMiddleware());
    server.httpServer?.once('close', () => void closeBrowser());
    console.log(`
[portal] version ${VERSION.date} ${VERSION.time}
`);
    log(`portal: started (version ${VERSION.date} ${VERSION.time})`);
  };
  return {
    name: 'registration-portal-backend',
    configResolved(config) {
      setLogDir(config.root);
      setCaptureDir(config.root);
    },
    configureServer(server) {
      attach(server);
    },
    configurePreviewServer(server) {
      attach(server);
    },
    // Called when the portal's server stops or restarts: the site window closes with it.
    async closeBundle() {
      await closeBrowser();
    },
  };
}
