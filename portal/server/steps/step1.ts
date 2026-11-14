/** Step 1: find the student on the Registration Forms list, open Print, export the form as PDF. */
import { createHash } from 'node:crypto';
import type { Page } from 'playwright-core';
import type { DocFile, RegRow } from '../../shared/ops';
import { assertLoggedIn, existingPage, lanePage, openPage, pathOf, setLanePage, settle, sleep } from '../browser';
import { PAGES, WAIT } from '../config';
import { SiteStop } from '../errors';
import { saveDoc } from '../files';
import { cell, findButton, findField, findTable, loc, press, tokens, typeText } from '../find';
import { exportReportPdf } from '../obtain';
import { WHERE, needPage } from './common';

const HEADINGS = ['Application ID/Passport', 'Print'];
const REPORT_PATH = '/redirect/rptnewregistration_details.aspx';

export async function open(): Promise<true> {
  const page = await openPage('step1', PAGES.registrationList);
  await findTable(page, HEADINGS, WHERE.list, 30_000);
  return true;
}

/** The list's own Search box. It filters as you type, across every column. */
async function searchBox(page: Page): Promise<string> {
  const mark = await page.evaluate(() => {
    const P = (window as unknown as { __portal: { visible: (e: Element) => boolean; mark: (e: Element) => string } }).__portal;
    const el = Array.from(document.querySelectorAll('.dataTables_filter input, .dt-search input, input[type=search]')).find((e) => P.visible(e));
    return el ? P.mark(el) : null;
  });
  return mark ?? findField(page, 'Search', { where: WHERE.list, kinds: ['text'] });
}

const printLinks = new Map<string, { href: string; mark: string; id: string }>();

/** Columns that are buttons, not details: the portal doesn't show them. Photo is shown as a picture. */
const NOT_SHOWN = /^(photo|print|complete|upload|edit|edit form|action|select)$/i;

/**
 * The row's photo, made small, as the page shows it: '' when the row has none or the image is broken.
 * It goes from the site window to the portal on this computer only.
 */
async function rowPhoto(page: Page, rowMark: string, column: number): Promise<{ photo: string; src: string }> {
  const got = await loc(page, rowMark)
    .evaluate(async (tr, col) => {
      const cells = (tr as HTMLTableRowElement).cells;
      const img = (col >= 0 && cells[col]?.querySelector('img')) || (tr as HTMLElement).querySelector('img');
      if (!img) return { photo: '', src: '', url: '' };
      const src = img.getAttribute('src') || '';
      for (let i = 0; i < 30 && !img.complete; i++) await new Promise((r) => setTimeout(r, 100));
      if (!img.complete || !img.naturalWidth) return { photo: '', src, url: '' };
      const k = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      try {
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        return { photo: c.toDataURL('image/jpeg', 0.85), src, url: '' };
      } catch {
        // A picture from another address can't be read from the page: the tool fetches it itself.
        return { photo: '', src, url: img.currentSrc || img.src };
      }
    }, column)
    .catch(() => ({ photo: '', src: '', url: '' }));
  if (got.photo || !/^https?:/i.test(got.url)) return { photo: got.photo, src: got.src };
  const res = await page.context().request.get(got.url, { timeout: 10_000 }).catch(() => null);
  const type = res?.headers()['content-type'] ?? '';
  const body = res && res.ok() && /^image\//i.test(type) ? await res.body().catch(() => null) : null;
  return { photo: body && body.length < 2_000_000 ? `data:${type.split(';')[0]};base64,${body.toString('base64')}` : '', src: got.src };
}

export async function search({ passport }: { passport: string }): Promise<RegRow[]> {
  let page = existingPage('step1');
  if (!page || pathOf(page.url()) !== PAGES.registrationList.toLowerCase()) {
    page = await openPage('step1', PAGES.registrationList);
    await findTable(page, HEADINGS, WHERE.list, 30_000);
  }
  const box = await searchBox(page);
  await typeText(page, box, passport, 'Search');
  await sleep(500);
  await settle(page);
  const table = await findTable(page, HEADINGS, WHERE.list);
  const want = passport.toUpperCase();
  const rows = table.rows.filter((r) => r.cells.length >= table.headers.length - 1 && tokens(cell(table, r, 'Application ID/Passport')).includes(want));
  printLinks.clear();
  const photoAt = table.headers.findIndex((h) => /^photo$/i.test(h.trim()));
  const out: RegRow[] = [];
  for (const [i, r] of rows.entries()) {
    const key = `row${i}`;
    const mark = await findButton(page, 'Print', { where: WHERE.list, within: r.mark, timeout: 3000 }).catch(() => '');
    const link = mark
      ? await loc(page, mark)
          .evaluate((el) => {
            const a = el.closest('a') as HTMLAnchorElement | null;
            const h = a?.getAttribute('href') || '';
            return { href: a && h && !/^(#|javascript:)/i.test(h) ? a.href : '', raw: `${h} ${a?.getAttribute('onclick') || ''}` };
          })
          .catch(() => ({ href: '', raw: '' }))
      : { href: '', raw: '' };
    // Only the rows with more than one match need their photo: the staff tells them apart.
    const pic = rows.length > 1 ? await rowPhoto(page, r.mark, photoAt) : { photo: '', src: '' };
    // Two rows with the same words differ in their Print link or photo; the same row gives the same id next time.
    const id = createHash('sha1').update(JSON.stringify([r.cells, link.raw, pic.src])).digest('hex').slice(0, 20);
    printLinks.set(key, { href: link.href, mark, id });
    out.push({
      name: cell(table, r, 'Name'),
      applicationId: cell(table, r, 'Application ID/Passport'),
      course: cell(table, r, 'Course name'),
      applyDate: cell(table, r, 'Apply Date'),
      key,
      id,
      shown: table.headers
        .map((h, k) => [h.trim(), (r.cells[k] ?? '').trim()] as [string, string])
        .filter(([h]) => h && !NOT_SHOWN.test(h)),
      photo: pic.photo,
    });
  }
  return out;
}

/** Opens the report in its own tab. Print here only opens the report page; nothing is printed. */
export async function print({ key, id }: { key: string; id?: string }): Promise<true> {
  const link = printLinks.get(key);
  if (id && link && link.id !== id) {
    throw new SiteStop('The list changed', "The row you chose isn't where it was on the list any more. Choose it again. Nothing was opened.");
  }
  if (!link || (!link.href && !link.mark)) {
    throw new SiteStop("Couldn't find Print", "The tool couldn't find the Print link in the student's row. Nothing was changed.");
  }
  let report: Page;
  if (link.href) {
    report = await lanePage('report');
    await report.goto(link.href, { waitUntil: 'load', timeout: WAIT.page });
  } else {
    // The report opens in a new tab, or in this same tab after the site posts back. Only a tab that this
    // page opens counts: other steps open their own tabs at the same moment.
    const list = needPage('step1', WHERE.list);
    const popupP = list.waitForEvent('popup', { timeout: WAIT.newTab }).catch(() => null);
    const sameTabP = list
      .waitForURL((u) => pathOf(u.toString()) === REPORT_PATH, { timeout: WAIT.newTab, waitUntil: 'commit' })
      .then(() => list)
      .catch(() => null);
    await press(list, link.mark, 'Print', { allow: /^\s*print\s*$/i });
    const opened = await firstOf([popupP, sameTabP]);
    if (!opened) {
      await settle(list, WAIT.save);
      await assertLoggedIn(list);
      throw new SiteStop('The report did not open', `After Print, no report opened. The list shows ${pathOf(list.url()) || 'another page'}. Press Try again.`);
    }
    setLanePage('report', opened);
    report = opened;
  }
  await settle(report, WAIT.save);
  await assertLoggedIn(report);
  if (pathOf(report.url()) !== REPORT_PATH) {
    throw new SiteStop('The report did not open', `After Print, the site showed ${pathOf(report.url()) || 'another page'} instead of the registration form report.`);
  }
  return true;
}

/** The first of these to give a page; null if none does. */
function firstOf(list: Promise<Page | null>[]): Promise<Page | null> {
  return new Promise((resolve) => {
    let left = list.length;
    for (const p of list) {
      p.then((v) => {
        if (v) resolve(v);
        else if ((left -= 1) === 0) resolve(null);
      });
    }
  });
}

export async function pdf({ passport }: { passport: string }): Promise<DocFile> {
  const report = needPage('report', WHERE.report);
  const bytes = await exportReportPdf(report, WHERE.report);
  return saveDoc(passport, 'registration', bytes);
}
