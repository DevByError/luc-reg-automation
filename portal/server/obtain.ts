/**
 * Getting files from the site: a link to a file, a button that downloads one,
 * a link that opens the file in a new tab, or the report viewer's Export → PDF.
 */
import fs from 'node:fs';
import type { Download, Frame, Page } from 'playwright-core';
import type { Scope } from './browser';
import { asNetwork, pageOf, settle, sleep } from './browser';
import { WAIT } from './config';
import { SiteLoggedOut, SiteStop } from './errors';
import { sniff } from './files';
import { findButton, findField, loc, optionsOf, press } from './find';
import { log } from './log';

/** Fetches a file by its address, with the site window's login. */
export async function fetchUrl(page: Page, url: string): Promise<Buffer> {
  let res;
  try {
    res = await page.context().request.get(url, { timeout: WAIT.download, headers: { Referer: page.url() } });
  } catch (e) {
    throw asNetwork(e);
  }
  const body = await res.body();
  if (sniff(body) === 'html' && /type\s*=\s*["']?password/i.test(body.toString('latin1'))) throw new SiteLoggedOut();
  if (!res.ok()) throw new SiteStop("The file didn't download", `The site answered with an error (${res.status()}) instead of the file. Try again.`);
  return body;
}

async function readDownload(d: Download): Promise<Buffer> {
  const failure = await d.failure();
  if (failure) throw new SiteStop("The file didn't download", `The download stopped (${failure}). Try again.`);
  const p = await d.path();
  return fs.readFileSync(p);
}

/**
 * Presses something that gives a file and catches it: a download in this tab,
 * or a new tab that downloads it or shows it.
 */
export async function catchFile(page: Page, action: () => Promise<void>, timeout = WAIT.download): Promise<Buffer> {
  // Only a tab this page opens: other steps open their own tabs at the same moment.
  let popup: Page | null = null;
  const onPage = (p: Page) => {
    popup = p;
  };
  page.on('popup', onPage);
  let download: Download | null = null;
  const onDownload = (d: Download) => {
    download = d;
  };
  page.on('download', onDownload);
  let told = false;
  try {
    await action();
    const end = Date.now() + timeout;
    for (;;) {
      if (download) return await readDownload(download);
      const opened = popup as Page | null;
      if (opened) {
        if (!told) log('file: the site opened a new tab for it');
        told = true;
        const d = await opened.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        if (d) {
          const bytes = await readDownload(d);
          await opened.close().catch(() => undefined);
          return bytes;
        }
        await opened.waitForLoadState('load', { timeout: 20_000 }).catch(() => undefined);
        const url = opened.url();
        if (/^https?:/i.test(url)) {
          const bytes = await fetchUrl(page, url);
          await opened.close().catch(() => undefined);
          return bytes;
        }
      }
      if (Date.now() > end) throw new SiteStop("The file didn't download", 'The tool pressed the download but no file came. Try again.');
      await sleep(250);
    }
  } finally {
    page.off('popup', onPage);
    page.off('download', onDownload);
  }
}

/** The address a link goes to, if it is a plain link (not a script). Empty otherwise. */
export async function linkAddress(scope: Scope, mark: string): Promise<string> {
  return loc(scope, mark)
    .evaluate((el) => {
      const a = el.closest('a') as HTMLAnchorElement | null;
      return a && a.getAttribute('href') && !/^(#|javascript:)/i.test(a.getAttribute('href') || '') && /^https?:/i.test(a.href) ? a.href : '';
    })
    .catch(() => '');
}

/** The file behind a link: its address if it has one, otherwise what pressing it gives. */
export async function fileFromLink(scope: Scope, mark: string, name: string): Promise<Buffer> {
  const page = pageOf(scope);
  const href = await linkAddress(scope, mark);
  if (href) return fetchUrl(page, href);
  return catchFile(page, () => press(scope, mark, name));
}

/** The PDF item of the report viewer's export menu, in its newer and older names. */
async function pdfItem(scope: Scope, where: string, timeout: number): Promise<{ mark: string; name: string } | null> {
  const end = Date.now() + timeout;
  for (;;) {
    for (const name of ['PDF', 'Acrobat (PDF) file', 'PDF file']) {
      const mark = await findButton(scope, name, { where, timeout: 0 }).catch(() => null);
      if (mark) return { mark, name };
    }
    if (Date.now() >= end) return null;
    await sleep(300);
  }
}

/** Older viewers: a list of formats beside the Export link. */
async function formatList(scope: Scope): Promise<string | null> {
  const labelled = await findField(scope, 'Export', { where: 'the report', kinds: ['select'], timeout: 0 }).catch(() => null);
  if (labelled) return labelled;
  return scope
    .evaluate(() => {
      const P = (window as unknown as { __portal: { visible: (e: Element) => boolean; mark: (e: Element) => string } }).__portal;
      const lists = Array.from(document.querySelectorAll('select')).filter(
        (s) => P.visible(s) && Array.from((s as HTMLSelectElement).options).some((o) => /pdf/i.test(o.text)),
      );
      return lists.length === 1 ? P.mark(lists[0]) : null;
    })
    .catch(() => null);
}

/**
 * The address Microsoft's report viewer itself uses for Export (it ends in "Format="), with PDF added.
 * Null when the page has no such viewer or the report hasn't loaded.
 */
async function exportAddress(scope: Scope): Promise<string | null> {
  return (scope as Frame | Page)
    .evaluate(() => {
      const sys = (window as unknown as { Sys?: { Application?: { getComponents?: () => unknown[] } } }).Sys;
      const comps = sys?.Application?.getComponents?.() ?? [];
      const look = (o: unknown): string | null => {
        if (!o || typeof o !== 'object') return null;
        for (const k of Object.keys(o)) {
          let v: unknown;
          try {
            v = (o as Record<string, unknown>)[k];
          } catch {
            continue;
          }
          if (typeof v === 'string' && /OpType=Export/i.test(v) && /[?&]Format=$/i.test(v)) return v;
        }
        return null;
      };
      for (const c of comps) {
        let found = look(c);
        const inner = (c as { _getInternalViewer?: () => unknown } | null)?._getInternalViewer;
        if (!found && typeof inner === 'function') {
          try {
            found = look(inner.call(c));
          } catch {
            // Not ready yet.
          }
        }
        if (found) return new URL(found + 'PDF', location.href).href;
      }
      return null;
    })
    .catch(() => null);
}

/**
 * The report viewer (registration form, holding letter): Export → PDF.
 * Waits for the report to finish loading first.
 */
export async function exportReportPdf(scope: Scope, where: string): Promise<Buffer> {
  const page = pageOf(scope);
  await settle(scope, WAIT.save);
  // Microsoft's report viewer opens its export in a new tab, which brings the site window to the front.
  // The viewer's own export address gives the same file without that tab.
  // A first answer that isn't a PDF is tried once more a moment later (the report may still be settling) before the buttons are used.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const direct = await exportAddress(scope);
    if (!direct) break;
    const got = await fetchUrl(page, direct).catch(() => null);
    if (got && sniff(got) === 'pdf') {
      log('report: PDF taken from the viewer\'s export address');
      return got;
    }
    if (attempt === 3) log('report: the viewer\'s export address gave no PDF, using Export → PDF');
    else await sleep(1500);
  }
  const bytes = await catchFile(page, async () => {
    const exportBtn = await findButton(scope, 'Export', { where, timeout: 20_000 }).catch(() => null);
    if (exportBtn) {
      // Newer viewers: the Export button opens a menu with PDF in it.
      const pdfNow = await pdfItem(scope, where, 0);
      if (pdfNow) return press(scope, pdfNow.mark, pdfNow.name);
      const formats = await formatList(scope);
      if (formats) {
        const opts = await optionsOf(scope, formats);
        const pdf = opts.filter((o) => /pdf/i.test(o.text));
        if (pdf.length !== 1) throw new SiteStop('No PDF export', `The report on ${where} has no single PDF choice in its export list.`);
        await loc(scope, formats).selectOption({ index: pdf[0].index });
        return press(scope, exportBtn, 'Export');
      }
      await press(scope, exportBtn, 'Export');
      const pdf = await pdfItem(scope, where, 8000);
      if (!pdf) throw new SiteStop('No PDF export', `The report on ${where} has no PDF in its Export menu.`);
      return press(scope, pdf.mark, pdf.name);
    }
    // Last way: the viewer's own export command, the same one its menu uses.
    const ok = await (scope as Frame | Page).evaluate(() => {
      const sys = (window as unknown as { Sys?: { Application?: { getComponents?: () => unknown[] } } }).Sys;
      const comps = sys?.Application?.getComponents?.() ?? [];
      const viewer = comps.find((c) => typeof (c as { exportReport?: unknown }).exportReport === 'function') as
        | { exportReport: (f: string) => void }
        | undefined;
      if (!viewer) return false;
      setTimeout(() => viewer.exportReport('PDF'), 0);
      return true;
    });
    if (!ok) throw new SiteStop("Couldn't find Export", `The tool couldn't find the report's Export button on ${where}. Nothing was changed.`);
  });
  if (sniff(bytes) !== 'pdf') throw new SiteStop('The export is not a PDF', `The report on ${where} didn't come out as a PDF. Try again.`);
  return bytes;
}
