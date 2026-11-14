/**
 * Stage 0: the A/c Mini Statement. It only brings a document for the staff to read. Nothing here saves anything
 * on the site, and no other step uses it.
 *
 * Passport → View → (the site may ask for a reason) Submit Reason → OK on the popup (if one shows) → the report shows on the same
 * page → Export → PDF, saved in the student's folder as "0 Mini statement".
 */
import type { Page } from 'playwright-core';
import type { DocFile } from '../../shared/ops';
import { assertLoggedIn, expectDialogs, openPage, settle, sleep } from '../browser';
import { PAGES, WAIT } from '../config';
import { SiteStop } from '../errors';
import { saveDoc } from '../files';
import { log } from '../log';
import { findButton, findField, findFieldIfAny, pageHasText, pageMessages, press, typeText, valueOf } from '../find';
import { exportReportPdf } from '../obtain';
import { needPage, samePassport, stopOnUnknownDialogs } from './common';

const WHERE_MINI = 'the A/c Mini Statement page';
const ID_LABEL = 'Student Id/PassportIC';
const REASON_LABEL = 'Please state your reason for Access';
/** A popup that says the reason went through. Any other popup stops the tool and goes to the staff. */
/** The popup after Submit Reason ("Reason submitted Successfully"), in the ways the site may word it. Any other popup stops the tool. */
const REASON_OK = /reason\W+(has\s+been\s+)?(submitted|saved|recorded|accepted)|submitted\s+success/i;
const NOT_FOUND = /not found|no record|no data|no student|invalid/i;
/** Words only the report itself shows (the page's own title is "A/c Mini Statement"). */
const REPORT_WORDS = 'Mini Statement Of Fees';

export async function open(): Promise<true> {
  const page = await openPage('step0', PAGES.miniStatement);
  await findField(page, ID_LABEL, { where: WHERE_MINI, kinds: ['text'], timeout: 20_000 });
  return true;
}

const reasonBox = (page: Parameters<typeof findFieldIfAny>[0], timeout = 0) => findFieldIfAny(page, REASON_LABEL, { where: WHERE_MINI, kinds: ['text'], timeout });

/** Passport → View. Says whether the site asked for a reason (it doesn't always). */
export async function view({ passport }: { passport: string }): Promise<{ reasonAsked: boolean }> {
  const page = await openPage('step0', PAGES.miniStatement);
  const box = await findField(page, ID_LABEL, { where: WHERE_MINI, kinds: ['text'], timeout: 20_000 });
  await typeText(page, box, passport, ID_LABEL);
  if (!samePassport((await valueOf(page, box)).value, passport)) {
    throw new SiteStop('The passport box shows something else', 'The A/c Mini Statement page did not keep the passport. Nothing was changed.');
  }
  expectDialogs('step0', [{ match: REASON_OK, accept: true }]);
  await press(page, await findButton(page, 'View', { where: WHERE_MINI, near: box }), 'View');
  await settle(page, WAIT.save).catch(() => undefined);
  await assertLoggedIn(page);
  await stopOnUnknownDialogs('step0', WHERE_MINI);
  // The reason box, or the report straight away, or a message that the student isn't there.
  const end = Date.now() + 20_000;
  for (;;) {
    if (await reasonBox(page)) return { reasonAsked: true };
    if (await pageHasText(page, REPORT_WORDS)) return { reasonAsked: false };
    const none = (await pageMessages(page)).filter((m) => NOT_FOUND.test(m));
    if (none.length) throw new SiteStop('The site showed a message', `After View the site said: "${none.join('" / "')}". Check the passport number.`);
    if (Date.now() > end) return { reasonAsked: false };
    await sleep(400);
  }
}

/** Types the access reason and presses Submit Reason. If the site doesn't ask for one (any more), nothing is done. */
export async function reason({ reason }: { reason: string }): Promise<string> {
  const page = needPage('step0', WHERE_MINI);
  const box = await reasonBox(page, 3000);
  if (!box) return 'The site did not ask for a reason this time';
  await typeText(page, box, reason, REASON_LABEL);
  if ((await valueOf(page, box)).value.trim() !== reason.trim()) {
    throw new SiteStop('The reason box shows something else', 'The reason box did not keep the text. Nothing was changed.');
  }
  // The "Reason submitted Successfully" popup is answered OK. If none shows, that is fine too.
  expectDialogs('step0', [{ match: REASON_OK, accept: true }]);
  await press(page, await findButton(page, 'Submit Reason', { where: WHERE_MINI }), 'Submit Reason');
  await settle(page, WAIT.save).catch(() => undefined);
  await assertLoggedIn(page);
  const seen = await stopOnUnknownDialogs('step0', WHERE_MINI);
  const ok = seen.find((d) => REASON_OK.test(d.text));
  return ok ? `Popup: "${ok.text}" → OK` : 'Reason submitted';
}

/** Waits for the report, checks it is this student's, and saves it as a PDF in the student's folder. */
export async function pdf({ passport }: { passport: string }): Promise<DocFile> {
  const page = needPage('step0', WHERE_MINI);
  const end = Date.now() + 90_000;
  for (;;) {
    await assertLoggedIn(page);
    if (await pageHasText(page, REPORT_WORDS)) break;
    const none = (await pageMessages(page)).filter((m) => NOT_FOUND.test(m));
    if (none.length) throw new SiteStop('The site showed a message', `The mini statement page said: "${none.join('" / "')}". Check the passport number.`);
    if (Date.now() > end) {
      throw new SiteStop(
        'The mini statement did not show',
        'The report did not appear on the A/c Mini Statement page. Look at the site window. If it shows the report there, press Try again.',
      );
    }
    await sleep(500);
  }
  await settle(page, WAIT.save).catch(() => undefined);
  // Is it this student's? The tool typed the passport itself and the site answered with this report, so a report the tool
  // can't match is saved anyway, with a warning, never refused: the staff reads the statement and sees whose it is.
  let warning = '';
  const found = await waitFor(15_000, () => reportShows(page, passport));
  if (!found) {
    const shown = await reportPassport(page);
    log(`step0: the report's passport line was not matched (shows "${shown.replace(/\d/g, '#')}", typed ${passport.length} characters)`);
    warning = shown
      ? `The mini statement shows the passport "${shown}", and you typed "${passport}". It was saved. Look at it before you rely on it.`
      : `The tool couldn't read a passport on the mini statement, so it couldn't check it is this student's. It was saved. Look at it before you rely on it.`;
  }
  const bytes = await exportReportPdf(page, WHERE_MINI);
  const saved = saveDoc(passport, 'miniStatement', bytes);
  return warning ? { ...saved, warning } : saved;
}

async function waitFor(ms: number, ok: () => Promise<boolean>): Promise<boolean> {
  const end = Date.now() + ms;
  for (;;) {
    if (await ok().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await sleep(500);
  }
}

/** The passport shows in the report, in the page or in any frame of it (the report may be drawn in a frame). */
async function reportShows(page: Page, passport: string): Promise<boolean> {
  for (const f of page.frames()) {
    if (await pageHasText(f, passport).catch(() => false)) return true;
  }
  return false;
}

/** The passport as the report writes it ("Passport/Ic : P1234567"), or ''. */
async function reportPassport(page: Page): Promise<string> {
  for (const f of page.frames()) {
    const t = await f
      .evaluate(() => {
        // The page's own box is labelled "Student Id/PassportIC :" above the report: the report's line is the last one.
        const all = Array.from((document.body?.innerText || '').matchAll(/Passport\s*\/\s*(?:IC|No)\s*[:.\-]\s*([A-Za-z0-9][A-Za-z0-9 \-]{2,24})/gi));
        return all.length ? all[all.length - 1][1].trim() : '';
      })
      .catch(() => '');
    if (t) return t;
  }
  return '';
}
