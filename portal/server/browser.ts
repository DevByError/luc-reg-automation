/**
 * The site window: one Microsoft Edge window the staff logs in to, with one tab per step.
 * Each tab is a "lane". Work on one lane happens one action at a time; lanes run side by side.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import type { BrowserContext, CDPSession, Dialog, Frame, Page, Request } from 'playwright-core';
import { BROWSER_PATH, HEADLESS, LOGIN_PROBE, SITE_HOST, SITE_URL, WAIT, browserProfileDir, siteUrl } from './config';
import { SiteCancelled, SiteLoggedOut, SiteNetwork, SiteStop } from './errors';
import { installPortalHelpers } from './inpage';
import { log } from './log';

export type Lane = 'login' | 'step0' | 'step1' | 'report' | 'step2' | 'english' | 'step4' | 'docs' | 'step5' | 'step6' | 'reupload';
export type Scope = Page | Frame;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ browser */

let context: BrowserContext | null = null;
let starting: Promise<BrowserContext> | null = null;
export let browserState: 'closed' | 'starting' | 'open' | 'error' = 'closed';
export let browserError = '';
export let loginState: 'in' | 'out' | 'unknown' = 'unknown';

export function setLoginState(s: 'in' | 'out' | 'unknown') {
  if (s !== loginState) log(`login: ${s}`);
  loginState = s;
}

const lanePages = new Map<Lane, Page>();
const pageLanes = new WeakMap<Page, Lane>();
/** Requests a page is waiting for, with when each started. */
const pending = new WeakMap<Page, Map<Request, number>>();

function trackPage(page: Page) {
  const map = new Map<Request, number>();
  pending.set(page, map);
  const counts = (r: Request) => ['document', 'xhr', 'fetch'].includes(r.resourceType());
  page.on('request', (r) => {
    if (counts(r)) map.set(r, Date.now());
  });
  // The site has answered once its reply arrives. (A page that never reads a reply's body would
  // otherwise look busy for ever.)
  page.on('response', (res) => map.delete(res.request()));
  page.on('requestfinished', (r) => map.delete(r));
  page.on('requestfailed', (r) => map.delete(r));
}

/** Requests still waiting for the site. One open for more than 40 seconds is a background connection, not work. */
function waitingRequests(page: Page, frame?: Frame): number {
  const map = pending.get(page);
  if (!map) return 0;
  const now = Date.now();
  let n = 0;
  for (const [r, started] of map.entries()) {
    // Waiting for one part of the page (a section in its own frame): the page's other parts don't count.
    if (frame && r.frame() !== frame) continue;
    if (now - started < 40_000) n += 1;
  }
  return n;
}

async function launch(): Promise<BrowserContext> {
  const dir = browserProfileDir();
  fs.mkdirSync(dir, { recursive: true });
  const base = {
    headless: HEADLESS,
    acceptDownloads: true,
    viewport: null,
    args: ['--start-maximized', '--no-first-run', '--no-default-browser-check'],
  };
  const tries: { channel?: string; executablePath?: string }[] = BROWSER_PATH
    ? [{ executablePath: BROWSER_PATH }]
    : [{ channel: 'msedge' }, { channel: 'chrome' }];
  let last: unknown = null;
  for (const t of tries) {
    try {
      return await chromium.launchPersistentContext(dir, { ...base, ...t });
    } catch (e) {
      last = e;
      log(`browser: ${t.channel ?? 'given browser'} did not start`);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Opens the site window if it isn't open yet. */
export async function ensureBrowser(): Promise<BrowserContext> {
  if (context) return context;
  if (starting) return starting;
  browserState = 'starting';
  browserError = '';
  starting = (async () => {
    try {
      const ctx = await launch();
      await ctx.addInitScript(installPortalHelpers);
      ctx.on('dialog', onDialog);
      ctx.on('page', trackPage);
      ctx.pages().forEach(trackPage);
      ctx.on('close', () => {
        log('browser: the site window was closed');
        context = null;
        tabMaker = null;
        browserState = 'closed';
        setLoginState('unknown');
        lanePages.clear();
        held.forEach((h) => h.dialog.dismiss().catch(() => undefined));
        held.clear();
      });
      context = ctx;
      browserState = 'open';
      const first = ctx.pages()[0] ?? (await ctx.newPage());
      setLanePage('login', first);
      first.goto(SITE_URL, { timeout: WAIT.page }).catch(() => undefined);
      log('browser: open');
      return ctx;
    } catch (e) {
      browserState = 'error';
      const text = e instanceof Error ? e.message : String(e);
      browserError = /ProcessSingleton|profile|in use|lock/i.test(text)
        ? 'The site window is already open from an earlier start. Close that Edge window, then try again.'
        : "Microsoft Edge didn't start. Check that Edge is installed, then try again.";
      log(`browser: failed (${text.split('\n')[0].slice(0, 160)})`);
      throw new SiteStop("The site window couldn't open", browserError);
    } finally {
      starting = null;
    }
  })();
  return starting;
}

export async function closeBrowser() {
  const ctx = context;
  context = null;
  if (ctx) await ctx.close().catch(() => undefined);
}

/** Brings the login tab to the front, opening the window if needed. */
export async function showLoginTab() {
  const ctx = await ensureBrowser();
  let page = lanePages.get('login');
  if (!page || page.isClosed()) {
    page = await ctx.newPage();
    setLanePage('login', page);
  }
  await page.bringToFront().catch(() => undefined);
  const host = safeHost(page.url());
  // Already on the site's login page: leave it, the staff may be typing there.
  if (await onLoginPage(page)) {
    setLoginState('out');
    return;
  }
  // Not on the site yet, or the site has logged the staff out: open the site, which shows its login page.
  const out = host === SITE_HOST ? !(await checkLogin(true).catch(() => true)) : true;
  if (out) await page.goto(SITE_URL, { timeout: WAIT.page }).catch(() => undefined);
}

/* -------------------------------------------------------------------- lanes */

export function setLanePage(lane: Lane, page: Page) {
  lanePages.set(lane, page);
  pageLanes.set(page, lane);
  page.on('close', () => {
    if (lanePages.get(lane) === page) {
      lanePages.delete(lane);
      if (context) log(`tab closed: ${lane}`);
    }
  });
  page.on('crash', () => log(`tab crashed: ${lane}`));
}

export function existingPage(lane: Lane): Page | null {
  const p = lanePages.get(lane);
  return p && !p.isClosed() ? p : null;
}

/** The tab for a lane, opening a new one if needed. */
export async function lanePage(lane: Lane): Promise<Page> {
  const ctx = await ensureBrowser();
  const p = existingPage(lane);
  if (p) return p;
  const page = await openTabBehind(ctx);
  setLanePage(lane, page);
  return page;
}

/** Brings a lane's tab to the front of the site window. Only when the staff asks to see it. */
export async function showLane(lane: Lane): Promise<boolean> {
  const page = existingPage(lane);
  if (!page) return false;
  await page.bringToFront().catch(() => undefined);
  return true;
}

let tabMaker: Promise<CDPSession> | null = null;

async function targetIdOf(ctx: BrowserContext, page: Page): Promise<string> {
  const s = await ctx.newCDPSession(page);
  try {
    const { targetInfo } = await s.send('Target.getTargetInfo');
    return targetInfo.targetId;
  } finally {
    await s.detach().catch(() => undefined);
  }
}

/**
 * A new tab that opens behind the tab on show, so the site window doesn't jump in front of the portal.
 * (Playwright's own newPage brings the window to the front.) If the browser won't do that, it opens the usual way.
 */
async function openTabBehind(ctx: BrowserContext): Promise<Page> {
  const browser = ctx.browser();
  if (!browser) return ctx.newPage();
  let targetId = '';
  try {
    tabMaker ??= browser.newBrowserCDPSession();
    const session = await tabMaker;
    const checked = new Set(ctx.pages());
    ({ targetId } = await session.send('Target.createTarget', { url: 'about:blank', background: true }));
    const end = Date.now() + 15_000;
    for (;;) {
      for (const p of ctx.pages()) {
        if (checked.has(p)) continue;
        const id = await targetIdOf(ctx, p).catch(() => null);
        if (id === null) continue; // Not ready to answer yet: asked again next round.
        checked.add(p);
        if (id === targetId) return p;
      }
      if (Date.now() > end) throw new Error('the new tab did not show up');
      await sleep(50);
    }
  } catch (e) {
    tabMaker = null;
    log(`browser: couldn't open a tab behind (${(e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 120)}), opening it in front`);
    if (targetId) {
      const s = await browser.newBrowserCDPSession().catch(() => null);
      await s?.send('Target.closeTarget', { targetId }).catch(() => undefined);
      await s?.detach().catch(() => undefined);
    }
    return ctx.newPage();
  }
}

const locks = new Map<Lane, Promise<unknown>>();

/** Runs work on a lane, after any work already running there. */
export async function withLane<T>(lane: Lane, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(lane) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(() => mine, () => mine);
  locks.set(lane, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(lane) === chained) locks.delete(lane);
  }
}

/* -------------------------------------------------------------- the student */

let currentRun = 0;
export const getRun = () => currentRun;

export function checkRun(run: number) {
  if (run !== currentRun) throw new SiteCancelled();
}

/**
 * A new student: let what is running finish (up to 30 seconds), then close the old student's tabs.
 * Only those tabs: a tab the new student opens in the meantime is never touched.
 */
export async function startStudent(run: number) {
  currentRun = run;
  held.forEach((h) => h.dialog.dismiss().catch(() => undefined));
  held.clear();
  const old = Array.from(lanePages.entries()).filter(([lane]) => lane !== 'login');
  await Promise.all(
    old.map(async ([lane, page]) => {
      const closeOld = async () => {
        if (lanePages.get(lane) === page) lanePages.delete(lane);
        await page.close().catch(() => undefined);
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        withLane(lane, closeOld),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => void closeOld().then(resolve), 30_000);
        }),
      ]);
      clearTimeout(timer);
    }),
  );
}

/* ------------------------------------------------------------------ dialogs */

interface Seen {
  text: string;
  type: string;
  known: boolean;
  heldId?: string;
}

const expected = new Map<Lane, { match: RegExp; accept: boolean }[]>();
const seen = new Map<Lane, Seen[]>();
const held = new Map<string, { dialog: Dialog; lane: Lane }>();

/** A popup's words for the log: numbers hidden and cut short, so no student detail is kept. */
const maskedWords = (t: string) => t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').replace(/\d{3,}/g, '#').slice(0, 160);

function onDialog(dialog: Dialog) {
  const page = dialog.page();
  const lane = page ? pageLanes.get(page) : undefined;
  // The staff's own tab, or a tab the tool doesn't work in: the staff answers it there.
  if (!lane || lane === 'login') return;
  const text = dialog.message().replace(/\s+/g, ' ').trim();
  const list = seen.get(lane) ?? [];
  seen.set(lane, list);
  if (dialog.type() === 'beforeunload') {
    void dialog.accept().catch(() => undefined);
    return;
  }
  const exp = (expected.get(lane) ?? []).find((e) => e.match.test(text));
  if (exp) {
    list.push({ text, type: dialog.type(), known: true });
    void (exp.accept ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
    log(`popup on ${lane}: known (${exp.accept ? 'OK' : 'Cancel'})`);
    return;
  }
  if (dialog.type() === 'alert') {
    // An alert has only OK. Pressing it changes nothing; the tool still stops and shows the text.
    list.push({ text, type: 'alert', known: false });
    void dialog.accept().catch(() => undefined);
    log(`popup on ${lane}: unknown alert "${maskedWords(text)}"`);
    return;
  }
  // OK or Cancel: the staff decides. The page waits until then.
  const id = crypto.randomUUID();
  held.set(id, { dialog, lane });
  list.push({ text, type: dialog.type(), known: false, heldId: id });
  log(`popup on ${lane}: unknown ${dialog.type()} "${maskedWords(text)}", waiting for the staff`);
}

/** Which popups an action expects, e.g. "Data Found to Verify and submit." → OK. */
export function expectDialogs(lane: Lane, list: { match: RegExp; accept: boolean }[]) {
  expected.set(lane, list);
  seen.set(lane, []);
}

export function takeDialogs(lane: Lane): Seen[] {
  const list = seen.get(lane) ?? [];
  seen.set(lane, []);
  return list;
}

export function peekDialogs(lane: Lane): Seen[] {
  return seen.get(lane) ?? [];
}

export function hasHeld(lane: Lane): boolean {
  return Array.from(held.values()).some((h) => h.lane === lane);
}

export async function answerHeld(id: string, accept: boolean) {
  const h = held.get(id);
  if (!h) return;
  held.delete(id);
  await (accept ? h.dialog.accept() : h.dialog.dismiss()).catch(() => undefined);
  log(`popup on ${h.lane}: the staff pressed ${accept ? 'OK' : 'Cancel'}`);
}

/* ---------------------------------------------------------- page waiting */

export function pageOf(scope: Scope): Page {
  return 'mainFrame' in scope ? (scope as Page) : (scope as Frame).page();
}

export function laneOf(scope: Scope): Lane | undefined {
  return pageLanes.get(pageOf(scope));
}

async function evalWithin<T>(scope: Scope, fn: () => T, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([scope.evaluate(fn), sleep(ms).then(() => TIMEOUT)]) as Promise<T | typeof TIMEOUT>;
}
const TIMEOUT = Symbol('timeout');

/**
 * Waits until the page is quiet: loaded, no postback, no AJAX, no "Please wait" box,
 * for a short moment in a row. A popup waiting for an answer ends the wait early.
 * Given one frame of a page (a section of the Admission Form), only that frame has to be quiet: the other
 * sections of a big page may keep loading for a long time and are no reason to wait.
 * Returns false when it was still busy after `timeout`.
 */
export async function settleOrTimeout(scope: Scope, timeout = WAIT.settle): Promise<boolean> {
  const page = pageOf(scope);
  const frame = scope === page ? undefined : (scope as Frame);
  const lane = pageLanes.get(page);
  const start = Date.now();
  let quietSince = 0;
  await sleep(200);
  for (;;) {
    if (page.isClosed()) throw new SiteNetwork('The site window was closed');
    if (lane && hasHeld(lane)) return true;
    let state: string;
    try {
      const r = await evalWithin(
        scope,
        () => {
          const p = (window as unknown as { __portal?: { busy: () => string } }).__portal;
          return p ? p.busy() : document.readyState === 'complete' ? '' : 'page';
        },
        2500,
      );
      state = r === TIMEOUT ? 'blocked' : r;
    } catch {
      state = 'navigating';
    }
    const url = page.url();
    if (url.startsWith('chrome-error://')) throw new SiteNetwork("Couldn't reach online.lincoln.edu.my");
    const busy = state !== '' || waitingRequests(page, frame) > 0;
    if (!busy) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 450) return true;
    } else {
      quietSince = 0;
    }
    if (Date.now() - start > timeout) return false;
    await sleep(150);
  }
}

export async function settle(scope: Scope, timeout = WAIT.settle) {
  if (!(await settleOrTimeout(scope, timeout))) throw new SiteNetwork('The site took too long to answer');
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

/** The login page has a password box. Seeing one where a form was expected means the site logged the staff out. */
/** The page is the site's login page: a visible password box, or a login address. */
export async function onLoginPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (safeHost(url) !== SITE_HOST) return false;
  if (/login|signin|sign-in|logon/i.test(pathOf(url))) return true;
  return page
    .locator('input[type=password]')
    .evaluateAll((els) => els.some((e) => (e as HTMLElement).getClientRects().length > 0))
    .catch(() => false);
}

export async function assertLoggedIn(page: Page, expectPath?: string) {
  const url = page.url();
  if (url.startsWith('chrome-error://')) throw new SiteNetwork("Couldn't reach online.lincoln.edu.my");
  if (safeHost(url) !== SITE_HOST) return;
  if (await onLoginPage(page)) {
    setLoginState('out');
    throw new SiteLoggedOut();
  }
  setLoginState('in');
  if (expectPath && pathOf(url) !== expectPath.toLowerCase()) {
    throw new SiteStop(
      'The site opened a different page',
      `The tool asked for ${expectPath} but the site showed ${pathOf(url) || 'another page'}. Nothing was changed.`,
    );
  }
}

/** Opens one of the site's pages in a lane's tab, checking the login on the way. */
export async function openPage(lane: Lane, path: string, opts: { expectPath?: boolean } = {}): Promise<Page> {
  const page = await lanePage(lane);
  let status = 0;
  try {
    const res = await page.goto(siteUrl(path), { waitUntil: 'load', timeout: WAIT.page });
    status = res?.status() ?? 0;
  } catch (e) {
    throw asNetwork(e);
  }
  // A server error page: the site is having trouble. Reading again a little later usually works.
  if (status >= 500) throw new SiteNetwork(`The site answered with an error (${status})`);
  await settle(page);
  await assertLoggedIn(page, opts.expectPath === false ? undefined : path);
  return page;
}

/** Turns browser errors into "couldn't reach the site" where that's what they mean. */
export function asNetwork(e: unknown): Error {
  if (e instanceof SiteStop || e instanceof SiteLoggedOut || e instanceof SiteNetwork || e instanceof SiteCancelled) return e;
  const text = e instanceof Error ? e.message : String(e);
  if (/Timeout|timed out/i.test(text)) return new SiteNetwork('The site took too long to answer');
  if (/net::ERR_|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up/i.test(text)) return new SiteNetwork("Couldn't reach online.lincoln.edu.my");
  if (/Target page, context or browser has been closed|Target closed|has been closed/i.test(text)) {
    return new SiteNetwork('The site window was closed');
  }
  return e instanceof Error ? e : new Error(text);
}

/* -------------------------------------------------------------------- login */

let lastCheck = 0;

/** Checks the login without opening a tab: asks the site for a page only logged-in staff can see. */
export async function checkLogin(force = false): Promise<boolean> {
  if (!context) {
    setLoginState('unknown');
    return false;
  }
  if (!force && Date.now() - lastCheck < 2500) return loginState === 'in';
  lastCheck = Date.now();
  try {
    const res = await context.request.get(siteUrl(LOGIN_PROBE), { timeout: 20_000, maxRedirects: 10 });
    const body = await res.text();
    const finalPath = pathOf(res.url());
    const out = /type\s*=\s*["']?password/i.test(body) || finalPath !== LOGIN_PROBE.toLowerCase() || res.status() >= 400;
    setLoginState(out ? 'out' : 'in');
    return !out;
  } catch (e) {
    throw asNetwork(e);
  }
}

export function currentContext(): BrowserContext | null {
  return context;
}
