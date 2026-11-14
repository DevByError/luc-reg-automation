/**
 * Live mode: keeps an eye on the site window (Microsoft Edge, opened by the tool on this computer).
 * While the staff isn't logged in, it asks every few seconds, so the portal notices the login by itself
 * and anything paused carries on. Once logged in, it only checks now and then that the window is still open,
 * without asking the site anything.
 */
import type { StatusResponse } from '../../shared/ops';
import { isLive } from '../site';
import { fetchStatus, openSiteWindow, sendSettings } from '../site/live';
import { resumeAfterLogin } from './runner';
import { app, toast } from './store';

let timer: number | undefined;

const urgent = () => {
  const s = app.get();
  const w = s.siteWindow;
  return w.tool !== 'ok' || w.browser !== 'open' || w.login !== 'in' || s.site.status !== 'signed-in';
};

function apply(st: StatusResponse) {
  app.set((s) => ({ ...s, siteWindow: { tool: 'ok', browser: st.browser, login: st.login, error: st.browserError } }));
  if (st.login === 'in' && app.get().site.status === 'logged-out') void resumeAfterLogin(true);
}

function toolDown() {
  app.set((s) => ({ ...s, siteWindow: { ...s.siteWindow, tool: 'down' } }));
}

function schedule(ms = urgent() ? 3000 : 20_000) {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => void tick(), ms);
}

async function tick() {
  timer = undefined;
  if (!isLive()) return;
  try {
    apply(await fetchStatus(urgent()));
  } catch {
    toolDown();
  }
  if (isLive()) schedule();
}

/** At start (and when switching to live mode): send the settings, then open the site window if it's closed. */
export async function connectTool() {
  if (!isLive()) return;
  try {
    const { filesRoot, accessReason } = app.get().settings;
    await sendSettings({ filesRoot, accessReason });
    const st = await fetchStatus(true);
    apply(st);
    if (st.browser === 'closed') await showSiteWindow();
  } catch {
    toolDown();
  }
  schedule();
}

export function stopToolWatch() {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = undefined;
}

/** Opens the site window, or brings it to the front (to log in, or to look at a page). */
export async function showSiteWindow() {
  app.set((s) => ({ ...s, siteWindow: { ...s.siteWindow, browser: s.siteWindow.browser === 'open' ? 'open' : 'starting', error: undefined } }));
  try {
    apply(await openSiteWindow());
  } catch (e) {
    toolDown();
    toast(e instanceof Error ? e.message : "Couldn't open the site window.", 'error');
  }
  schedule(1500);
}

/** The settings changed: the tool uses the new students folder and access reason from now on. */
export async function sendSettingsToTool() {
  if (!isLive()) return;
  const { filesRoot, accessReason } = app.get().settings;
  await sendSettings({ filesRoot, accessReason }).catch(() => toolDown());
}

/** Sooner check, e.g. right after an action said the site logged the staff out. */
export const checkSoon = () => {
  if (isLive()) schedule(1000);
};

let lastStatus = app.get().site.status;
app.subscribe(() => {
  const now = app.get().site.status;
  if (now === lastStatus) return;
  lastStatus = now;
  if (now === 'logged-out') checkSoon();
});
