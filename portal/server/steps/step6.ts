/**
 * Step 6: Admission Assistance. The tool finds the student and checks the card, writes the passport
 * in Visa Number, attaches the staff's stamp scan and fills the dates. The staff presses Submit Visa Information.
 */
import type { Page } from 'playwright-core';
import { NO_UPLOAD_SIGN, UNCLEAR_ANSWER } from '../../shared/ops';
import type { Card, SaveResult } from '../../shared/ops';
import { assertLoggedIn, existingPage, expectDialogs, openPage, settle, sleep, takeDialogs } from '../browser';
import { PAGES, WAIT } from '../config';
import { SiteStop } from '../errors';
import { docPath } from '../files';
import {
  attachFile,
  canon,
  ensureHelpers,
  findButton,
  findField,
  loc,
  pageHasText,
  pageMessages,
  press,
  textAfter,
  textAfterIfAny,
  typeDate,
  typeText,
  valueOf,
} from '../find';
import { WHERE, dmyToIso, isoToDmy, needPage, samePassport, stopOnUnknownDialogs } from './common';

const FIND_LABEL = 'Find the student';
const FOUND_TEXT = 'Fill in the visa information';
const ISSUE = 'Visa Issue Date';
const EXPIRY = 'Visa Expiry Date';
const STAMP = 'Upload Visa Page';
const SUBMIT = 'Submit Visa Information';
const NOT_FOUND = /not found|no student|no record|no data|invalid/i;

/**
 * The "Find the student" box and the Search button inside it. The site's top bar has a Search button too,
 * on every page; the tool only ever presses the one that belongs with this box.
 */
async function searchBox(page: Page, timeout = 0): Promise<{ box: string; button: string }> {
  const box = await findField(page, FIND_LABEL, { where: WHERE.assist, kinds: ['text'], ids: ['txtSearch'], timeout });
  const button = await findButton(page, 'Search', { where: WHERE.assist, near: box, timeout: 5000 });
  return { box, button };
}

export async function open(): Promise<true> {
  const page = await openPage('step6', PAGES.admissionAssistance);
  await searchBox(page, 20_000);
  return true;
}

/**
 * Name and program have no labels on the card: they are its first two lines, before Admission ID.
 * The card is the smallest part of the page around Admission ID that also has Nationality and those lines.
 */
async function cardTitle(page: Page): Promise<{ name: string; program: string }> {
  await ensureHelpers(page);
  return page.evaluate(() => {
    const P = (window as unknown as { __portal: { canon: (s: string) => string; visible: (e: Element) => boolean } }).__portal;
    const own = (el: Element) => Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
    const label = Array.from(document.querySelectorAll('*')).find((el) => P.visible(el) && P.canon(own(el)).startsWith('admissionid'));
    if (!label) return { name: '', program: '' };
    for (let card = label.parentElement, n = 0; card && n < 8; card = card.parentElement, n += 1) {
      const text = card.textContent || '';
      if (/find the student|visa information/i.test(text)) break; // past the card
      if (!/nationality/i.test(text)) continue;
      const lines: string[] = [];
      for (const el of Array.from(card.querySelectorAll('*'))) {
        if (el === label || label.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) break;
        if (el.contains(label)) continue;
        const t = own(el);
        // The round picture with the student's initials ("KP") is not a line of the card.
        if (t && t.replace(/\s/g, '').length > 3 && P.visible(el) && !/student found|fill in the visa/i.test(t) && !/:\s*$/.test(t)) lines.push(t);
      }
      if (lines.length >= 2) return { name: lines[0], program: lines[1] };
    }
    return { name: '', program: '' };
  });
}

/** Passport → Search, then the student card. Always from a fresh page, so trying again is safe. */
export async function find({ passport }: { passport: string }): Promise<Card> {
  const page = await openPage('step6', PAGES.admissionAssistance);
  const { box, button } = await searchBox(page, 20_000);
  await typeText(page, box, passport, FIND_LABEL);
  if (!samePassport((await valueOf(page, box)).value, passport)) {
    throw new SiteStop('The search box shows something else', 'The "Find the student" box did not keep the passport. Nothing was changed.');
  }
  expectDialogs('step6', []);
  await press(page, button, 'Search');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  await stopOnUnknownDialogs('step6', WHERE.assist, 'Check the passport number.');
  // Wait for "Student found", or stop as soon as the page says it found no one.
  const end = Date.now() + 30_000;
  for (;;) {
    if (await pageHasText(page, FOUND_TEXT)) break;
    const msgs = await pageMessages(page);
    const none = msgs.filter((m) => NOT_FOUND.test(m));
    if (none.length || Date.now() > end) {
      throw new SiteStop(
        'Student not found on Admission Assistance',
        `After Search, the page didn't say "Student found. Fill in the visa information below."${(none.length ? none : msgs).length ? ` It says: "${(none.length ? none : msgs).join('" / "')}".` : ''} Check the passport number.`,
      );
    }
    await sleep(500);
  }
  const passportNo = await textAfter(page, 'Passport No', WHERE.assist);
  const admissionId = await textAfter(page, 'Admission ID', WHERE.assist);
  const nationality = (await textAfterIfAny(page, 'Nationality', WHERE.assist)) ?? '';
  const named = (await textAfterIfAny(page, 'Name', WHERE.assist)) ?? (await textAfterIfAny(page, 'Student Name', WHERE.assist));
  const prog = (await textAfterIfAny(page, 'Program', WHERE.assist)) ?? (await textAfterIfAny(page, 'Programme', WHERE.assist));
  const title = named && prog ? { name: named, program: prog } : await cardTitle(page);
  const card: Card = { name: named ?? title.name, program: prog ?? title.program, admissionId, passportNo, nationality };
  if (!samePassport(passportNo, passport)) {
    throw new SiteStop('Passport No on the card is different', `The card on Admission Assistance shows ${passportNo}, not ${passport}. The tool stopped.`, [
      { field: 'Passport No', expected: passport, actual: passportNo },
    ]);
  }
  return card;
}

/** The card still shows this student, so nothing goes on another student's record. */
async function requireCard(page: Page, passport: string) {
  const shown = await textAfterIfAny(page, 'Passport No', WHERE.assist);
  if (!shown || !samePassport(shown, passport)) {
    throw new SiteStop('The student card changed', `Admission Assistance no longer shows ${passport} on the card. Press Try again on step 6 to find the student again. Nothing was changed.`);
  }
}

/** The passport goes in Visa Number, as agreed. */
export async function visaNumber({ passport }: { passport: string }): Promise<string> {
  const page = needPage('step6', WHERE.assist);
  await requireCard(page, passport);
  const box = await findField(page, 'Visa Number', { where: WHERE.assist, kinds: ['text'], timeout: 15_000 });
  await typeText(page, box, passport, 'Visa Number');
  await settle(page);
  const now = (await valueOf(page, box)).value.trim();
  if (now !== passport) {
    throw new SiteStop('Visa Number shows something else', `Visa Number shows "${now}", not ${passport}. Nothing was submitted.`, [
      { field: 'Visa Number', expected: passport, actual: now || '(empty)' },
    ]);
  }
  return now;
}

/** The site's file box for the scan, seen on the real page. */
const STAMP_IDS = ['fuVisa'];

/** Words that mean something did not work. */
const PROBLEM = /\b(not|error|errors|fail|failed|failure|invalid|required|unable|cannot|missing|wrong|denied|too large|too big|exceeds?)\b|n't\b/i;

/** The site's own words for a finished upload, never ones that say it didn't work ("not uploaded"). */
const UPLOAD_OK = new RegExp(
  String.raw`^(?![\s\S]*(\b(not|error|fail|failed|failure|invalid|unable|cannot|denied|wrong|too)\b|n't\b))` +
    String.raw`[\s\S]*\b(uploaded|upload(ed)? (was |is )?(successful|successfully|done|complete|completed)|successfully uploaded)\b`,
  'i',
);

/** Words that show the site is still uploading ("100%" is done). */
const UPLOADING = /\b(uploading|please wait|processing|loading)\b|(^|[^\d])\d{1,2}\s?%/i;

/** Words in the upload area that mean the site refused the file ("do not close this page" is not one). */
const UPLOAD_PROBLEM =
  /\b(error|errors|fail|failed|failure|invalid|unable|cannot|denied|wrong|rejected|unsupported|too large|too big|exceeds?|not allowed|not supported|not accepted|not uploaded)\b/i;

/**
 * The scan's file box. The site hides it behind its own "Click to choose a file" area, so a hidden one counts;
 * the tool sets the file on it, as choosing the file in that area does.
 */
async function stampBox(page: Page, timeout = 0) {
  return findField(page, STAMP, { where: WHERE.assist, kinds: ['file'], prefix: true, ids: STAMP_IDS, hiddenFile: true, timeout });
}

/** The lines the site's upload area shows (the part of the page that holds its file box). */
async function uploadArea(page: Page, box: string): Promise<string[]> {
  return loc(page, box)
    .evaluate((input) => {
      const shows = (el: Element) => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && el.getClientRects().length > 0;
      };
      for (let el = input.parentElement, n = 0; el && n < 4; el = el.parentElement, n += 1) {
        if (!shows(el)) continue;
        const lines = (el as HTMLElement).innerText
          .split('\n')
          .map((t) => t.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        if (lines.length) return lines.slice(0, 40);
      }
      return [] as string[];
    })
    .catch(() => [] as string[]);
}

/**
 * From now on, counts every change the site makes to the words in its upload area. A file chosen again under
 * the same name may end with the same words as before; the change in between shows the site took it.
 */
async function watchArea(page: Page, box: string): Promise<void> {
  await loc(page, box)
    .evaluate((input) => {
      const w = window as unknown as { __portalArea?: { changes: number; obs?: MutationObserver } };
      w.__portalArea?.obs?.disconnect();
      const state: { changes: number; obs?: MutationObserver } = { changes: 0 };
      let area: HTMLElement | null = null;
      let el: HTMLElement | null = input.parentElement;
      for (let n = 0; el && n < 4 && !area; n += 1) {
        const st = getComputedStyle(el);
        const shows = st.display !== 'none' && st.visibility !== 'hidden' && el.getClientRects().length > 0;
        if (shows && el.innerText.trim()) area = el;
        else el = el.parentElement;
      }
      if (area) {
        const obs = new MutationObserver(() => {
          state.changes += 1;
        });
        obs.observe(area, { subtree: true, childList: true, characterData: true });
        state.obs = obs;
      }
      w.__portalArea = state;
    })
    .catch(() => undefined);
}

async function areaChanged(page: Page): Promise<boolean> {
  return page.evaluate(() => ((window as unknown as { __portalArea?: { changes: number } }).__portalArea?.changes ?? 0) > 0).catch(() => false);
}

/** Messages the site shows anywhere on the page: its message boxes, and small pop-up notes. */
async function notices(page: Page): Promise<string[]> {
  const popupNotes = await page
    .evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('[role=alert],[class*="toast" i],[class*="swal" i],[class*="notif" i],[class*="snackbar" i]').forEach((el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || el.getClientRects().length === 0) return;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 200 && !out.includes(t)) out.push(t);
      });
      return out.slice(0, 6);
    })
    .catch(() => [] as string[]);
  return [...(await pageMessages(page)), ...popupNotes];
}

/**
 * Attaches the staff's scan. The site uploads it in the background as soon as it is chosen; the tool waits for
 * that to finish, then reads what the upload area says. It is done only when the site says so: its popup, or
 * the file name or "uploaded" showing where it didn't before. Anything that says it didn't work stops the tool.
 */
export async function stamp({ passport, fileName }: { passport: string; fileName: string }): Promise<true> {
  const page = needPage('step6', WHERE.assist);
  await requireCard(page, passport);
  const box = await stampBox(page, 15_000);
  const areaBefore = await uploadArea(page, box);
  const noticesBefore = await notices(page);
  const nameBefore = await pageHasText(page, fileName);
  await watchArea(page, box);
  // The browser only tells the site about a file that differs from the one already in the box, so the box is
  // emptied first (quietly, as the site's own "Replace" would): the same scan chosen again still goes up.
  await loc(page, box)
    .evaluate((el) => {
      (el as HTMLInputElement).value = '';
    })
    .catch(() => undefined);
  expectDialogs('step6', [{ match: UPLOAD_OK, accept: true }]);
  await attachFile(page, box, docPath(passport, fileName));
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const popups = await stopOnUnknownDialogs('step6', WHERE.assist, 'The scan may not have gone up. Choose the file again.');
  if (popups.some((d) => UPLOAD_OK.test(d.text))) return true;

  const name = canon(fileName);
  const started = Date.now();
  for (;;) {
    // The box may be drawn again after the upload: find it again if it is gone.
    const mark = (await loc(page, box).count()) ? box : await stampBox(page).catch(() => box);
    const now = await uploadArea(page, mark);
    // Once the site has changed the area, all of it is its answer; otherwise only the words that are new.
    const area = (await areaChanged(page)) ? now : now.filter((t) => !areaBefore.includes(t));
    const said = (await notices(page)).filter((t) => !noticesBefore.includes(t));
    const bad = [...area, ...said].filter((t) => UPLOAD_PROBLEM.test(t));
    if (bad.length) {
      throw new SiteStop(
        "The site didn't take the scan",
        `After the file was chosen, the site said: "${bad.join('" / "')}". Nothing was submitted. Check the file, then choose it again.`,
      );
    }
    const still = area.some((t) => UPLOADING.test(t));
    if (!still) {
      if ([...area, ...said].some((t) => UPLOAD_OK.test(t))) return true;
      if (area.some((t) => canon(t).includes(name)) || (!nameBefore && (await pageHasText(page, fileName)))) return true;
    }
    // A site that is still uploading gets half a minute more; one that shows nothing new, a few seconds.
    if (Date.now() - started > (still ? 30_000 : 8_000)) {
      if (still) {
        throw new SiteStop('The upload is taking too long', `After 30 seconds the site still shows "${area.join(' · ')}". Look at the site window, then choose the file again if it stopped.`);
      }
      const fresh = now.filter((t) => !areaBefore.includes(t));
      const shows = fresh.length ? ` The upload area now shows: "${fresh.join(' · ')}".` : ' The upload area shows nothing new.';
      throw new SiteStop(
        NO_UPLOAD_SIGN,
        `The site didn't say whether it took "${fileName}".${shows} Look at the site window: if it shows the scan, press "The site shows the scan". If not, choose the file again.`,
      );
    }
    await sleep(500);
  }
}

async function dateBox(page: Page, label: string) {
  return findField(page, label, { where: WHERE.assist, kinds: ['text', 'date'], timeout: 0 });
}

/** Dates come as dd/mm/yyyy. A calendar box (yyyy-mm-dd inside) gets the same date in its own format. */
export async function fillDates({ passport, issue, expiry }: { passport: string; issue: string; expiry: string }): Promise<true> {
  const page = needPage('step6', WHERE.assist);
  await requireCard(page, passport);
  for (const [label, dmy] of [
    [ISSUE, issue],
    [EXPIRY, expiry],
  ] as const) {
    const box = await dateBox(page, label);
    const kind = (await valueOf(page, box)).kind;
    await typeDate(page, box, kind === 'date' ? dmyToIso(dmy) : dmy, label);
    await settle(page);
  }
  return true;
}

export async function readDates(): Promise<{ issue: string; expiry: string }> {
  const page = needPage('step6', WHERE.assist);
  const read = async (label: string) => {
    const v = await valueOf(page, await dateBox(page, label));
    return v.kind === 'date' ? isoToDmy(v.value) : v.value.trim();
  };
  return { issue: await read(ISSUE), expiry: await read(EXPIRY) };
}

/** Words that say the site saved it ("Visa information uploaded successfully"). */
const SAVED = /\b(success|successful|successfully|saved|submitted|updated)\b/i;

/** How long the tool waits for the site's answer after Submit Visa Information. */
const ANSWER_WAIT = 15_000;

/** The words on the page: those in boxes drawn over it (a popup, a dialog, a toast, a message), and every line it shows. */
interface PageWords {
  popups: string[];
  lines: string[];
}

/**
 * Reads the words the page shows. A popup can be built many ways (a SweetAlert box, a dialog, a toast, a
 * plain box over the page), so the tool reads both the boxes it recognises and every line on the page.
 */
async function pageWords(page: Page): Promise<PageWords> {
  return page
    .evaluate(() => {
      const shows = (el: Element) => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && el.getClientRects().length > 0;
      };
      const split = (t: string) =>
        t
          .split('\n')
          .map((x) => x.replace(/\s+/g, ' ').trim())
          .filter((x) => x && x.length <= 300);
      const BOXES =
        '[role=dialog],[role=alertdialog],[role=alert],[role=status],[aria-modal=true],[class*="swal" i],[class*="sweet" i],[class*="modal" i],' +
        '[class*="popup" i],[class*="dialog" i],[class*="toast" i],[class*="notif" i],[class*="snackbar" i],[class*="bootbox" i],' +
        '[class*="jconfirm" i],[class*="noty" i],[class*="izi" i],[class*="alert" i],[class*="message" i],[id*="msg" i]';
      const popups = new Set<string>();
      document.querySelectorAll(BOXES).forEach((el) => {
        if (popups.size >= 60 || !shows(el)) return;
        for (const l of split((el as HTMLElement).innerText || '')) popups.add(l);
      });
      const lines = new Set<string>();
      for (const l of split(document.body ? document.body.innerText : '')) {
        if (lines.size >= 3000) break;
        lines.add(l);
      }
      return { popups: Array.from(popups), lines: Array.from(lines) };
    })
    .catch(() => ({ popups: [] as string[], lines: [] as string[] }));
}

/** The page's own "please wait" while it saves. */
async function stillSaving(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const p = (window as unknown as { __portal?: { busy: () => string } }).__portal;
      return p ? p.busy() !== '' : document.readyState !== 'complete';
    })
    .catch(() => false);
}

let afterSubmit: { popups: string[]; before: PageWords & { messages: string[] } } = { popups: [], before: { popups: [], lines: [], messages: [] } };

/** Submit Visa Information, pressed by the staff. A popup is answered OK and its text is shown. */
export async function submit({ passport }: { passport: string }): Promise<SaveResult> {
  const page = needPage('step6', WHERE.assist);
  await requireCard(page, passport);
  const btn = await findButton(page, SUBMIT, { where: WHERE.assist });
  // What the page shows before the press, so only the site's answer counts afterwards.
  const words = await pageWords(page);
  const messages = await pageMessages(page);
  expectDialogs('step6', [{ match: /[\s\S]*/, accept: true }]);
  await press(page, btn, SUBMIT);
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const seen = takeDialogs('step6').map((d) => d.text);
  afterSubmit = { popups: seen, before: { ...words, messages } };
  return seen.length ? { popup: seen.join(' / ') } : {};
}

/**
 * What the site answered after Submit Visa Information: its popup (for example "Visa information uploaded
 * successfully" with OK), or a message on the page. The tool waits a few seconds for it. Only words that say
 * it saved count as saved; a problem, or no clear answer, stops the tool and the staff looks.
 */
export async function confirmSaved(): Promise<string> {
  const page = needPage('step6', WHERE.assist);
  const before = afterSubmit.before;
  const old = new Set([...before.popups, ...before.lines, ...before.messages]);
  const end = Date.now() + ANSWER_WAIT;
  let said: string[] = [];
  for (;;) {
    afterSubmit.popups.push(...takeDialogs('step6').map((d) => d.text));
    const now = await pageWords(page);
    const messages = (await pageMessages(page)).filter((t) => !before.messages.includes(t));
    // The site's own answer: its popups and messages that weren't there before the press.
    said = Array.from(new Set([...afterSubmit.popups, ...now.popups.filter((t) => !old.has(t)), ...messages]));
    const bad = said.filter((t) => PROBLEM.test(t));
    if (bad.length) {
      throw new SiteStop('The site showed a problem', `After Submit Visa Information the site said: "${bad.join('" / "')}". Look at the site window. The tool did not press it again.`);
    }
    const fresh = now.lines.filter((t) => !old.has(t));
    const good = [...said, ...fresh].filter((t) => SAVED.test(t) && !PROBLEM.test(t));
    if (good.length) {
      // The answer as the site wrote it, without its OK button.
      const words = said.filter((t) => !/^(ok|okay|close|done|x|×)$/i.test(t));
      return (words.some((t) => SAVED.test(t)) ? words : good).join(' · ').slice(0, 300);
    }
    if (Date.now() > end && !(await stillSaving(page))) break;
    // A page that still says it is saving gets a little longer, within the portal's own limit for an answer.
    if (Date.now() > end + 45_000) break;
    await sleep(500);
  }
  if (said.length === 0) {
    throw new SiteStop(
      'No answer from the site',
      'After Submit Visa Information the site showed no popup and no message. Look at the site window to see whether it saved. The tool did not press it again.',
    );
  }
  throw new SiteStop(
    UNCLEAR_ANSWER,
    `After Submit Visa Information the site said: "${said.join('" / "')}". That doesn't say it saved. Look at the site window to see whether it saved. The tool did not press it again.`,
  );
}

/** For the save check: the site's popup or message, if the page still shows it. Otherwise the tool can't tell. */
export async function visaSaved(): Promise<boolean | 'unknown'> {
  const page = existingPage('step6');
  if (!page) return 'unknown';
  const shown = [...(await pageWords(page)).popups, ...(await pageMessages(page))];
  const good = shown.filter((m) => SAVED.test(m) && !PROBLEM.test(m));
  return good.length ? true : 'unknown';
}
