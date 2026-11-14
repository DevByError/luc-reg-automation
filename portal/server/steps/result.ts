/**
 * Step 3, after Final Submit: Verify / Upload English Result.
 *
 * After Final Submit the Admission Form shows many sections, each a page of the site in its own frame. Receive 1 is at
 * the top and is never touched; the tool works only inside the section titled "Verify / Upload English Result",
 * wherever it is on the page. It types the Student ID (from step 4) and presses View, checks the row is this student,
 * picks the Test Name and fills the boxes the site shows for it, attaches the certificate last and reads everything
 * back. The staff presses Upload in the portal. The upload is done when the section is back to the empty Student ID
 * box and the site shows no problem; the tool doesn't search for the student again.
 *
 * If the Admission Form doesn't show the section (the page was lost to a logout, for example), the tool opens the same
 * page in its own tab, at the address it learned from the section the first time it saw it.
 */
import type { Frame, Page } from 'playwright-core';
import { datePattern, readDate, readDateLoose, writeDate } from '../../shared/dates';
import { RESULT_SECTION, UNCLEAR_ANSWER } from '../../shared/ops';
import type { ReadBack, ResultField, ResultFilled, ResultView, SaveResult } from '../../shared/ops';
import type { Lane, Scope } from '../browser';
import {
  answerHeld,
  assertLoggedIn,
  checkLogin,
  existingPage,
  expectDialogs,
  onLoginPage,
  openPage,
  pageOf,
  pathOf,
  safeHost,
  setLoginState,
  settle,
  settleOrTimeout,
  sleep,
  takeDialogs,
  withLane,
} from '../browser';
import { capture, captureOnce } from '../capture';
import { PAGES, SITE_HOST, WAIT } from '../config';
import { SiteChanged, SiteLoggedOut, SiteNetwork, SiteStop } from '../errors';
import { docPath } from '../files';
import {
  attachFile,
  cell,
  choices,
  ensureHelpers,
  fieldByKey,
  findButton,
  findField,
  findFieldIfAny,
  findTableIfAny,
  loc,
  pageHasText,
  pageMessages,
  press,
  selectText,
  tokens,
  typeDate,
  typeText,
  valueOf,
} from '../find';
import { log } from '../log';
import { samePassport, saveResult, stopOnUnknownDialogs } from './common';

const RESULT_TITLE = RESULT_SECTION;
const WHERE = RESULT_SECTION;
const ID_LABEL = 'Student ID';
const FILE_LABEL = 'English Result';
const TEST_LABEL = 'Test Name';
const UPLOAD = 'Upload';
/** The student's row after View: IC/Passport, Name, Programme, Country. */
const ROW_HEADINGS = ['IC/Passport', 'Name'];
/** Choices the Test Name list must have, so the tool knows it found the right list. */
const TEST_MUST = ['MOI', 'IELTS'];
/** The Test Name list's id on LOS (ContentPlaceHolder1_ddl1), read from the real page: found by it first, by its label only if it isn't there. */
const TEST_IDS = ['ddl1'];

/** Words that mean something did not work ("Upload failed", "Result already uploaded"). */
const PROBLEM = /\b(not|error|errors|fail|failed|failure|invalid|required|unable|cannot|missing|wrong|denied|already|too large|too big|exceeds?)\b|n't\b/i;
/** A popup that says the upload went through, never one that says it didn't. */
const UPLOAD_OK =
  /^(?![\s\S]*(\b(not|error|fail|failed|failure|invalid|unable|cannot|denied|wrong|already|exceeds?|too)\b|n't\b))[\s\S]*\b(success|successful|successfully|uploaded|saved|submitted)\b/i;

interface Section {
  scope: Scope;
  where: 'form' | 'tab';
  lane: Lane;
}

/** The tool's own tab with LOS's own page for it, as the tool opened it. Never a section of the Admission Form. */
async function locate(): Promise<Section | null> {
  const tab = existingPage('reupload');
  if (tab && (await within(5000, isSection(tab.mainFrame()), false))) return { scope: tab, where: 'tab', lane: 'reupload' };
  return null;
}

function within<T>(ms: number, p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), sleep(ms).then(() => fallback)]);
}

const present = async (p: Promise<string | null>) => !!(await p.catch(() => 'more than one'));

/** The page shows its own title with one of its own boxes: the Student ID box, the student's row or the Test Name list. */
async function isSection(f: Frame): Promise<boolean> {
  if (f.isDetached()) return false;
  if (!(await pageHasText(f, RESULT_TITLE))) return false;
  if (await present(findFieldIfAny(f, ID_LABEL, { where: WHERE, kinds: ['text'] }))) return true;
  if (await findTableIfAny(f, ROW_HEADINGS)) return true;
  return present(findFieldIfAny(f, TEST_LABEL, { where: WHERE, kinds: ['select'], ids: TEST_IDS }));
}

/**
 * The page "Verify / Upload English Result", in its own tab. After Final Submit the tool goes straight to the page's
 * own address (PAGES.englishResult): it never looks for the section on the Admission Form. With `open`, the page is
 * opened (or loaded again) first, so it shows the empty Student ID box; without it, the tab as it is now is used,
 * and opened only if it is gone.
 */
async function section(timeout: number, open: boolean): Promise<Section> {
  if (open || !existingPage('reupload')) {
    log('english result: opening its page in its own tab');
    const page = await openPage('reupload', PAGES.englishResult);
    await settleOrTimeout(page, 20_000).catch(() => undefined);
  }
  const end = Date.now() + timeout;
  for (;;) {
    const s = await locate();
    if (s) return s;
    const tab = existingPage('reupload');
    if (tab && (await onLoginPage(tab))) {
      if (!(await checkLogin(true))) throw new SiteLoggedOut();
    }
    if (Date.now() > end) break;
    await sleep(500);
  }
  const tab = existingPage('reupload');
  if (tab) await assertLoggedIn(tab);
  throw new SiteChanged(
    `Couldn't find "${RESULT_TITLE}"`,
    `The tool opened the "${RESULT_TITLE}" page of LOS in its own tab, but it doesn't show the Student ID box. Nothing was changed. Look at the site window.`,
  );
}

/** For the save check after Final Submit: the Admission Form no longer shows Final Submit (twice in a row), so it went through. */
export async function finalGone(page: Page): Promise<boolean> {
  const gone = async () => {
    if (await onLoginPage(page).catch(() => false)) return false;
    return !(await findButton(page, 'Final Submit', { where: 'Payment Plan', timeout: 0 }).then(() => true, () => false));
  };
  if (!(await gone())) return false;
  await sleep(1000);
  return gone();
}

/** The section's frame shows the login page, or no page: stops the way a logged-out tab does. */
async function assertIn(sec: Section) {
  const page = pageOf(sec.scope);
  await assertLoggedIn(page);
  if (sec.scope === page) return;
  const f = sec.scope as Frame;
  if (f.isDetached()) return;
  const url = f.url();
  if (url.startsWith('chrome-error://')) throw new SiteNetwork("Couldn't reach online.lincoln.edu.my");
  if (safeHost(url) !== SITE_HOST) return;
  const login =
    /login|signin|sign-in|logon/i.test(pathOf(url)) ||
    (await f
      .locator('input[type=password]')
      .evaluateAll((els) => els.some((e) => (e as HTMLElement).getClientRects().length > 0))
      .catch(() => false));
  if (login) {
    setLoginState('out');
    throw new SiteLoggedOut();
  }
}

/** Waits until the page, and the section's own frame, are quiet. */
async function settleIn(sec: Section, timeout = WAIT.settle) {
  const page = pageOf(sec.scope);
  // The section is one part of a big page. Only its own frame has to be quiet: the Admission Form's other sections
  // (Receive 1 and the rest) may keep loading for a long time, and waiting for them is what made step 3 hang.
  if (sec.scope === page) await settle(page, timeout);
  else if (!(sec.scope as Frame).isDetached()) await settle(sec.scope, timeout);
}


/* --------------------------------------------------------------- reading it */

const idBoxIfAny = (scope: Scope) => findFieldIfAny(scope, ID_LABEL, { where: WHERE, kinds: ['text'] });
/** The file box's real id on LOS is ContentPlaceHolder1_fileUpload (its label reads "English Result: *", which the label lookup missed). '*' = any file box, as a fallback. */
const FILE_IDS = ['fileUpload', '*'];
const fileBoxIfAny = (scope: Scope) => findFieldIfAny(scope, FILE_LABEL, { where: WHERE, kinds: ['file'], ids: FILE_IDS, hiddenFile: true });
const testBoxIfAny = (scope: Scope) => findFieldIfAny(scope, TEST_LABEL, { where: WHERE, kinds: ['select'], ids: TEST_IDS });
const fileBox = (scope: Scope, timeout = 5000) => findField(scope, FILE_LABEL, { where: WHERE, kinds: ['file'], ids: FILE_IDS, hiddenFile: true, timeout });
const testBox = (scope: Scope, timeout = 5000) => findField(scope, TEST_LABEL, { where: WHERE, kinds: ['select'], mustInclude: TEST_MUST, ids: TEST_IDS, timeout });

/**
 * 'student': a student's row (or the boxes for the upload) shows. 'empty': the Student ID box shows, empty.
 * 'filled': the Student ID box shows with something in it. 'none': neither (the section is loading, for example).
 */
async function stateOf(scope: Scope): Promise<'student' | 'empty' | 'filled' | 'none'> {
  if (await findTableIfAny(scope, ROW_HEADINGS)) return 'student';
  if (await present(testBoxIfAny(scope))) return 'student';
  if (await present(fileBoxIfAny(scope))) return 'student';
  const id = await idBoxIfAny(scope).catch(() => null);
  if (!id) return 'none';
  return (await valueOf(scope, id)).value.trim() ? 'filled' : 'empty';
}

/** The words the section shows in its messages and in boxes drawn over it (a SweetAlert box, a dialog, a toast). */
async function sayings(scope: Scope): Promise<string[]> {
  const msgs = await pageMessages(scope);
  const boxes = await scope
    .evaluate(() => {
      const shows = (el: Element) => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && el.getClientRects().length > 0;
      };
      const out = new Set<string>();
      document
        .querySelectorAll('[role=dialog],[role=alertdialog],[role=alert],[aria-modal=true],[class*="swal" i],[class*="sweet" i],[class*="modal" i],[class*="toast" i],[class*="notif" i]')
        .forEach((el) => {
          if (out.size >= 30 || !shows(el)) return;
          for (const l of ((el as HTMLElement).innerText || '').split('\n')) {
            const t = l.replace(/\s+/g, ' ').trim();
            if (t && t.length <= 300 && !/^(ok|okay|close|cancel|x|×)$/i.test(t)) out.add(t);
          }
        });
      return Array.from(out);
    })
    .catch(() => [] as string[]);
  const recorded = await scope
    .evaluate(() => (window as unknown as { __portal?: { saidWords: () => string[] } }).__portal?.saidWords() ?? [])
    .catch(() => [] as string[]);
  return Array.from(new Set([...msgs, ...boxes, ...recorded]));
}

/** Marks the section's page before a press, so the tool can tell afterwards whether the press loaded it again. */
async function markPage(scope: Scope) {
  await scope
    .evaluate(() => {
      (window as unknown as { __portalPressed?: boolean }).__portalPressed = true;
      (window as unknown as { __portal?: { saidWords: (reset: boolean) => string[] } }).__portal?.saidWords(true);
    })
    .catch(() => undefined);
}

/** The section's page was loaded again since markPage (the site posted back), so what it says now is all new. */
async function loadedAgain(scope: Scope): Promise<boolean> {
  return scope.evaluate(() => !(window as unknown as { __portalPressed?: boolean }).__portalPressed).catch(() => false);
}

/**
 * Words that are part of the section itself, such as a note beside the file box: what it showed once the student's
 * row (or the boxes for a Test Name) came up, before any Upload. They are never taken for an answer to Upload.
 */
let standing: string[] = [];
/** What the section showed just before Upload was pressed. */
/**
 * What the section says now that is an answer to the press: words that weren't there before it, or, when the site
 * loaded the page again, every word that isn't part of the section itself (so a refusal repeated word for word counts).
 */
async function answerWords(scope: Scope, before: string[]): Promise<string[]> {
  const words = await sayings(scope);
  const again = await loadedAgain(scope);
  return words.filter((t) => !standing.includes(t) && (again || !before.includes(t)));
}

interface RawBox {
  key: string;
  label: string;
  tag: string;
  type: string;
  value: string;
  options: string[];
  locked: boolean;
  maxLength: number;
  min: string;
  max: string;
  step: string;
  pattern: string;
  placeholder: string;
}

/** The boxes between the Test Name list and the Upload button: what the site asks for the chosen test. */
async function boxesAfter(scope: Scope, testMark: string, uploadMark: string | null): Promise<ResultField[]> {
  await ensureHelpers(scope);
  const raw = await scope.evaluate(
    ([t, u]) => {
      const P = (window as unknown as { __portal: { visible: (el: Element) => boolean; clean: (s: string) => string } }).__portal;
      const test = document.querySelector(`[data-portal="${t}"]`);
      const up = u ? document.querySelector(`[data-portal="${u}"]`) : null;
      if (!test) return null;
      const PH = /^(-+|select\b|-+\s*select|please select|choose\b|-+\s*choose)/i;
      const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const own = (el: Element) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      const tidy = (s: string) => s.replace(/[\s:*]+$/, '').trim();
      const all = Array.from(document.body.querySelectorAll('*'));
      // The words a person reads as the box's label: its <label>, or the nearest words before it, never before the Test Name list.
      const labelOf = (el: Element): string => {
        if (el.id) {
          const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (l && P.clean(l.textContent || '')) return tidy(P.clean(l.textContent || ''));
        }
        const wrap = el.closest('label');
        if (wrap && own(wrap)) return tidy(own(wrap));
        const i = all.indexOf(el);
        for (let k = i - 1; k >= 0 && i - k < 80; k -= 1) {
          const x = all[k];
          if (x === test) break;
          if (test.contains(x)) continue;
          if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION|SELECT|INPUT|TEXTAREA|BUTTON)$/.test(x.tagName)) continue;
          const words = own(x);
          if (!words || words.length > 80) continue;
          if (!x.contains(el) && !P.visible(x)) continue;
          return tidy(words);
        }
        return tidy(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '');
      };
      const out: RawBox[] = [];
      document.querySelectorAll('input,select,textarea').forEach((el) => {
        if (el === test) return;
        const input = el as HTMLInputElement;
        const type = el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLTextAreaElement ? 'textarea' : (input.type || 'text').toLowerCase();
        if (['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type)) return;
        if (!P.visible(el) || !follows(test, el) || (up && !follows(el, up))) return;
        let value = '';
        let options: string[] = [];
        if (el instanceof HTMLSelectElement) {
          options = Array.from(el.options)
            .map((o) => P.clean(o.text))
            .filter((x) => x && !PH.test(x));
          const o = el.options[el.selectedIndex];
          value = o && !PH.test(P.clean(o.text)) ? P.clean(o.text) : '';
        } else if (type === 'checkbox' || type === 'radio') {
          value = input.checked ? 'checked' : '';
        } else {
          value = (input.value || '').trim();
        }
        out.push({
          key: el.id || el.getAttribute('name') || '',
          label: labelOf(el),
          tag: el.tagName.toLowerCase(),
          type,
          value,
          options,
          locked: input.readOnly === true || input.disabled === true,
          maxLength: typeof input.maxLength === 'number' ? input.maxLength : -1,
          min: el instanceof HTMLInputElement ? input.min : '',
          max: el instanceof HTMLInputElement ? input.max : '',
          step: el instanceof HTMLInputElement ? input.step : '',
          pattern: el instanceof HTMLInputElement ? input.pattern : '',
          placeholder: el instanceof HTMLSelectElement ? '' : input.placeholder || '',
        });
      });
      return out;
    },
    [testMark, uploadMark] as const,
  );
  if (!raw) throw new SiteStop('The page changed', 'The Test Name list disappeared while the tool was reading the section. Nothing more was changed.');
  // Two boxes with the same words get a number, so each has its own name in the portal and in the read-back.
  const seen = new Map<string, number>();
  return raw.map((b, i): ResultField => {
    const base = b.label || `Box ${i + 1} after Test Name`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const label = n > 1 ? `${base} (${n})` : base;
    const isDate = b.type === 'date' || (b.type === 'text' && (/\bdate\b/i.test(b.label) || !!datePattern(b.placeholder)));
    const kind: ResultField['kind'] = !b.key
      ? 'other'
      : b.type === 'select'
        ? 'select'
        : isDate
          ? 'date'
          : b.type === 'number'
            ? 'number'
            : ['text', 'textarea', 'tel', 'search', ''].includes(b.type)
              ? 'text'
              : 'other';
    const format = kind === 'date' ? (b.type === 'date' ? 'iso' : (datePattern(b.placeholder) ?? 'dd/mm/yyyy')) : undefined;
    // A date the site shows in another way (its calendar may write 1-Nov-2026) is still read as a date.
    const value = format ? (b.value ? (readDate(b.value, format) ?? readDateLoose(b.value) ?? b.value) : '') : b.value;
    return {
      key: b.key || `#${i + 1}`,
      label,
      kind,
      ...(format ? { format } : {}),
      value,
      ...(kind === 'select' ? { options: b.options } : {}),
      ...(b.locked ? { locked: true } : {}),
      ...(b.maxLength > 0 ? { maxLength: b.maxLength } : {}),
      ...(b.min ? { min: b.min } : {}),
      ...(b.max ? { max: b.max } : {}),
      ...(b.step ? { step: b.step } : {}),
      ...(b.pattern ? { pattern: b.pattern } : {}),
      ...(b.placeholder ? { placeholder: b.placeholder } : {}),
    };
  });
}

/** The IC/Passport of the row is this student's passport. */
const isPassport = (shown: string, passport: string) => samePassport(shown, passport) || tokens(shown).includes(passport.replace(/[^A-Za-z0-9]/g, '').toUpperCase());

async function readView(sec: Section, passport: string, said: string[] = [], waitList = false): Promise<ResultView> {
  const { scope } = sec;
  const state = await stateOf(scope);
  if (state === 'none') {
    throw new SiteChanged(
      `"${RESULT_TITLE}" shows no boxes`,
      `The "${RESULT_TITLE}" section shows neither the Student ID box nor a student. Nothing was changed. Look at the site window.`,
    );
  }
  const view: ResultView = {
    where: sec.where,
    state: state === 'student' ? 'student' : 'empty',
    headers: [],
    rows: [],
    samePassport: false,
    testNames: [],
    testName: '',
    fields: [],
    said,
  };
  if (view.state === 'empty') return view;
  const table = await findTableIfAny(scope, ROW_HEADINGS);
  if (table) {
    view.headers = table.headers;
    view.rows = table.rows.map((r) => r.cells).filter((cells) => cells.some((c) => c.trim() !== ''));
    const rows = table.rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
    view.samePassport = rows.length === 1 && isPassport(cell(table, rows[0], 'IC/Passport'), passport);
  }
  // Right after View, the student's row can show a moment before the Test Name list is drawn and filled: it gets time to.
  let test = await testBoxIfAny(scope).catch(() => null);
  if (waitList) {
    const end = Date.now() + 15_000;
    while (Date.now() < end && (!test || (await choices(scope, test).catch(() => [] as string[])).length === 0)) {
      await sleep(400);
      test = await testBoxIfAny(scope).catch(() => null);
    }
  }
  if (test) {
    view.testNames = await choices(scope, test);
    const v = await valueOf(scope, test);
    view.testName = view.testNames.includes(v.value) ? v.value : '';
    const file = await fileBoxIfAny(scope).catch(() => null);
    const up = await findButton(scope, UPLOAD, { where: WHERE, near: file ?? test, timeout: 0 }).catch(() => null);
    view.fields = await boxesAfter(scope, test, up);
  }
  return view;
}

/** The section shows this student's row: one row, with this passport. Otherwise nothing is filled or pressed. */
function needStudent(v: ResultView, passport: string) {
  if (v.state !== 'student' || v.rows.length === 0) {
    throw new SiteStop(
      "The student isn't showing",
      `"${RESULT_TITLE}" doesn't show the student's row any more. Nothing was uploaded. Press View in the portal again.`,
    );
  }
  if (v.rows.length > 1) {
    throw new SiteStop('More than one row', `"${RESULT_TITLE}" shows ${v.rows.length} rows, so the tool stopped rather than guess. Nothing was uploaded.`);
  }
  if (!v.samePassport) {
    throw new SiteStop(
      'Another student',
      `The row on "${RESULT_TITLE}" doesn't have the passport ${passport}, so this Student ID is another student's. Nothing was uploaded. Check the Student ID, then press View again.`,
    );
  }
}

/* -------------------------------------------------------------------- the ops */

/** A popup's words, for the staff. A question still waiting is answered Cancel. */
async function popupWords(lane: Lane): Promise<string[]> {
  const seen = takeDialogs(lane).filter((d) => !d.known);
  for (const d of seen) if (d.heldId) await answerHeld(d.heldId, false);
  return seen.map((d) => d.text);
}

/**
 * Runs one of these actions in the Admission Form's lane (the section is part of that page). The section's layout is
 * saved in the site-check folder the first time each action runs, and whenever one stops, so the page can be fixed.
 */
export function guarded<A, R>(op: string, fn: (a: A) => Promise<R>): (a: A) => Promise<R> {
  return (a) =>
    withLane('step2', async () => {
      try {
        const result = await fn(a);
        const sec = await locate().catch(() => null);
        if (sec) await captureOnce(sec.lane, sec.scope, op);
        return result;
      } catch (e) {
        if (e instanceof SiteStop) {
          const sec = await locate().catch(() => null);
          const scope = sec?.scope ?? existingPage('reupload');
          if (scope) await capture(sec?.lane ?? 'reupload', scope, `${op} stopped`);
        }
        throw e;
      }
    });
}

/** After Final Submit: the section, as it shows now. */
export async function find({ passport }: { passport: string }): Promise<ResultView> {
  const sec = await section(25_000, true);
  await assertIn(sec);
  return readView(sec, passport);
}

/** Opens the section again (as it first loads), so it shows the empty Student ID box. Nothing is pressed. */
async function reopen(sec: Section): Promise<Section> {
  const url = sec.scope.url();
  if (safeHost(url) !== SITE_HOST) throw new SiteStop('The section shows another site', `"${RESULT_TITLE}" doesn't show a page of the site. Nothing was changed.`);
  try {
    await sec.scope.goto(url, { waitUntil: 'load', timeout: WAIT.page });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (/Timeout|net::ERR_/i.test(text)) throw new SiteNetwork("Couldn't reach online.lincoln.edu.my");
    throw e;
  }
  await settleIn(sec);
  await assertIn(sec);
  const again = await section(15_000, false);
  if ((await stateOf(again.scope)) === 'student') {
    throw new SiteStop('The section still shows a student', `"${RESULT_TITLE}" still shows a student after it was opened again. Nothing was changed. Look at the site window.`);
  }
  return again;
}

/** Every file box the section has, in words (for the log when the tool can't find the English Result box). */
async function fileBoxesNow(scope: Scope): Promise<string> {
  return scope
    .evaluate(() =>
      Array.from(document.querySelectorAll('input[type=file]'))
        .map((el) => {
          const i = el as HTMLInputElement;
          const r = i.getBoundingClientRect();
          return `id="${i.id}" disabled=${i.disabled} size=${Math.round(r.width)}x${Math.round(r.height)} files=${i.files?.length ?? 0}`;
        })
        .join('; ') || 'no file box on the page',
    )
    .catch(() => 'could not read the page');
}

/**
 * Puts the certificate on the site's English Result box, so the staff can see on LOS that it is there while they pick the
 * Test Name and fill the rest. Best effort: if the box isn't there yet, nothing is stopped (Upload attaches it again).
 * A reload by LOS may empty the box; fill() attaches it again last.
 */
async function attachEarly(sec: Section, passport: string, fileName: string | undefined) {
  if (!fileName) return;
  try {
    const { scope } = sec;
    const file = await fileBox(scope, 10_000);
    if ((await valueOf(scope, file)).value !== fileName) {
      await attachFile(scope, file, docPath(passport, fileName));
      await settleIn(sec);
    }
    const now = await section(10_000, false);
    const shown = (await valueOf(now.scope, await fileBox(now.scope, 5000))).value;
    log(`english result: certificate attached on LOS early (box shows "${shown}")`);
  } catch (e) {
    const scope = (await locate().catch(() => null))?.scope ?? sec.scope;
    log(`english result: could not attach the certificate early (${e instanceof Error ? e.message : String(e)}); file boxes: ${await fileBoxesNow(scope)}`);
  }
}

/** Student ID → View. Returns the student's row and the boxes for the upload. With fileName, the certificate is attached on LOS right after. */
export async function view({ passport, studentId, fileName }: { passport: string; studentId: string; fileName?: string }): Promise<ResultView> {
  const id = studentId.trim();
  let sec = await section(25_000, true);
  await assertIn(sec);
  if ((await stateOf(sec.scope)) === 'student') sec = await reopen(sec);
  const { scope, lane } = sec;
  const box = await findField(scope, ID_LABEL, { where: WHERE, kinds: ['text'], timeout: 15_000 });
  await typeText(scope, box, id, ID_LABEL);
  const shown = (await valueOf(scope, box)).value.trim();
  if (shown !== id) {
    throw new SiteStop('The Student ID box shows something else', `The Student ID box shows "${shown}", not ${id}. Nothing was pressed.`, [
      { field: 'Student ID', expected: id, actual: shown || '(empty)' },
    ]);
  }
  const button = await findButton(scope, 'View', { where: WHERE, near: box });
  const before = await sayings(scope);
  await markPage(scope);
  expectDialogs(lane, []);
  await press(scope, button, 'View');
  await settleIn(sec, WAIT.save);
  await assertIn(sec);
  // A popup after View: its words, for the staff (a question is answered Cancel).
  const said = await popupWords(lane);
  const end = Date.now() + 20_000;
  for (;;) {
    const now = await section(10_000, false);
    // After the site loaded the page again, a message it repeats ("No record found" twice) is still its answer.
    const again = await loadedAgain(now.scope);
    const words = [...said, ...(await sayings(now.scope)).filter((t) => again || !before.includes(t))];
    if ((await stateOf(now.scope)) === 'student') {
      const v = await readView(now, passport, words, true);
      standing = await sayings(now.scope);
      // The right student shows: the certificate goes on LOS now, so the staff can see it there.
      if (v.samePassport && v.rows.length === 1) await attachEarly(now, passport, fileName);
      return v;
    }
    if (words.length) {
      throw new SiteStop('The site showed a message', `After View with Student ID ${id}, the site said: "${words.join('" / "')}". Check the Student ID, then press View again.`);
    }
    if (Date.now() > end) {
      throw new SiteStop('No student after View', `After View with Student ID ${id}, the site showed no student and no message. Check the Student ID, then press View again.`);
    }
    await sleep(500);
  }
}

/**
 * After a Test Name is picked, LOS draws (or hides) the Test Score and Result Date boxes for it. Nothing is filled until the
 * Test Name shows as picked and the boxes have stayed the same for two reads in a row (MOI: no boxes), so the tool never
 * types into the old test's boxes, and LOS never gets a score or date it doesn't expect.
 */
async function settledView(passport: string, testName: string): Promise<ResultView> {
  const end = Date.now() + 12_000;
  let last = '';
  for (;;) {
    const now = await section(15_000, false);
    const v = await readView(now, passport);
    needStudent(v, passport);
    const sig = `${v.testName}|${v.fields.map((f) => `${f.key}:${f.locked ? 'l' : 'o'}`).join(',')}`;
    if (v.testName === testName && sig === last) return v;
    last = sig;
    if (Date.now() > end) return v;
    await sleep(700);
  }
}

/** Picks the Test Name on the site, then returns the boxes the site shows for it. */
export async function test({ passport, testName, fileName }: { passport: string; testName: string; fileName?: string }): Promise<ResultView> {
  const sec = await section(15_000, false);
  await assertIn(sec);
  needStudent(await readView(sec, passport), passport);
  expectDialogs(sec.lane, []);
  const picked = await selectText(sec.scope, await testBox(sec.scope), testName, TEST_LABEL, WHERE);
  if (picked) await settleIn(sec, WAIT.save);
  await assertIn(sec);
  await stopOnUnknownDialogs(sec.lane, WHERE, 'Nothing was uploaded.');
  const v = await settledView(passport, testName);
  const now = await section(15_000, false);
  if (picked) standing = Array.from(new Set([...standing, ...(await sayings(now.scope))]));
  if (v.testName !== testName) {
    throw new SiteStop('The Test Name shows something else', `The Test Name list shows "${v.testName || 'nothing'}", not ${testName}. Nothing was uploaded.`, [
      { field: 'Test Name', expected: testName, actual: v.testName || '(empty)' },
    ]);
  }
  // Picking the Test Name may make LOS reload the page and empty the file box: the certificate goes on again.
  await attachEarly(now, passport, fileName);
  return v;
}

/** A box found again by its id on the site. */
async function boxByKey(scope: Scope, f: ResultField): Promise<string> {
  const hit = await fieldByKey(scope, f.key);
  if (hit.marks.length !== 1) {
    throw new SiteChanged(`Couldn't find "${f.label}"`, `The tool couldn't find "${f.label}" on "${RESULT_TITLE}" any more. Nothing was uploaded.`);
  }
  return hit.marks[0];
}

/** The site's own check of a box (as the browser checks it when Upload is pressed): '' when it accepts it. */
async function siteCheck(scope: Scope, mark: string): Promise<string> {
  return loc(scope, mark)
    .evaluate((el) => {
      const box = el as HTMLInputElement;
      if (!box.validity || box.validity.valid) return '';
      return box.validationMessage || "The site doesn't accept this value.";
    })
    .catch(() => '');
}

/**
 * Picks the Test Name, fills its boxes with the staff's values (dates come as yyyy-mm-dd and go in the box's own way),
 * then attaches the certificate last, because a reload empties a file box. Everything is read back afterwards.
 */
export async function fill({
  passport,
  fileName,
  testName,
  values,
}: {
  passport: string;
  fileName: string;
  testName: string;
  values: { key: string; label: string; value: string }[];
}): Promise<ResultFilled> {
  const sec = await section(15_000, false);
  await assertIn(sec);
  const { scope, lane } = sec;
  needStudent(await readView(sec, passport), passport);
  expectDialogs(lane, []);
  const picked = await selectText(scope, await testBox(scope), testName, TEST_LABEL, WHERE);
  if (picked) await settleIn(sec, WAIT.save);
  await assertIn(sec);
  await stopOnUnknownDialogs(lane, WHERE, 'Nothing was uploaded.');
  // Step 1 is only the Test Name. The score, the date and the file go in after LOS has drawn the boxes for it, one at a time.
  const shown = await settledView(passport, testName);
  if (picked) standing = Array.from(new Set([...standing, ...(await sayings(scope))]));
  const open = shown.fields.filter((f) => !f.locked);
  const unknown = open.filter((f) => !values.some((v) => v.key === f.key));
  const gone = values.filter((v) => !open.some((f) => f.key === v.key));
  if (unknown.length || gone.length) {
    const what = [...unknown.map((f) => `"${f.label}"`)];
    throw new SiteStop(
      'The site shows other boxes',
      `For ${testName} the site now shows ${open.length ? open.map((f) => `"${f.label}"`).join(', ') : 'no boxes'}${what.length ? `, including ${what.join(', ')} that the portal didn't have` : ''}. Nothing was uploaded. The portal now shows what the site asks for: check it, then press Upload again.`,
    );
  }
  for (const f of open) {
    const want = values.find((v) => v.key === f.key)!.value;
    const mark = await boxByKey(scope, f);
    if (f.kind === 'select') {
      if (await selectText(scope, mark, want, f.label, WHERE)) await settleIn(sec, WAIT.save);
    } else if (f.kind === 'date') {
      await typeDate(scope, mark, writeDate(want, f.format ?? 'dd/mm/yyyy'), f.label);
      await settleIn(sec);
    } else if (f.kind === 'text' || f.kind === 'number') {
      await typeText(scope, mark, want, f.label);
      await settleIn(sec);
    } else {
      throw new SiteStop(`The portal can't fill "${f.label}"`, `"${f.label}" on "${RESULT_TITLE}" is a kind of box the portal doesn't fill. Nothing was uploaded. Look at the site window.`);
    }
  }
  const file = await fileBox(scope, 15_000).catch(async (e) => {
    log(`english result: English Result box not found when filling; file boxes: ${await fileBoxesNow(scope)}`);
    throw e;
  });
  if ((await valueOf(scope, file)).value !== fileName) {
    await attachFile(scope, file, docPath(passport, fileName));
    await settleIn(sec);
  }
  await assertIn(sec);
  await stopOnUnknownDialogs(lane, WHERE, 'Nothing was uploaded.');
  // Everything as the site shows it now.
  const back: ReadBack = [];
  const invalid: ResultFilled['invalid'] = [];
  const now = await section(10_000, false);
  const v = await readView(now, passport);
  needStudent(v, passport);
  back.push(['English Result', (await valueOf(now.scope, await fileBox(now.scope))).value]);
  back.push(['Test Name', v.testName]);
  for (const f of v.fields) {
    back.push([f.label, f.value]);
    if (f.locked) continue;
    const message = await siteCheck(now.scope, await boxByKey(now.scope, f));
    if (message) invalid.push({ label: f.label, message });
  }
  return { back, invalid };
}

let beforeUpload: string[] = [];

/**
 * Upload, pressed by the staff after the read-back matched. A popup that says it worked is answered OK; any other
 * popup goes to the staff. Done when the section is back to the empty Student ID box with no problem shown.
 */
export async function upload({ passport, fileName }: { passport: string; fileName: string }): Promise<SaveResult> {
  const sec = await section(15_000, false);
  await assertIn(sec);
  const { scope, lane } = sec;
  needStudent(await readView(sec, passport), passport);
  const file = await fileBox(scope);
  if ((await valueOf(scope, file)).value !== fileName) {
    throw new SiteStop(
      'The certificate is not attached',
      `The English Result box doesn't show "${fileName}" any more. Nothing was uploaded. Press Upload again: the tool attaches it first.`,
    );
  }
  const button = await findButton(scope, UPLOAD, { where: WHERE, near: file });
  beforeUpload = await sayings(scope);
  await markPage(scope);
  expectDialogs(lane, [{ match: UPLOAD_OK, accept: true }]);
  await press(scope, button, UPLOAD, { allow: /^\s*upload\s*$/i });
  await settleIn(sec, WAIT.save);
  await assertIn(sec);
  const result = saveResult(lane);
  if (result.popup) return result;
  const end = Date.now() + 15_000;
  let last: 'student' | 'empty' | 'filled' | 'none' | 'gone' = 'gone';
  for (;;) {
    const now = await locate();
    if (now) {
      const bad = (await answerWords(now.scope, beforeUpload)).filter((t) => PROBLEM.test(t));
      if (bad.length) {
        // "Result already uploaded": the staff may know it is there (from another computer, for example).
        const already = bad.some((t) => /\balready\b/i.test(t));
        throw new SiteStop(
          "The site didn't take the upload",
          `After Upload the site said: "${bad.join('" / "')}". ${already ? `If LOS already has this student's English result, press "It saved on the site". If not, check` : 'Check'} the certificate and the boxes in the portal, then press Upload again.`,
        );
      }
      last = await stateOf(now.scope);
      if (last === 'empty') {
        log('english result: back to the empty Student ID box');
        return {};
      }
    }
    if (Date.now() > end) break;
    await sleep(500);
  }
  throw new SiteStop(
    UNCLEAR_ANSWER,
    `After Upload, "${RESULT_TITLE}" ${last === 'student' ? 'still shows the student' : last === 'gone' ? "isn't on the page any more" : "doesn't show the empty Student ID box"}, and the site gave no clear answer. Look at the site window. If the upload went through, press "It saved on the site". If not, press Upload again.`,
  );
}

/**
 * For the save check after a lost answer: back to the empty Student ID box with no problem shown means the upload
 * went through. Anything else, the tool can't tell, so the staff looks.
 */
export async function uploadSaved(): Promise<boolean | 'unknown'> {
  // The site may still be busy with the upload (after a question the staff answered OK, for example): it gets a little time.
  const end = Date.now() + 15_000;
  for (;;) {
    const sec = await locate().catch(() => null);
    if (sec) {
      if ((await answerWords(sec.scope, beforeUpload)).some((t) => PROBLEM.test(t))) return 'unknown';
      if ((await stateOf(sec.scope)) === 'empty') return true;
    }
    if (Date.now() > end) return 'unknown';
    await sleep(700);
  }
}

/** For the save check after Final Submit: the Admission Form doesn't show Final Submit any more, so it went through. */
export async function finalSubmitted(): Promise<boolean | 'unknown'> {
  const end = Date.now() + 15_000;
  for (;;) {
    const form = existingPage('step2');
    if (!form) return 'unknown';
    if (await finalGone(form)) return true;
    if (Date.now() > end) return 'unknown';
    await sleep(700);
  }
}

/** Watch mode: the Upload button and where it is. */
export async function uploadButton(): Promise<{ scope: Scope; mark: string } | null> {
  const sec = await locate().catch(() => null);
  if (!sec) return null;
  const file = await fileBoxIfAny(sec.scope).catch(() => null);
  const mark = await findButton(sec.scope, UPLOAD, { where: WHERE, near: file ?? undefined, timeout: 0 }).catch(() => null);
  return mark ? { scope: sec.scope, mark } : null;
}
