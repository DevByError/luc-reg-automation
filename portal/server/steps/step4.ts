/**
 * Step 4: open the student's file by passport and download two documents for the staff to print.
 * Step 5's VAL letter comes from the same documents tab.
 */
import type { Page } from 'playwright-core';
import type { DocFile, FileRow } from '../../shared/ops';
import { asNetwork, assertLoggedIn, existingPage, expectDialogs, lanePage, openPage, setLanePage, settle, sleep } from '../browser';
import { PAGES, WAIT } from '../config';
import { SiteStop } from '../errors';
import { saveDoc } from '../files';
import { log } from '../log';
import {
  cell,
  fileLinkIn,
  findButton,
  findField,
  findFieldIfAny,
  findTableIfAny,
  pageMessages,
  press,
  rowsWithCell,
  tokens,
  typeText,
  valueOf,
  waitForText,
} from '../find';
import { catchFile, fetchUrl, linkAddress } from '../obtain';
import { WHERE, needPage, samePassport, stopOnUnknownDialogs } from './common';

const SEARCH_LABEL = 'Student ID/Name/IC/Passport no';
const REASON_LABEL = 'Please state your reason for Access';
/** The popup after Submit Reason ("Reason submitted Successfully"), in the ways the site may word it. Any other popup stops the tool. */
const REASON_OK = /reason\W+(has\s+been\s+)?(submitted|saved|recorded|accepted)|submitted\s+success/i;
const RESULT_HEADINGS = ['Student ID', 'Name', 'Passport no/IC', 'Course Name'];

export async function open(): Promise<true> {
  const page = await openPage('step4', PAGES.studentFiles);
  await findField(page, SEARCH_LABEL, { where: WHERE.files, kinds: ['text'], timeout: 20_000 });
  return true;
}

export async function view({ passport }: { passport: string }): Promise<{ reasonAsked: boolean }> {
  const page = await openPage('step4', PAGES.studentFiles);
  const box = await findField(page, SEARCH_LABEL, { where: WHERE.files, kinds: ['text'], timeout: 20_000 });
  await typeText(page, box, passport, SEARCH_LABEL);
  if (!samePassport((await valueOf(page, box)).value, passport)) {
    throw new SiteStop('The search box shows something else', 'The Student Files search box did not keep the passport. Nothing was changed.');
  }
  expectDialogs('step4', [{ match: REASON_OK, accept: true }]);
  await press(page, await findButton(page, 'View', { where: WHERE.files }), 'View');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  await stopOnUnknownDialogs('step4', WHERE.files);
  const reason = await findFieldIfAny(page, REASON_LABEL, { where: WHERE.files, kinds: ['text'], timeout: 5000 });
  return { reasonAsked: !!reason };
}

/** Types the access reason and presses Submit Reason. The only thing step 4 saves on the site. */
export async function reason({ reason }: { reason: string }): Promise<string> {
  const page = needPage('step4', WHERE.files);
  const box = await findFieldIfAny(page, REASON_LABEL, { where: WHERE.files, kinds: ['text'], timeout: 3000 });
  if (!box) return 'The site did not ask for a reason this time';
  await typeText(page, box, reason, REASON_LABEL);
  if ((await valueOf(page, box)).value.trim() !== reason.trim()) {
    throw new SiteStop('The reason box shows something else', 'The reason box did not keep the text. Nothing was changed.');
  }
  expectDialogs('step4', [{ match: REASON_OK, accept: true }]);
  await press(page, await findButton(page, 'Submit Reason', { where: WHERE.files }), 'Submit Reason');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const seen = await stopOnUnknownDialogs('step4', WHERE.files);
  const ok = seen.find((d) => REASON_OK.test(d.text));
  return ok ? `Popup: "${ok.text}" → OK` : 'Reason submitted';
}

let resultRow = '';

const NOT_FOUND = /not found|no record|no data|no student|invalid/i;

export async function result({ passport }: { passport: string }): Promise<FileRow> {
  const page = needPage('step4', WHERE.files);
  // The result table, or stop as soon as the page says it found no one.
  const end = Date.now() + 30_000;
  let table = await findTableIfAny(page, RESULT_HEADINGS);
  while (!table) {
    const none = (await pageMessages(page)).filter((m) => NOT_FOUND.test(m));
    if (none.length) throw new SiteStop('Student not found in Student Files', `Student Files says: "${none.join('" / "')}". Check the passport number.`);
    if (Date.now() > end) {
      throw new SiteStop(
        'No result in Student Files',
        `Student Files showed no result and no message for ${passport}. Check the passport number. If it's right, look at the site window. Nothing was changed.`,
      );
    }
    await sleep(500);
    table = await findTableIfAny(page, RESULT_HEADINGS);
  }
  const want = passport.toUpperCase();
  const rows = table.rows.filter((r) => tokens(cell(table, r, 'Passport no/IC')).includes(want));
  if (rows.length === 0) {
    throw new SiteStop('Student not found in Student Files', `No row in Student Files has the passport ${passport}. The tool stopped.`);
  }
  if (rows.length > 1) {
    throw new SiteStop('More than one student', `${rows.length} rows in Student Files have the passport ${passport}, so the tool stopped rather than pick one.`);
  }
  resultRow = rows[0].mark;
  return { studentId: cell(table, rows[0], 'Student ID'), name: cell(table, rows[0], 'Name'), course: cell(table, rows[0], 'Course Name') };
}

/** View details on the student's row, then "Click Me To View All Documents", which opens a new tab. */
export async function docsTab(): Promise<true> {
  const page = needPage('step4', WHERE.files);
  if (!resultRow) throw new SiteStop('Find the student again', 'Press Try again to search Student Files again.');
  expectDialogs('step4', []);
  await press(page, await findButton(page, 'View details', { where: WHERE.files, within: resultRow }), 'View details');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  await stopOnUnknownDialogs('step4', WHERE.files);
  const btn = await findButton(page, 'Click Me To View All Documents', { where: WHERE.files, timeout: 30_000 });
  let docs: Page | null;
  const href = await linkAddress(page, btn);
  if (href) {
    // A plain link: the tool opens its page in its own tab, behind, instead of the site opening a new tab in front.
    docs = await lanePage('docs');
    try {
      await docs.goto(href, { waitUntil: 'load', timeout: WAIT.page, referer: page.url() });
    } catch (e) {
      throw asNetwork(e);
    }
  } else {
    // Only a tab this page opens; a tab another step opens at the same moment is not it.
    const popupP = page.waitForEvent('popup', { timeout: WAIT.newTab }).catch(() => null);
    await press(page, btn, 'Click Me To View All Documents');
    docs = await popupP;
    if (!docs) {
      await settle(page, WAIT.save);
      throw new SiteStop('The documents tab did not open', 'After "Click Me To View All Documents" no new tab opened. Look at the site window.');
    }
    log('step4: the site opened the documents in a new tab');
    setLanePage('docs', docs);
  }
  await settle(docs, WAIT.save);
  await assertLoggedIn(docs);
  const ok = (await waitForText(docs, 'Student Information', 30_000)) || (await waitForText(docs, 'Student Details', 1000));
  if (!ok) throw new SiteStop('The documents tab looks different', 'The new tab does not show "1. Student Information". Look at the site window.');
  docs = null;
  return true;
}

const DOC_NAME = { profile: 'Student Profile and Family Details', studentType: 'Student Type Document' } as const;

/** Finds a document by its whole, exact name and saves its file. */
async function docByName(page: Page, name: string, passport: string, key: 'profile' | 'studentType' | 'val'): Promise<DocFile> {
  const rows = await rowsWithCell(page, name);
  if (rows.length === 0) throw new SiteStop(`"${name}" is missing`, `The documents tab has no row named "${name}". Get it by hand from the site.`);
  if (rows.length > 1) throw new SiteStop(`"${name}" is listed twice`, `The documents tab lists "${name}" ${rows.length} times, so the tool stopped rather than pick one.`);
  const link = await fileLinkIn(page, rows[0], name);
  if (!link) throw new SiteStop(`"${name}" has no file`, `The row "${name}" has no link to a file. Get it by hand from the site.`);
  const bytes = link.href ? await fetchUrl(page, link.href) : await catchFile(page, () => press(page, link.mark, link.name));
  return saveDoc(passport, key, bytes);
}

export async function download({ doc, passport }: { doc: 'profile' | 'studentType'; passport: string }): Promise<DocFile> {
  const page = needPage('docs', WHERE.docs);
  return docByName(page, DOC_NAME[doc], passport, doc);
}

/* ------------------------------------------------------------ the VAL letter */

export async function valOpen(): Promise<true> {
  const page = existingPage('docs');
  if (!page) throw new SiteStop("Step 4's documents tab is not open", 'The VAL letter comes from the documents tab of step 4. Press Try again on step 4 first.');
  const rows = await rowsWithCell(page, 'Approval');
  if (rows.length === 0) throw new SiteStop('No Approval link', 'Section 7 (VAL Information) has no row named "Approval". Get the VAL letter by hand.');
  if (rows.length > 1) throw new SiteStop('"Approval" is listed twice', 'More than one row is named "Approval", so the tool stopped rather than pick one.');
  return true;
}

export async function valFetch({ passport }: { passport: string }): Promise<DocFile> {
  const page = needPage('docs', WHERE.docs);
  return docByName(page, 'Approval', passport, 'val');
}
