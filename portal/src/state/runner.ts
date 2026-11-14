/**
 * How the tool talks to the site, safely:
 * - Reading (opening pages, searching, downloading) waits and retries by itself when the site is slow or the network drops.
 * - Saving is never repeated blindly. If the answer is lost, the tool first checks whether the save went through.
 * - If the site logs the staff out, everything pauses, keeps its place, and continues after the staff logs in again.
 *   The login has no fixed length: the tool only reacts when the site says it logged the staff out.
 * - A popup the tool doesn't know pauses everything until the staff decides.
 * - Watch mode (live): before each press on the site, the button is outlined in the site window and the staff says go.
 */
import { call, isLive } from '../site';
import { LoggedOutError, NetworkError } from '../site/errors';
import { Cancelled, StopError } from './errors';
import { addActivity, app, markSaved, setBusy, setStep, toast, updateActivity } from './store';
import type { SaveResult } from '../../shared/ops';
import type { RetryKey, SaveKey, StepId } from './types';

export { Cancelled, StopError } from './errors';

/** The tool on this computer has its own limits on the site and always answers; these only catch a hang. */
const readTimeout = () => (isLive() ? 240_000 : 90_000);
const saveTimeout = () => (isLive() ? 240_000 : 120_000);
/** Waits between tries when the site doesn't answer: 3s, 6s, 12s, 20s, 30s, 30s. */
const BACKOFF = [3_000, 6_000, 12_000, 20_000, 30_000, 30_000];

export const alive = (run: number) => app.get().runId === run;

function guard(run: number) {
  if (!alive(run)) throw new Cancelled();
}

class TimeoutError extends NetworkError {
  constructor() {
    super('The site took too long to answer');
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new TimeoutError()), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/* ------------------------------------------------------- the site logged out */

let loginWaiters: Array<() => void> = [];

function waitForLogin(): Promise<void> {
  app.set((s) => (s.site.status === 'logged-out' ? s : { ...s, site: { status: 'logged-out' } }));
  return new Promise((resolve) => loginWaiters.push(resolve));
}

/**
 * Check the login, then let every paused action continue. The staff presses "I've logged in", or
 * (live mode) the portal notices by itself that the site window is logged in again.
 */
export async function resumeAfterLogin(noticed = false) {
  if (app.get().site.status === 'checking') return;
  app.set((s) => ({ ...s, site: { status: 'checking' } }));
  let ok = false;
  try {
    ok = await call(app.get().runId, 'login.check', {});
  } catch {
    ok = false;
  }
  if (!ok) {
    app.set((s) => ({ ...s, site: { status: 'logged-out' } }));
    if (!noticed) toast('The site window still shows the login page. Log in there first, then press resume.', 'warning');
    return;
  }
  app.set((s) => ({ ...s, site: { status: 'signed-in' } }));
  const waiting = loginWaiters;
  loginWaiters = [];
  waiting.forEach((w) => w());
  if (waiting.length > 0) toast('Logged in again. The tool carries on from where it paused.', 'success');
}

/** True while some action waits for the staff to log in again. */
export const pausedForLogin = () => loginWaiters.length > 0;

/* --------------------------------------------------------------- retry waits */

let retryNowListeners: Array<() => void> = [];

function waitBeforeRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      retryNowListeners = retryNowListeners.filter((f) => f !== done);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    retryNowListeners.push(done);
  });
}

/** "Retry now" on the connection banner: skip the remaining wait everywhere. */
export function retryAllNow() {
  retryNowListeners.slice().forEach((f) => f());
}

/* ------------------------------------------------------------ unknown popups */

const popupAnswers = new Map<number, (choice: 'continue' | 'stop') => void>();
let popupCounter = 0;

function askAboutPopup(step: StepId, text: string, action: string, held: boolean): Promise<'continue' | 'stop'> {
  const id = ++popupCounter;
  app.set((s) => ({ ...s, popups: [...s.popups, { id, step, text, action, held }] }));
  return new Promise((resolve) => popupAnswers.set(id, resolve));
}

export function answerPopup(id: number, choice: 'continue' | 'stop') {
  app.set((s) => ({ ...s, popups: s.popups.filter((p) => p.id !== id) }));
  popupAnswers.get(id)?.(choice);
  popupAnswers.delete(id);
}

/* --------------------------------------------------------------- watch mode */

const watchAnswers = new Map<number, (go: boolean) => void>();
let watchCounter = 0;

/** What each save presses on the site, and where. */
export const PRESS: Record<SaveKey, { button: string; where: string }> = {
  profile: { button: 'Continue To Next', where: 'the Admission Profile' },
  address: { button: 'Continue To Next', where: 'the Address tab' },
  whatsapp: { button: 'Continue To Next', where: 'the Add WhatsApp tab' },
  wechat: { button: 'Continue To Next', where: 'the Add Wechat tab' },
  parents: { button: 'Continue To Next', where: 'Parents Details' },
  education: { button: 'Continue To Next', where: 'the Education tab' },
  final: { button: 'Final Submit', where: 'Payment Plan' },
  englishReupload: { button: 'Upload', where: 'Verify / Upload English Result' },
  collection: { button: 'Submit', where: 'Passport Collection' },
  stage: { button: 'Update', where: 'Passport Movement Stages' },
  collectionAgain: { button: 'Submit', where: 'Passport Collection, the second time' },
  stageAgain: { button: 'Update', where: 'Passport Movement Stages, after Submit again' },
  visa: { button: 'Submit Visa Information', where: 'Admission Assistance' },
};

/**
 * Live mode with watch mode on: outline the button on the site page, show a picture of that page in the portal,
 * and wait for the staff's go. The site window stays where it is unless the staff asks to see it.
 */
async function watchBeforePress(run: number, step: StepId, key: SaveKey, label: string) {
  if (!isLive() || !app.get().settings.watchMode) return;
  const shown = await call(run, 'site.reveal', { key }).catch(() => null);
  guard(run);
  const id = ++watchCounter;
  app.set((s) => ({ ...s, watch: { id, step, key, label, picture: shown?.picture, outlined: shown?.outlined, spot: shown?.spot } }));
  const go = await new Promise<boolean>((resolve) => watchAnswers.set(id, resolve));
  guard(run);
  if (!go) {
    throw new StopError('Stopped before the press', `You stopped before "${PRESS[key].button}" on ${PRESS[key].where}. Nothing was pressed on the site.`);
  }
}

/** "Show it in the site window": brings the tab with the outlined button to the front. Only when the staff asks. */
export function revealWatch() {
  const w = app.get().watch;
  if (w) void call(app.get().runId, 'site.reveal', { key: w.key, front: true }).catch(() => undefined);
}

export function answerWatch(id: number, go: boolean) {
  app.set((s) => (s.watch?.id === id ? { ...s, watch: null } : s));
  watchAnswers.get(id)?.(go);
  watchAnswers.delete(id);
}

/** A new student: questions about the old one are dropped (their work ends quietly). */
export function dropQuestions() {
  watchAnswers.forEach((answer) => answer(false));
  watchAnswers.clear();
  popupAnswers.forEach((answer) => answer('stop'));
  popupAnswers.clear();
  app.set((s) => ({ ...s, watch: null, popups: [] }));
}

/* -------------------------------------------------------------------- reads */

interface ReadOptions<T> {
  detail?: string;
  done?: (result: T) => string | undefined;
}

/** Runs one read-only action, shown as a line in the step's activity list. Retries by itself. */
export async function runRead<T>(
  run: number,
  step: StepId,
  label: string,
  fn: () => Promise<T>,
  opts: ReadOptions<T> = {},
): Promise<T> {
  guard(run);
  const id = addActivity(run, step, { label, detail: opts.detail, state: 'running', startedAt: Date.now() });
  let attempt = 0;
  for (;;) {
    try {
      const result = await withTimeout(fn(), readTimeout());
      guard(run);
      updateActivity(run, step, id, { state: 'done', endedAt: Date.now(), detail: opts.done?.(result) ?? opts.detail });
      return result;
    } catch (e) {
      guard(run);
      if (e instanceof LoggedOutError) {
        updateActivity(run, step, id, { state: 'paused', detail: 'Paused: the site logged you out. Waiting for you to log in again.' });
        await waitForLogin();
        guard(run);
        updateActivity(run, step, id, { state: 'running', detail: 'Logged in again. Trying this again.', startedAt: Date.now() });
        continue;
      }
      if (e instanceof NetworkError) {
        if (attempt >= BACKOFF.length) {
          updateActivity(run, step, id, { state: 'error', endedAt: Date.now(), detail: `${e.message}. Gave up after ${attempt + 1} tries.` });
          throw new StopError(
            "Couldn't reach the site",
            `The tool tried ${attempt + 1} times and online.lincoln.edu.my didn't answer. Nothing was saved by this action. Check the network, then press Try again.`,
          );
        }
        const wait = BACKOFF[attempt];
        attempt += 1;
        updateActivity(run, step, id, {
          state: 'retrying',
          retryAt: Date.now() + wait,
          detail: `${e.message}. Trying again (try ${attempt + 1} of ${BACKOFF.length + 1}).`,
        });
        await waitBeforeRetry(wait);
        guard(run);
        updateActivity(run, step, id, { state: 'running', retryAt: undefined, startedAt: Date.now() });
        continue;
      }
      updateActivity(run, step, id, { state: 'error', endedAt: Date.now(), detail: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }
}

/** A finished line, for things that need no site call (for example "Done earlier, not repeated"). */
export function noteActivity(run: number, step: StepId, label: string, detail?: string) {
  const now = Date.now();
  addActivity(run, step, { label, detail, state: 'done', startedAt: now, endedAt: now });
}

/** A line that waits for something else, such as the LUC number. Returns a function that starts it. */
export function waitingActivity(run: number, step: StepId, label: string, detail: string) {
  const id = addActivity(run, step, { label, detail, state: 'waiting' });
  return {
    id,
    finish: (doneDetail?: string) =>
      updateActivity(run, step, id, { state: 'done', detail: doneDetail ?? detail, startedAt: Date.now(), endedAt: Date.now() }),
    fail: (failDetail: string) => updateActivity(run, step, id, { state: 'error', detail: failDetail, endedAt: Date.now() }),
  };
}

/* ------------------------------------------------------------------- saves */

interface SaveOptions {
  /** Popup texts that are expected and are accepted with OK. */
  knownPopups?: string[];
  /** Any popup is accepted with OK and its text is shown (a check follows anyway). */
  acceptAnyPopup?: boolean;
  /** What the staff presses to try again, e.g. "Submit". */
  againLabel: string;
}

/**
 * Runs one click that saves on the site. It is recorded once it went through, so it is never done twice,
 * even if the site logs the staff out in between. If the answer is lost, the tool checks before doing anything else.
 */
export async function runSave(
  run: number,
  step: StepId,
  key: SaveKey,
  label: string,
  fn: () => Promise<SaveResult>,
  opts: SaveOptions,
): Promise<void> {
  guard(run);
  if (app.get().saves[key]) {
    noteActivity(run, step, label, 'Done earlier. Not repeated.');
    return;
  }
  await watchBeforePress(run, step, key, label);
  const id = addActivity(run, step, { label, state: 'running', startedAt: Date.now() });
  const passport = app.get().student?.passport ?? '';

  const checkWhetherSaved = async (why: string) => {
    updateActivity(run, step, id, { state: 'running', detail: `${why} Checking whether it saved before doing anything else.` });
    const saved = await runRead(run, step, 'Check whether the save went through', () => call(run, 'save.check', { key, passport }), {
      done: (ok) => (ok === 'unknown' ? "The site doesn't show it clearly." : ok ? 'Yes, it saved.' : 'No, nothing was saved.'),
    });
    if (saved === true) {
      markSaved(run, key);
      updateActivity(run, step, id, { state: 'done', endedAt: Date.now(), detail: `${why} The check shows it saved, so it was not repeated.` });
      return;
    }
    if (saved === 'unknown') {
      updateActivity(run, step, id, { state: 'error', endedAt: Date.now(), detail: `${why} The tool can't tell whether it saved, so it pressed nothing again.` });
      throw new StopError(
        'Look at the site window',
        `${why} The tool can't tell from the site whether "${PRESS[key].button}" on ${PRESS[key].where} went through, so it pressed nothing again. ` +
          `If the site window shows it saved, press "It saved on the site". If it didn't, press ${opts.againLabel}.`,
        { confirmSaved: key },
      );
    }
    updateActivity(run, step, id, { state: 'error', endedAt: Date.now(), detail: `${why} Nothing was saved, and nothing was repeated.` });
    throw new StopError('Not saved', `${why} The check shows nothing was saved on the site. Press ${opts.againLabel} when you're ready.`);
  };

  let result: SaveResult;
  try {
    result = await withTimeout(fn(), saveTimeout());
  } catch (e) {
    guard(run);
    if (e instanceof LoggedOutError) {
      updateActivity(run, step, id, { state: 'paused', detail: 'Paused: the site logged you out. Waiting for you to log in again.' });
      await waitForLogin();
      guard(run);
      return checkWhetherSaved('The site logged you out during this save.');
    }
    if (e instanceof NetworkError) {
      return checkWhetherSaved(`${e.message}.`);
    }
    // The site asked for fields: this line, near the buttons, says where the box to fill them is.
    const where = e instanceof StopError && e.extra.needs ? ` Fill ${e.extra.needs.fields.length === 1 ? 'it' : 'them'} in the red box at the top of this step.` : '';
    updateActivity(run, step, id, { state: 'error', endedAt: Date.now(), detail: (e instanceof Error ? e.message : String(e)) + where });
    if (e instanceof StopError) {
      // The site wasn't as expected around this press. If an earlier press did save, the staff can say so.
      // Not when the site asked for fields: it plainly didn't take the save.
      throw new StopError(e.title, e.message, e.extra.needs ? e.extra : { ...e.extra, confirmSaved: key });
    }
    throw e;
  }
  guard(run);

  const popup = result.popup;
  // A popup still waiting for OK or Cancel always goes to the staff; a message already closed only if it's unknown.
  if (popup && (result.popupId || !(opts.acceptAnyPopup || opts.knownPopups?.includes(popup)))) {
    updateActivity(run, step, id, { state: 'paused', detail: `The site showed a message the tool doesn't know: "${popup}"` });
    const choice = await askAboutPopup(step, popup, label, !!result.popupId);
    if (result.popupId) await call(run, 'popup.answer', { id: result.popupId, accept: choice === 'continue' }).catch(() => undefined);
    guard(run);
    if (choice === 'stop') {
      updateActivity(run, step, id, { state: 'error', endedAt: Date.now(), detail: `Stopped at the message: "${popup}"` });
      throw new StopError(
        'Stopped at a message from the site',
        `The site said: "${popup}". The tool stopped here and pressed nothing more. Look at the site window: if it saved, press "It saved on the site". If not, press ${opts.againLabel} when you're ready.`,
        { confirmSaved: key },
      );
    }
    return checkWhetherSaved(result.popupId ? `You pressed OK on "${popup}".` : `The site said "${popup}".`);
  }

  markSaved(run, key);
  updateActivity(run, step, id, {
    state: 'done',
    endedAt: Date.now(),
    detail: popup ? `Popup "${popup}" → OK` : undefined,
  });
}

/* -------------------------------------------------------------- waiting on data */

/** Waits until the state matches, for example until the staff saved the LUC number. */
export function waitUntil(run: number, ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!alive(run)) return reject(new Cancelled());
    if (ready()) return resolve();
    const unsubscribe = app.subscribe(() => {
      if (!alive(run)) {
        unsubscribe();
        reject(new Cancelled());
      } else if (ready()) {
        unsubscribe();
        resolve();
      }
    });
  });
}

/* ------------------------------------------------------------------- flows */

/** Busy flags belong to one student, so a new student never waits on an old one. */
export const busyKeyFor = (run: number, key: RetryKey) => `${run}:${key}`;

/**
 * Runs one piece of work for a step. A second press while it runs does nothing,
 * and a problem stops only this step, with a message and a Try again button.
 */
/** The tool's stop when the site logged the staff out while a step's page was open (server/ops.ts). */
export const TAB_LOGGED_OUT = 'This tab was logged out';

interface FlowOptions {
  retryLabel?: string;
  working?: string;
  noRetryButton?: boolean;
  /** After a logout lost this step's page: the work that opens it again, and what the staff presses next. */
  reopen?: { key: RetryKey; label: string; then: string };
}

export async function flow(run: number, step: StepId, key: RetryKey, body: () => Promise<void>, opts: FlowOptions = {}): Promise<boolean> {
  const busyKey = busyKeyFor(run, key);
  if (app.get().busy[busyKey]) return false;
  setBusy(busyKey, true);
  setStep(run, step, { status: 'working', note: opts.working ?? 'Working', error: undefined });
  try {
    await body();
    return true;
  } catch (e) {
    if (e instanceof Cancelled) return false;
    const stop =
      e instanceof StopError
        ? e
        : new StopError('Something went wrong', e instanceof Error ? e.message : String(e));
    let message = stop.message;
    let extra = stop.extra;
    if (stop.title === TAB_LOGGED_OUT) {
      if (opts.reopen) {
        message += ` Press "${opts.reopen.label}", then ${opts.reopen.then}.`;
        extra = { ...extra, retry: opts.reopen.key, retryLabel: opts.reopen.label };
      } else {
        message += opts.noRetryButton
          ? ' Finish this part by hand in the site window. The other steps carry on.'
          : ' Press Try again. If it stops the same way, finish this part by hand in the site window.';
      }
    }
    setStep(run, step, {
      status: 'error',
      note: 'Stopped',
      error: {
        title: stop.title,
        message,
        retry: opts.noRetryButton ? undefined : key,
        retryLabel: opts.retryLabel ?? 'Try again',
        ...extra,
      },
    });
    return false;
  } finally {
    setBusy(busyKey, false);
  }
}
