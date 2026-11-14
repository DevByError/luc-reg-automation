/**
 * The English-result MINI PORTAL: a small page on this computer (port 4789) that does only Verify / Upload English Result,
 * through the SAME tool code and the SAME /api calls as the real portal (file saved in the student's folder, result.find,
 * result.view, result.test, result.fill, result.upload). Run: test-english-portal.bat
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { apiMiddleware } from '../../server/api';
import { closeBrowser } from '../../server/browser';
import { setLogDir, log } from '../../server/log';
import { setCaptureDir } from '../../server/capture';
import { VERSION } from '../../src/version';

setLogDir(process.cwd());
setCaptureDir(process.cwd());
const api = apiMiddleware();
const PORT = 4789;
const page = () =>
  fs.readFileSync(path.join(process.cwd(), 'tests', 'tools', 'english-portal.html'), 'utf8').replace('__VERSION__', `${VERSION.date} ${VERSION.time}`);

const server = http.createServer((req, res) => {
  api(req, res, () => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(page());
  });
});
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`English result mini portal - version ${VERSION.date} ${VERSION.time}`);
  console.log(`Open ${url} (it opens by itself). Keep this window open; close it to stop.`);
  log(`english mini portal: started (version ${VERSION.date} ${VERSION.time})`);
  spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
});
const stop = () => void closeBrowser().finally(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
