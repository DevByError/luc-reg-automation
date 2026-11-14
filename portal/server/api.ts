/**
 * The portal's own address on this computer: /api/... Only this computer's browser, on the portal's
 * own page, can use it. Nothing here talks to anything other than online.lincoln.edu.my.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DocKey, StatusResponse } from '../shared/ops';
import { browserError, browserState, checkLogin, loginState, showLoginTab } from './browser';
import { SITE_URL } from './config';
import { SiteStop } from './errors';
import { listFolders, openFolder, readForViewer, saveUpload, settings, updateSettings } from './files';
import { log } from './log';
import { forLog, runOp } from './ops';

type Next = (err?: unknown) => void;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
};

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new SiteStop('The file is too big', 'The site takes files up to 10 MB.'));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const body = await readBody(req, 1024 * 1024);
  try {
    return JSON.parse(body.toString('utf8') || '{}') as T;
  } catch {
    throw new SiteStop('Bad request', 'The portal sent something the tool could not read.');
  }
}

/** Only the portal's own page on this computer: the right address, and no other website behind the request. */
function refused(req: IncomingMessage, needHeader: boolean): string | null {
  const port = req.socket.localPort;
  const host = (req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return 'wrong address';
  const origin = req.headers.origin;
  if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return 'another website';
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return 'another website';
  if (needHeader && req.headers['x-portal'] !== '1') return 'not from the portal';
  return null;
}

/** probe: ask the site whether the staff is logged in. Without it, the last known answer (no request to the site). */
async function status(probe = true): Promise<StatusResponse> {
  if (probe && browserState === 'open') await checkLogin().catch(() => undefined);
  return {
    ok: true,
    platform: process.platform,
    siteUrl: SITE_URL,
    browser: browserState,
    browserError: browserError || undefined,
    login: loginState,
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname;
  const method = req.method || 'GET';

  if (path === '/api/file' && method === 'GET') {
    const why = refused(req, false);
    if (why) return json(res, 403, { ok: false, error: { kind: 'bug', message: `Refused: ${why}.` } });
    const file = readForViewer(url.searchParams.get('passport') || '', url.searchParams.get('name') || '');
    if (!file) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Length', String(file.body.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(url.searchParams.get('name') || 'file')}`);
    res.end(file.body);
    return;
  }

  const why = refused(req, true);
  if (why) return json(res, 403, { ok: false, error: { kind: 'bug', message: `Refused: ${why}.` } });

  if (path === '/api/status' && method === 'GET') return json(res, 200, await status(url.searchParams.get('probe') !== '0'));

  if (path === '/api/browser/open' && method === 'POST') {
    try {
      await showLoginTab();
    } catch {
      // The status says what went wrong.
    }
    return json(res, 200, await status());
  }

  if (path === '/api/op' && method === 'POST') {
    const body = await readJson<{ op?: string; args?: unknown; run?: number }>(req);
    return json(res, 200, await runOp(String(body.op || ''), body.args ?? {}, Number(body.run ?? -1)));
  }

  if (path === '/api/settings' && method === 'POST') {
    updateSettings(await readJson<{ filesRoot?: string; accessReason?: string }>(req));
    return json(res, 200, { ok: true, filesRoot: settings.filesRoot });
  }

  if (path === '/api/folders' && method === 'GET') return json(res, 200, listFolders(url.searchParams.get('q') || ''));

  if (path === '/api/folder/open' && method === 'POST') {
    const body = await readJson<{ passport?: string }>(req);
    return json(res, 200, { ok: true, folder: openFolder(String(body.passport || '')) });
  }

  if (path === '/api/upload' && method === 'POST') {
    const key = url.searchParams.get('key') as DocKey | null;
    // The staff's own files: the stamp scan, the English certificate when the tool couldn't get it from the site,
    // and another file for the English result in step 3.
    if (key !== 'stamp' && key !== 'english' && key !== 'englishResult') {
      return json(res, 400, { ok: false, error: { kind: 'bug', message: 'Only the stamp scan and the English certificate are uploaded.' } });
    }
    const bytes = await readBody(req, 10 * 1024 * 1024 + 1);
    const file = saveUpload(url.searchParams.get('passport') || '', key, bytes);
    return json(res, 200, { ok: true, result: file });
  }

  return json(res, 404, { ok: false, error: { kind: 'bug', message: 'No such action.' } });
}

/** The /api/ part of the portal's address. Everything else goes to the portal's pages. */
export function apiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url || '/', 'http://portal.local');
    if (!url.pathname.startsWith('/api/')) return next();
    handle(req, res, url).catch((e) => {
      if (e instanceof SiteStop) return json(res, 200, { ok: false, error: { kind: 'stop', title: e.title, message: e.message } });
      log(`api: ${url.pathname} failed (${forLog(e)})`);
      json(res, 500, { ok: false, error: { kind: 'bug', message: e instanceof Error ? e.message.split('\n')[0] : String(e) } });
    });
  };
}
