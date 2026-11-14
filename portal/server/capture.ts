/**
 * Saves the layout of a site page (field names, buttons, column headings) into the
 * site-check folder, so a page that changed can be fixed. Never values or student details:
 * no typed values, no table contents, no screenshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Frame } from 'playwright-core';
import type { Lane, Scope } from './browser';
import { pageOf, pathOf, sleep } from './browser';
import { ensureHelpers } from './find';

let dir = '';
const done = new Set<string>();

export function setCaptureDir(root: string) {
  dir = path.join(root, 'site-check');
}

async function layoutOf(scope: Scope): Promise<unknown> {
  await ensureHelpers(scope);
  return Promise.race([
    scope.evaluate(() => (window as unknown as { __portal: { layout: () => unknown } }).__portal.layout()),
    sleep(6000).then(() => ({ error: 'the page did not answer' })),
  ]).catch(() => ({ error: 'the page could not be read' }));
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

/**
 * Saves the layout of the page `scope` is on, with its frames (sections of a page that are pages themselves).
 * When `scope` is a frame, that frame comes first, so the part the tool was working on is always in the file.
 */
export async function capture(lane: Lane, scope: Scope, why: string) {
  if (!dir) return;
  try {
    const page = pageOf(scope);
    if (page.isClosed()) return;
    fs.mkdirSync(dir, { recursive: true });
    if (fs.readdirSync(dir).length > 500) return;
    const main = await layoutOf(page);
    const frames: unknown[] = [];
    const own = scope !== page && scope !== page.mainFrame() ? [scope as Frame] : [];
    for (const f of [...own, ...page.frames().filter((x) => !own.includes(x))]) {
      if (f === page.mainFrame() || f.isDetached()) continue;
      frames.push({ frame: f.name() || pathOf(f.url()), layout: await layoutOf(f as Frame) });
      if (frames.length >= 12) break;
    }
    const name = `${stamp()} ${lane} ${why}`.replace(/[^A-Za-z0-9 ._-]+/g, '').slice(0, 120) + '.json';
    const data = { savedAt: new Date().toISOString(), lane, why, page: pathOf(page.url()), main, frames };
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 1));
  } catch {
    // Saving a layout must never stop the work.
  }
}

/** Once per page type each time the portal starts: enough to see every page the tool used. */
export async function captureOnce(lane: Lane, scope: Scope, why: string) {
  const key = `${lane}|${why}`;
  if (done.has(key)) return;
  done.add(key);
  await capture(lane, scope, why);
}

/* ---------------------------------------------------------- learned pages */

/**
 * Addresses the tool learned from the site itself, such as the page a section of the Admission Form shows.
 * Only the page's path (never what comes after "?"), so no student detail is kept. In the site-check folder.
 */
const learnedFile = () => (dir ? path.join(dir, 'pages.json') : '');

function readLearned(): Record<string, string> {
  try {
    const file = learnedFile();
    if (!file || !fs.existsSync(file)) return {};
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function learnedPage(name: string): string {
  const p = readLearned()[name];
  return typeof p === 'string' && /^\/[A-Za-z0-9_./-]+$/.test(p) ? p : '';
}

export function learnPage(name: string, pagePath: string) {
  const file = learnedFile();
  if (!file || !/^\/[A-Za-z0-9_./-]+$/.test(pagePath) || learnedPage(name) === pagePath) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...readLearned(), [name]: pagePath }, null, 1));
  } catch {
    // Remembering a page must never stop the work.
  }
}
