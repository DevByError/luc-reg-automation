/**
 * Every action the portal can ask for, by name, with the tab it works in. Actions in the same tab
 * run one after another; different tabs run side by side. An action for a student who is no longer
 * open is dropped.
 */
import type { OpArgs, OpError, OpName, OpResponse, OpResult, SaveKey } from '../shared/ops';
import type { Lane, Scope } from './browser';
import { answerHeld, asNetwork, checkLogin, checkRun, ensureBrowser, existingPage, onLoginPage, pageOf, settle, showLane, sleep, startStudent, withLane } from './browser';
import { capture, captureOnce } from './capture';
import { SiteCancelled, SiteLoggedOut, SiteNeedsStop, SiteNetwork, SiteStop } from './errors';
import { activeTab, findButton, highlight, loc } from './find';
import { log } from './log';
import * as s1 from './steps/step1';
import * as s2 from './steps/step2';
import * as s3 from './steps/step3';
import * as s0 from './steps/step0';
import * as s4 from './steps/step4';
import * as s5 from './steps/step5';
import * as s6 from './steps/step6';
import * as sr from './steps/result';

type Def<K extends OpName> = { lane: Lane | null; fn: (args: OpArgs<K>) => Promise<OpResult<K>> };
type Defs = { [K in OpName]: Def<K> };

/* -------------------------------------------------------------- save checks */

const FORM_TAB: Partial<Record<SaveKey, string>> = {
  profile: 'Admission Profile',
  address: 'Address',
  whatsapp: 'Add WhatsApp',
  wechat: 'Add Wechat',
  parents: 'Parents Details',
  education: 'Education',
};

/** Which tab each save happens in. */
const SAVE_LANE: Record<SaveKey, Lane> = {
  profile: 'step2',
  address: 'step2',
  whatsapp: 'step2',
  wechat: 'step2',
  parents: 'step2',
  education: 'step2',
  final: 'step2',
  // Verify / Upload English Result is a section of the Admission Form (or, when that page was lost, its own tab).
  englishReupload: 'step2',
  collection: 'step5',
  stage: 'step5',
  collectionAgain: 'step5',
  stageAgain: 'step5',
  visa: 'step6',
};

/**
 * After a save whose answer was lost: did it go through? true, false, or 'unknown' when the site
 * doesn't show it clearly. 'unknown' makes the portal stop and ask the staff to look, so nothing saves twice.
 */
async function saveCheck(key: SaveKey, passport: string): Promise<boolean | 'unknown'> {
  const tab = FORM_TAB[key];
  if (tab) {
    const page = existingPage('step2');
    if (!page) return 'unknown';
    await settle(page).catch(() => undefined);
    const now = await activeTab(page, s2.TABS);
    if (!now) return 'unknown';
    const i = s2.TABS.indexOf(now);
    const k = s2.TABS.indexOf(tab);
    if (i > k) return true;
    if (i === k) return false;
    return 'unknown';
  }
  switch (key) {
    case 'final':
      return sr.finalSubmitted();
    case 'englishReupload':
      return sr.uploadSaved();
    case 'collection':
    case 'collectionAgain':
      return (await s5.holdingShows(passport)) ? true : 'unknown';
    case 'stage':
    case 'stageAgain':
      return s5.stageSaved(passport);
    case 'visa':
      return s6.visaSaved();
    default:
      return 'unknown';
  }
}

/**
 * Watch mode: draws a red box around the button about to be pressed, then takes a picture of the page for
 * the portal to show, so the site window can stay behind the portal. With `front`, the staff asked to see
 * the site window itself: its tab comes to the front instead.
 */
async function reveal(key: SaveKey, front: boolean): Promise<OpResult<'site.reveal'>> {
  if (key === 'englishReupload') return revealIn(await sr.uploadButton(), front);
  const lane = SAVE_LANE[key];
  const page = existingPage(lane);
  if (!page) return { outlined: false };
  if (front) await showLane(lane);
  const name: Partial<Record<SaveKey, string>> = {
    profile: 'Continue To Next',
    address: 'Continue To Next',
    whatsapp: 'Continue To Next',
    wechat: 'Continue To Next',
    parents: 'Continue To Next',
    education: 'Continue To Next',
    final: 'Final Submit',
    stage: 'Update',
    stageAgain: 'Update',
    visa: 'Submit Visa Information',
  };
  const mark = key === 'collection' || key === 'collectionAgain' ? await s5.submitButton() : name[key] ? await findButton(page, name[key]!, { where: 'the site', timeout: 0 }).catch(() => null) : null;
  if (mark) await highlight(page, mark);
  if (front) return { outlined: !!mark };
  // The page may scroll smoothly to the button: let it arrive first.
  await sleep(500);
  const shot = await page.screenshot({ type: 'jpeg', quality: 80, scale: 'css', caret: 'initial', timeout: 10_000 }).catch(() => null);
  if (!shot) return { outlined: !!mark };
  const box = mark ? await loc(page, mark).boundingBox().catch(() => null) : null;
  return {
    picture: `data:image/jpeg;base64,${shot.toString('base64')}`,
    outlined: !!mark,
    spot: box ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) } : undefined,
  };
}

/** Watch mode for a button inside a section of a page (a frame): outlined there, and a picture of the whole page. */
async function revealIn(hit: { scope: Scope; mark: string } | null, front: boolean): Promise<OpResult<'site.reveal'>> {
  const page = hit ? pageOf(hit.scope) : existingPage('step2');
  if (!page) return { outlined: false };
  if (front) await page.bringToFront().catch(() => undefined);
  if (hit) await highlight(hit.scope, hit.mark);
  if (front) return { outlined: !!hit };
  await sleep(500);
  const shot = await page.screenshot({ type: 'jpeg', quality: 80, scale: 'css', caret: 'initial', timeout: 10_000 }).catch(() => null);
  if (!shot) return { outlined: !!hit };
  const box = hit ? await loc(hit.scope, hit.mark).boundingBox().catch(() => null) : null;
  return {
    picture: `data:image/jpeg;base64,${shot.toString('base64')}`,
    outlined: !!hit,
    spot: box ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) } : undefined,
  };
}

/* ------------------------------------------------------------------- the list */

const DEFS: Defs = {
  'session.start': { lane: null, fn: async () => true },
  'login.check': { lane: null, fn: () => checkLogin(true) },
  'save.check': {
    lane: null,
    fn: ({ key, passport }) =>
      withLane(SAVE_LANE[key], async () => {
        try {
          return await saveCheck(key, passport);
        } catch (e) {
          // The page isn't as expected (closed, changed): the tool can't tell, so the staff looks.
          if (e instanceof SiteStop) return 'unknown';
          throw e;
        }
      }),
  },
  'site.reveal': { lane: null, fn: ({ key, front }) => withLane(SAVE_LANE[key], () => reveal(key, !!front)) },
  'popup.answer': {
    lane: null,
    fn: async ({ id, accept }) => {
      await answerHeld(id, accept);
      return true;
    },
  },

  'step1.open': { lane: 'step1', fn: () => s1.open() },
  'step1.search': { lane: 'step1', fn: (a) => s1.search(a) },
  'step1.print': { lane: 'step1', fn: (a) => s1.print(a) },
  'step1.pdf': { lane: 'step1', fn: (a) => s1.pdf(a) },

  'step2.open': { lane: 'step2', fn: () => s2.open() },
  'step2.view': { lane: 'step2', fn: (a) => s2.view(a) },
  'step2.read': { lane: 'step2', fn: () => s2.read() },
  'step2.fill': { lane: 'step2', fn: (a) => s2.fill(a) },
  'step2.readBack': { lane: 'step2', fn: (a) => s2.readBack(a) },
  'step2.continue': { lane: 'step2', fn: () => s2.continueProfile() },
  'step2.checkNext': { lane: 'step2', fn: () => s2.checkNext() },

  'english.open': { lane: 'english', fn: () => s2.englishOpen() },
  'english.search': { lane: 'english', fn: (a) => s2.englishSearch(a) },
  'english.find': { lane: 'english', fn: () => s2.englishFind() },
  'english.download': { lane: 'english', fn: (a) => s2.englishDownload(a) },
  'english.attach': { lane: 'step2', fn: (a) => s2.englishAttach(a) },
  'english.list': { lane: 'english', fn: (a) => s2.englishList(a) },
  'english.pick': { lane: 'english', fn: (a) => s2.englishPick(a) },

  'step3.pass': { lane: 'step2', fn: (a) => s3.pass(a) },
  'step3.parents': { lane: 'step2', fn: () => s3.parents() },
  'step3.writeContact': { lane: 'step2', fn: (a) => s3.writeContact(a) },
  'step3.readContact': { lane: 'step2', fn: () => s3.readContact() },
  'step3.continueParents': { lane: 'step2', fn: () => s3.continueParents() },
  'step3.payment': { lane: 'step2', fn: () => s3.payment() },
  'form.fillNeeds': { lane: 'step2', fn: (a) => s2.fillNeeds(a) },
  'step3.fillPayment': { lane: 'step2', fn: (a) => s3.fillPayment(a) },
  'step3.final': { lane: 'step2', fn: () => s3.finalSubmit() },

  // Each runs in the Admission Form's lane itself (see guarded in result.ts).
  'result.find': { lane: null, fn: sr.guarded('result.find', sr.find) },
  'result.view': { lane: null, fn: sr.guarded('result.view', sr.view) },
  'result.test': { lane: null, fn: sr.guarded('result.test', sr.test) },
  'result.fill': { lane: null, fn: sr.guarded('result.fill', sr.fill) },
  'result.upload': { lane: null, fn: sr.guarded('result.upload', sr.upload) },

  'step0.open': { lane: 'step0', fn: () => s0.open() },
  'step0.view': { lane: 'step0', fn: (a) => s0.view(a) },
  'step0.reason': { lane: 'step0', fn: (a) => s0.reason(a) },
  'step0.pdf': { lane: 'step0', fn: (a) => s0.pdf(a) },

  'step4.open': { lane: 'step4', fn: () => s4.open() },
  'step4.view': { lane: 'step4', fn: (a) => s4.view(a) },
  'step4.reason': { lane: 'step4', fn: (a) => s4.reason(a) },
  'step4.result': { lane: 'step4', fn: (a) => s4.result(a) },
  'step4.docsTab': { lane: 'step4', fn: () => s4.docsTab() },
  'step4.download': { lane: 'docs', fn: (a) => s4.download(a) },

  'val.open': { lane: 'docs', fn: () => s4.valOpen() },
  'val.fetch': { lane: 'docs', fn: (a) => s4.valFetch(a) },

  'step5.open': { lane: 'step5', fn: () => s5.open() },
  'step5.load': { lane: 'step5', fn: (a) => s5.load(a) },
  'step5.fill': { lane: 'step5', fn: (a) => s5.fill(a) },
  'step5.readBack': { lane: 'step5', fn: (a) => s5.readBack(a) },
  'step5.confirm': { lane: 'step5', fn: () => s5.confirm() },
  'step5.submit': { lane: 'step5', fn: () => s5.submit() },
  'step5.holdingWait': { lane: 'step5', fn: (a) => s5.holdingWait(a) },
  'step5.holding': { lane: 'step5', fn: (a) => s5.holdingFile(a) },
  'step5.collectionTab': { lane: 'step5', fn: (a) => s5.collectionTab(a) },
  'step5.stagesTab': { lane: 'step5', fn: () => s5.stagesTab() },
  'step5.stage': { lane: 'step5', fn: (a) => s5.stage(a) },
  'step5.stageSearch': { lane: 'step5', fn: (a) => s5.stageSearch(a) },
  'step5.remark': { lane: 'step5', fn: (a) => s5.remark(a) },
  'step5.select': { lane: 'step5', fn: () => s5.select() },
  'step5.update': { lane: 'step5', fn: (a) => s5.update(a) },
  'step5.checkStage': { lane: 'step5', fn: (a) => s5.checkStage(a) },
  'step5.stageView': { lane: 'step5', fn: (a) => s5.stageView(a) },

  'step6.open': { lane: 'step6', fn: () => s6.open() },
  'step6.find': { lane: 'step6', fn: (a) => s6.find(a) },
  'step6.visaNumber': { lane: 'step6', fn: (a) => s6.visaNumber(a) },
  'step6.stamp': { lane: 'step6', fn: (a) => s6.stamp(a) },
  'step6.fillDates': { lane: 'step6', fn: (a) => s6.fillDates(a) },
  'step6.readDates': { lane: 'step6', fn: () => s6.readDates() },
  'step6.submit': { lane: 'step6', fn: (a) => s6.submit(a) },
  'step6.confirm': { lane: 'step6', fn: () => s6.confirmSaved() },
};

/**
 * A tab shows the login page. If the staff is still logged out, that is the answer: the portal waits for the login.
 * If the staff has logged in again since (in the login tab), this tab's page was lost to the logout. Starting the same
 * action on it again would only meet the login page again, so it stops and says so.
 */
async function loginPageError(): Promise<Error> {
  if (!(await checkLogin(true))) return new SiteLoggedOut();
  return new SiteStop(
    'This tab was logged out',
    'The site logged you out while this tab was open, so the page the tool was working on is gone. Nothing more was done on it.',
  );
}

/** Actions that belong to no student. */
const FREE = new Set<string>(['session.start', 'login.check', 'popup.answer']);

/* --------------------------------------------------------------- running one */

/** For the log: the first line, without addresses' details, quoted text or long numbers. Never values. */
export function forLog(e: unknown): string {
  const text = (e instanceof Error ? e.message : String(e)).split('\n')[0];
  return text
    .replace(/(https?:\/\/[^\s?]+)\?\S*/g, '$1?…')
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/\d{4,}/g, '#')
    .slice(0, 160);
}

function toOpError(e: unknown): OpError {
  if (e instanceof SiteLoggedOut) return { kind: 'logged-out' };
  if (e instanceof SiteCancelled) return { kind: 'cancelled' };
  if (e instanceof SiteNeedsStop) return { kind: 'stop', title: e.title, message: e.message, needs: e.needs };
  if (e instanceof SiteStop) return { kind: 'stop', title: e.title, message: e.message, rows: e.rows };
  const n = e instanceof SiteNetwork ? e : asNetwork(e);
  if (n instanceof SiteNetwork) return { kind: 'network', message: n.message };
  const text = (e instanceof Error ? e.message : String(e)).split('\n')[0].replace(/(https?:\/\/[^\s?]+)\?\S*/g, '$1?…');
  return { kind: 'bug', message: text.slice(0, 240) };
}

export async function runOp(name: string, args: unknown, run: number): Promise<OpResponse> {
  if (!Object.prototype.hasOwnProperty.call(DEFS, name)) return { ok: false, error: { kind: 'bug', message: `Unknown action "${name}".` } };
  const op = name as OpName;
  const def = DEFS[op] as Def<OpName>;
  const started = Date.now();
  const secs = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
  try {
    if (op === 'session.start') {
      await startStudent(run);
      await ensureBrowser();
      log(`session.start: ok (${secs()})`);
      return { ok: true, result: true };
    }
    const own = !FREE.has(op);
    if (own) checkRun(run);
    const work = async () => {
      if (own) checkRun(run);
      try {
        const result = await def.fn((args ?? {}) as never);
        if (def.lane) {
          const page = existingPage(def.lane);
          if (page) await captureOnce(def.lane, page, op);
        }
        return result;
      } catch (e) {
        const page = def.lane ? existingPage(def.lane) : null;
        // A tab that shows the login page explains the stop: say that, not "couldn't find" a box.
        if (page && (e instanceof SiteStop || e instanceof SiteLoggedOut) && (await onLoginPage(page))) throw await loginPageError();
        if (page && def.lane && e instanceof SiteStop) await capture(def.lane, page, `${op} stopped`);
        throw e;
      }
    };
    // Once an action has run, its answer is always returned, even if a new student started meanwhile:
    // 'cancelled' means only "it did not run", so the portal may safely ask again.
    const result = def.lane ? await withLane(def.lane, work) : await work();
    log(`${op}: ok (${secs()})`);
    return { ok: true, result };
  } catch (e) {
    const error = toOpError(e);
    const why = error.kind === 'stop' ? ` "${error.title.replace(/\d{4,}/g, '#')}"` : error.kind === 'bug' || error.kind === 'network' ? ` (${forLog(e)})` : '';
    log(`${op}: ${error.kind}${why} (${secs()})`);
    return { ok: false, error };
  }
}
