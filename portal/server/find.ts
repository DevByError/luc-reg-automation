/**
 * Finding things on the site's pages the way a person does: a field by the label next to it,
 * a button by its name, a table by its headings. Nothing is guessed: if a label matches no field,
 * or more than one, the tool stops instead of picking one.
 */
import type { SiteNeed } from '../shared/ops';
import type { Scope } from './browser';
import { sleep } from './browser';
import { SiteChanged, SiteStop } from './errors';
import { installPortalHelpers } from './inpage';

export interface Found {
  mark: string;
  kind: string;
  id: string;
  name: string;
}

/** A tick-one list (radio buttons): each choice with the words next to it. */
export interface RadioGroup {
  name: string;
  options: { mark: string; label: string; checked: boolean; disabled: boolean }[];
}

export interface TableInfo {
  mark: string;
  headers: string[];
  rows: { mark: string; cells: string[] }[];
}

interface PortalApi {
  rowsWithCell: (text: string) => string[];
  fileLinkIn: (rowMark: string, skipText: string) => { mark: string; name: string; href: string } | null;
  rowControls: (rowMark: string) => Found[];
  rowCells: (rowMark: string) => string[] | null;
  textAfter: (label: string) => string[];
  shownAfter: (label: string, prefix: boolean) => { box: string; value: string }[];
  findLabelled: (label: string, opts: { prefix?: boolean; kinds?: string[] | null; nth?: number; hiddenFile?: boolean }) => Found[];
  findById: (suffixes: string[], kinds: string[] | null, hiddenFile: boolean) => Found[];
  radioGroupOf: (mark: string) => RadioGroup | null;
  radioGroupsByName: (suffixes: string[]) => RadioGroup[];
  findButtons: (name: string, opts: { prefix?: boolean; within?: string }) => { mark: string; name: string; tag: string }[];
  buttonsNear: (name: string, nearMark: string, prefix: boolean) => { mark: string; name: string; tag: string }[];
  tabHeaders: (name: string) => string[];
  findTables: (headings: string[]) => TableInfo[];
  valueOf: (mark: string) => { kind: string; value: string; raw: string } | null;
  optionsOf: (mark: string) => { index: number; text: string; value: string }[];
  pageText: () => string;
  highlight: (mark: string) => boolean;
  canon: (s: string) => string;
  visible: (el: Element) => boolean;
  mark: (el: Element) => string;
  siteNeeds: (messages: string[], skip: string[], opts: { marked: boolean; guess: boolean }) => { fields: SiteNeed[]; portal: string[] };
  fieldByKey: (key: string) => { kind: string; name: string; options: RadioGroup['options']; marks: string[] };
}

type Win = Window & { __portal?: PortalApi };

export const canon = (s: string | null | undefined): string => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

export const loc = (scope: Scope, mark: string) => scope.locator(`[data-portal="${mark}"]`);

export async function ensureHelpers(scope: Scope) {
  const ok = await scope.evaluate(() => !!(window as Win).__portal).catch(() => false);
  if (!ok) await scope.evaluate(installPortalHelpers).catch(() => undefined);
}

async function poll<T>(timeout: number, fn: () => Promise<T | null>): Promise<T | null> {
  const end = Date.now() + timeout;
  for (;;) {
    const r = await fn().catch(() => null);
    if (r !== null) return r;
    if (Date.now() >= end) return null;
    await sleep(300);
  }
}

export interface FieldOptions {
  /** Where this is, for messages: "the Admission Profile". */
  where: string;
  kinds?: string[];
  prefix?: boolean;
  /** The 2nd box under the same label, e.g. the number after the country code. */
  nth?: number;
  timeout?: number;
  /** Options a dropdown must have, so the tool knows it found the right one. */
  mustInclude?: string[];
  /**
   * The ids the field has on the real site, read from its pages ("ddlintake" for
   * ContentPlaceHolder1_maintabcontainer_Tab1_ddlintake). Tried before the label; the label is used
   * only when no field shows with one of these ids.
   */
  ids?: string[];
  /**
   * A file box the site hides behind its own "Click to choose a file" area counts too. Only for a known
   * upload box: the tool sets the file on that box, as choosing it in the site's area would.
   */
  hiddenFile?: boolean;
}

async function lookField(scope: Scope, label: string, opts: FieldOptions): Promise<Found[]> {
  await ensureHelpers(scope);
  return scope.evaluate(
    ([l, o]) => (window as Win).__portal!.findLabelled(l, o),
    [label, { prefix: opts.prefix, kinds: opts.kinds ?? null, nth: opts.nth, hiddenFile: opts.hiddenFile }] as const,
  );
}

async function lookById(scope: Scope, ids: string[], opts: FieldOptions): Promise<Found[]> {
  await ensureHelpers(scope);
  return scope.evaluate(([s, k, h]) => (window as Win).__portal!.findById(s, k, h), [ids, opts.kinds ?? null, !!opts.hiddenFile] as const);
}

/** The one field labelled `label` (or with one of its known ids). Stops if there is none or more than one. */
export async function findField(scope: Scope, label: string, opts: FieldOptions): Promise<string> {
  let last: Found[] = [];
  const hit = await poll(opts.timeout ?? 15_000, async () => {
    if (opts.ids?.length) {
      const byId = await lookById(scope, opts.ids, opts);
      if (byId.length) {
        last = byId;
        return byId.length === 1 ? byId[0] : null;
      }
    }
    last = await lookField(scope, label, opts);
    return last.length === 1 ? last[0] : null;
  });
  if (!hit) {
    if (last.length > 1) {
      throw new SiteChanged(
        `"${label}" appears more than once`,
        `On ${opts.where}, ${last.length} fields are labelled "${label}", so the tool stopped rather than guess. Nothing was changed.`,
      );
    }
    throw new SiteChanged(
      `Couldn't find "${label}"`,
      `The tool couldn't find the "${label}" field on ${opts.where}. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`,
    );
  }
  if (opts.mustInclude?.length) {
    const have = (await optionsOf(scope, hit.mark)).map((o) => o.text);
    const missing = opts.mustInclude.filter((m) => !have.includes(m));
    if (missing.length) {
      throw new SiteChanged(
        `"${label}" has different choices`,
        `On ${opts.where}, the "${label}" list doesn't have ${missing.map((m) => `"${m}"`).join(', ')}, so it may not be the right list. Nothing was changed.`,
      );
    }
  }
  return hit.mark;
}

/** Like findField, but returns null when the field isn't there. */
export async function findFieldIfAny(scope: Scope, label: string, opts: FieldOptions): Promise<string | null> {
  try {
    return await findField(scope, label, { ...opts, timeout: opts.timeout ?? 0, mustInclude: undefined });
  } catch (e) {
    if (e instanceof SiteChanged && /Couldn't find/.test(e.title)) return null;
    throw e;
  }
}

export async function valueOf(scope: Scope, mark: string): Promise<{ kind: string; value: string; raw: string }> {
  await ensureHelpers(scope);
  const v = await scope.evaluate((m) => (window as Win).__portal!.valueOf(m), mark);
  if (!v) throw new SiteStop('The page changed', 'A field the tool was using disappeared from the page. Nothing more was changed.');
  return v;
}

export async function optionsOf(scope: Scope, mark: string) {
  await ensureHelpers(scope);
  return scope.evaluate((m) => (window as Win).__portal!.optionsOf(m), mark);
}

/** "-- Select --" and the like: a dropdown showing one of these has nothing picked. */
export const PLACEHOLDER = /^(-+|select\b|-+\s*select|please select|choose\b|-+\s*choose)/i;

/** The choices of a dropdown, without "-- Select --" style placeholders. */
export async function choices(scope: Scope, mark: string): Promise<string[]> {
  const list = await optionsOf(scope, mark);
  return list.map((o) => o.text).filter((t) => t && !PLACEHOLDER.test(t));
}

/** A field as the staff would see it: its value ('' when empty or "-- Select --"), whether it is locked, and a dropdown's choices. */
export async function fieldState(scope: Scope, mark: string): Promise<{ kind: string; value: string; locked: boolean; options?: string[] }> {
  const v = await valueOf(scope, mark);
  const locked = await loc(scope, mark)
    .evaluate((el) => (el as HTMLInputElement).readOnly === true || (el as HTMLInputElement).disabled === true)
    .catch(() => false);
  if (v.kind === 'select') {
    const value = PLACEHOLDER.test(v.value) ? '' : v.value;
    return { kind: 'select', value, locked, options: await choices(scope, mark) };
  }
  return { kind: v.kind, value: v.value.trim(), locked };
}

/**
 * Picks a dropdown option by its exact text ("Class 1" is never "Class 3").
 * The site lists some choices twice (a country, for example). Copies that send the same value are one choice, so
 * either will do. Copies that send different values can't be told apart by their words, so the tool stops.
 * Returns true if the choice changed (the page may post back).
 */
export async function selectText(scope: Scope, mark: string, text: string, label: string, where: string): Promise<boolean> {
  const want = clean(text);
  const list = await optionsOf(scope, mark);
  const hits = list.filter((o) => o.text === want);
  if (hits.length === 0) {
    throw new SiteStop(
      `"${want}" isn't a choice`,
      `On ${where}, the "${label}" list has no option "${want}". Nothing was saved. Pick another value in the portal.`,
    );
  }
  if (hits.length > 1 && !hits.every((h) => h.value === hits[0].value)) {
    throw new SiteStop(`"${want}" is listed twice`, `On ${where}, the "${label}" list has "${want}" more than once, so the tool stopped rather than guess.`);
  }
  const now = await valueOf(scope, mark);
  if (now.value === want) return false;
  await loc(scope, mark).selectOption({ index: hits[0].index });
  return true;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

/**
 * Each option's words as the staff sees them in the portal. A text the site lists more than once with different
 * values gets its place on the site's list: "Pakistan (2nd of 2 on the site)". Copies with the same value are one choice.
 */
export function choiceLabels(list: { index: number; text: string; value: string }[]): Map<number, string> {
  const byText = new Map<string, typeof list>();
  for (const o of list) byText.set(o.text, [...(byText.get(o.text) ?? []), o]);
  const out = new Map<number, string>();
  for (const o of list) {
    const same = byText.get(o.text) ?? [o];
    const one = same.length === 1 || same.every((x) => x.value === same[0].value);
    const n = same.indexOf(o);
    out.set(o.index, one ? o.text : `${o.text} (${ORDINALS[n] ?? `${n + 1}th`} of ${same.length} on the site)`);
  }
  return out;
}

/** A dropdown's choices for the portal (no "-- Select --"), each once, and what it shows now ('' for nothing picked). */
export async function choicesShown(scope: Scope, mark: string): Promise<{ options: string[]; value: string }> {
  const list = await optionsOf(scope, mark);
  const labels = choiceLabels(list);
  const options = [...new Set(list.filter((o) => o.text && !PLACEHOLDER.test(o.text)).map((o) => labels.get(o.index) ?? o.text))];
  const at = await loc(scope, mark).evaluate((el) => (el as HTMLSelectElement).selectedIndex);
  const picked = list.find((o) => o.index === at);
  return { options, value: picked && picked.text && !PLACEHOLDER.test(picked.text) ? (labels.get(picked.index) ?? picked.text) : '' };
}

/**
 * Picks the option the staff chose in the portal, by the words the portal showed (see choiceLabels), so a choice the
 * site lists twice is picked at the place the staff chose. Returns true if the choice changed.
 */
export async function selectChoice(scope: Scope, mark: string, shown: string, label: string, where: string): Promise<boolean> {
  const want = clean(shown);
  const list = await optionsOf(scope, mark);
  const labels = choiceLabels(list);
  const hits = list.filter((o) => labels.get(o.index) === want);
  if (hits.length === 0) {
    throw new SiteStop(
      `"${want}" isn't a choice`,
      `On ${where}, the "${label}" list has no option "${want}". Nothing was saved. Pick another value in the portal.`,
    );
  }
  const at = await loc(scope, mark).evaluate((el) => (el as HTMLSelectElement).selectedIndex);
  if (hits.some((h) => h.index === at)) return false;
  await loc(scope, mark).selectOption({ index: hits[0].index });
  return true;
}

/** Types a value into a box: clears it first, then leaves the box so the page sees the change. */
export async function typeText(scope: Scope, mark: string, value: string, label = 'a box') {
  const l = loc(scope, mark);
  const state = await l.evaluate((el) => ({ readOnly: (el as HTMLInputElement).readOnly === true, disabled: (el as HTMLInputElement).disabled === true }));
  if (state.readOnly || state.disabled) {
    throw new SiteStop(`"${label}" is locked`, `The site doesn't let anyone type in "${label}" right now, so the tool stopped. Nothing more was changed.`);
  }
  await l.fill(value);
  await l.evaluate((el) => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
    (el as HTMLElement).blur();
  });
}

/**
 * Writes a date into a date box. Some date boxes only take a date from their calendar;
 * the tool then sets the date the same way the calendar does. A switched-off box stops the tool.
 */
export async function typeDate(scope: Scope, mark: string, value: string, label: string) {
  const l = loc(scope, mark);
  const state = await l.evaluate((el) => ({ readOnly: (el as HTMLInputElement).readOnly === true, disabled: (el as HTMLInputElement).disabled === true }));
  if (state.disabled) {
    throw new SiteStop(`"${label}" is locked`, `The site doesn't let anyone change "${label}" right now, so the tool stopped. Nothing more was changed.`);
  }
  if (!state.readOnly) {
    await l.fill(value);
  } else {
    await l.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  await l.evaluate((el) => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
    (el as HTMLElement).blur();
  });
  // A calendar that opened on the page is closed again.
  await scope.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))).catch(() => undefined);
}

/** Ticks or unticks a box. The caller reads the box again afterwards; a page may reload when it's ticked. */
export async function setChecked(scope: Scope, mark: string, on: boolean) {
  const l = loc(scope, mark);
  if ((await l.isChecked().catch(() => null)) === on) return;
  try {
    if (on) await l.check({ timeout: 5000 });
    else await l.uncheck({ timeout: 5000 });
  } catch {
    // A styled tick box hides the real one: click the real one the way the page's own label does.
    const now = await l.isChecked().catch(() => null);
    if (now !== null && now !== on) await l.evaluate((el) => (el as HTMLInputElement).click());
  }
}

export async function attachFile(scope: Scope, mark: string, filePath: string) {
  await loc(scope, mark).setInputFiles(filePath);
}

/** Buttons the tool never presses, whatever happens. */
const NEVER = /\b(complete|completed|print|back|cancel|delete|remove|edit|logout|log ?out|sign ?out|go to new registration form|upload)\b/i;

export interface ButtonOptions {
  where: string;
  prefix?: boolean;
  /** Search inside this element only (a table row, for example). */
  within?: string;
  timeout?: number;
  /** Take the first button with this name that comes after this element, never one before it. */
  after?: string;
  /** The button that belongs with this box: the one in the smallest part of the page around it. */
  near?: string;
}

/** The one button or link named `name`. */
export async function findButton(scope: Scope, name: string, opts: ButtonOptions): Promise<string> {
  await ensureHelpers(scope);
  let count = 0;
  const hit = await poll(opts.timeout ?? 15_000, async () => {
    const list = opts.near
      ? await scope.evaluate(([n, m, p]) => (window as Win).__portal!.buttonsNear(n, m, p), [name, opts.near, !!opts.prefix] as const)
      : await scope.evaluate(([n, o]) => (window as Win).__portal!.findButtons(n, o), [name, { prefix: opts.prefix, within: opts.within }] as const);
    count = list.length;
    if (opts.after) {
      // Two buttons with the same name (two Submits, for example): the first one after the anchor, never one before it.
      const after = opts.after;
      const marks = list.map((b) => b.mark);
      return scope.evaluate(
        ([a, ms]) => {
          const anchor = document.querySelector(`[data-portal="${a}"]`);
          if (!anchor) return null;
          for (const m of ms) {
            const el = document.querySelector(`[data-portal="${m}"]`);
            if (el && anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return m;
          }
          return null;
        },
        [after, marks] as const,
      );
    }
    return list.length === 1 ? list[0].mark : null;
  });
  if (!hit) {
    if (count > 1) {
      throw new SiteChanged(`More than one "${name}" button`, `On ${opts.where}, ${count} buttons are named "${name}", so the tool stopped rather than guess. Nothing was changed.`);
    }
    throw new SiteChanged(
      `Couldn't find the "${name}" button`,
      `The tool couldn't find "${name}" on ${opts.where}. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`,
    );
  }
  return hit;
}

/**
 * Presses a button or link. The name is checked again first, and a few buttons are never pressed:
 * Complete, Print, Back, Cancel, Delete, Edit, Upload and the like.
 */
export async function press(scope: Scope, mark: string, expected: string, opts: { allow?: RegExp } = {}) {
  const info = await scope.evaluate((m) => {
    const el = document.querySelector(`[data-portal="${m}"]`) as HTMLElement | null;
    if (!el) return null;
    const name = el instanceof HTMLInputElement ? el.value || el.title || el.alt || '' : (el.textContent || '').replace(/\s+/g, ' ').trim() || el.title || '';
    const disabled = (el as HTMLInputElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
    return { name, disabled };
  }, mark);
  if (!info) throw new SiteStop('The page changed', `The "${expected}" button disappeared before the tool could press it. Nothing was pressed.`);
  if (canon(info.name) !== canon(expected)) {
    throw new SiteStop('The button changed', `The tool expected "${expected}" but found "${clean(info.name)}". Nothing was pressed.`);
  }
  if (NEVER.test(info.name) && !(opts.allow && opts.allow.test(info.name))) {
    throw new SiteStop('A button the tool never presses', `The tool doesn't press "${clean(info.name)}". Nothing was pressed.`);
  }
  if (info.disabled) {
    throw new SiteStop(`"${expected}" is switched off`, `The "${expected}" button can't be pressed on the site right now. Nothing was pressed.`);
  }
  // Pressed a moment later, so a popup it opens can't block the tool.
  await scope.evaluate((m) => {
    const el = document.querySelector(`[data-portal="${m}"]`) as HTMLElement | null;
    if (el) setTimeout(() => el.click(), 0);
  }, mark);
}

/** A visible table with all these headings. With several, the first one that has rows. */
export async function findTable(scope: Scope, headings: string[], where: string, timeout = 15_000): Promise<TableInfo> {
  await ensureHelpers(scope);
  const hit = await poll(timeout, async () => {
    const list = await scope.evaluate((h) => (window as Win).__portal!.findTables(h), headings);
    return list.length ? list[0] : null;
  });
  if (!hit) {
    throw new SiteChanged(
      "Couldn't find the table",
      `The tool couldn't find the table with ${headings.map((h) => `"${h}"`).join(', ')} on ${where}. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`,
    );
  }
  return hit;
}

export async function findTableIfAny(scope: Scope, headings: string[]): Promise<TableInfo | null> {
  await ensureHelpers(scope);
  const list = await scope.evaluate((h) => (window as Win).__portal!.findTables(h), headings).catch(() => [] as TableInfo[]);
  return list.length ? list[0] : null;
}

/** A row's cell under a heading. */
export function cell(table: TableInfo, row: { cells: string[] }, heading: string): string {
  const i = table.headers.map(canon).indexOf(canon(heading));
  return i >= 0 ? (row.cells[i] ?? '') : '';
}

/** Letters-and-digits pieces of a cell, so "APP123 / A1234567" has the passport as a whole piece. */
export function tokens(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export async function pageHasText(scope: Scope, text: string): Promise<boolean> {
  await ensureHelpers(scope);
  const all = await scope.evaluate(() => (window as Win).__portal!.pageText()).catch(() => '');
  return all.includes(canon(text));
}

export async function waitForText(scope: Scope, text: string, timeout: number): Promise<boolean> {
  return (await poll(timeout, async () => ((await pageHasText(scope, text)) ? true : null))) === true;
}

/** Which tab of a tab strip is showing, from a list of tab names. '' if the tool can't tell. */
export async function activeTab(scope: Scope, names: string[]): Promise<string> {
  await ensureHelpers(scope);
  return scope.evaluate((list) => {
    const P = (window as Win).__portal!;
    const want = list.map((n) => P.canon(n));
    const hits: { name: string; active: boolean }[] = [];
    document.querySelectorAll('a,li,span,button,td,div,input[type=submit],input[type=button]').forEach((el) => {
      if (!P.visible(el)) return;
      const text = el instanceof HTMLInputElement ? el.value : el.textContent || '';
      const c = P.canon(text);
      const i = want.indexOf(c);
      if (i < 0) return;
      // A class like "active", "nav-link active", "ajax__tab_active", "tabActive" or "selected" marks the open tab;
      // "inactive" and "unselected" don't.
      const marks = (c: string) =>
        c.split(/\s+/).some((t) => !/^(in|un|not|non)[-_]?(active|selected|current)/i.test(t) && /(^|[-_]|[a-z])(active|selected|current)($|[-_])/i.test(t));
      let active = false;
      let cur: Element | null = el;
      for (let n = 0; cur && n < 4; n += 1, cur = cur.parentElement) {
        const cls = typeof cur.className === 'string' ? cur.className : '';
        if (marks(cls) || cur.getAttribute('aria-selected') === 'true' || cur.getAttribute('aria-current') === 'page') {
          active = true;
          break;
        }
      }
      hits.push({ name: list[i], active });
    });
    const act = Array.from(new Set(hits.filter((h) => h.active).map((h) => h.name)));
    return act.length === 1 ? act[0] : '';
  }, names);
}

/* ------------------------------------------------------------ tick-one lists */

export interface RadioOptions {
  where: string;
  /** The end of the list's name on the real site ("rbp_visatype"). Tried before the label. */
  names?: string[];
  /** Choices the list must have, so the tool knows it found the right one. */
  mustInclude?: string[];
  timeout?: number;
}

async function lookRadio(scope: Scope, labels: string[], opts: RadioOptions): Promise<RadioGroup[]> {
  await ensureHelpers(scope);
  if (opts.names?.length) {
    const byName = await scope.evaluate((n) => (window as Win).__portal!.radioGroupsByName(n), opts.names);
    if (byName.length) return byName;
  }
  const out: RadioGroup[] = [];
  for (const label of labels) {
    const first = await lookField(scope, label, { where: opts.where, kinds: ['radio'] });
    for (const f of first) {
      const g = await scope.evaluate((m) => (window as Win).__portal!.radioGroupOf(m), f.mark);
      if (g && !out.some((o) => o.name === g.name)) out.push(g);
    }
    if (out.length) break;
  }
  return out;
}

/**
 * The one tick-one list (radio buttons) named by one of `labels`, such as Visa Type with
 * Local / Student Visa[Airport Pickup] / Social Visit[No Airport Pickup]. Stops if there is none or more than one.
 */
export async function findRadioGroup(scope: Scope, labels: string[], opts: RadioOptions): Promise<RadioGroup> {
  let last: RadioGroup[] = [];
  const hit = await poll(opts.timeout ?? 15_000, async () => {
    last = await lookRadio(scope, labels, opts);
    return last.length === 1 && last[0].options.length ? last[0] : null;
  });
  const label = labels[0];
  if (!hit) {
    if (last.length > 1) {
      throw new SiteChanged(`"${label}" appears more than once`, `On ${opts.where}, ${last.length} lists are named "${label}", so the tool stopped rather than guess. Nothing was changed.`);
    }
    throw new SiteChanged(
      `Couldn't find "${label}"`,
      `The tool couldn't find the "${label}" choices on ${opts.where}. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`,
    );
  }
  const have = hit.options.map((o) => o.label);
  const missing = (opts.mustInclude ?? []).filter((m) => !have.includes(m));
  if (missing.length) {
    throw new SiteChanged(
      `"${label}" has different choices`,
      `On ${opts.where}, "${label}" doesn't offer ${missing.map((m) => `"${m}"`).join(', ')}, so it may not be the right list. Nothing was changed.`,
    );
  }
  const dup = have.find((t, i) => have.indexOf(t) !== i);
  if (dup !== undefined) throw new SiteChanged(`"${label}" lists "${dup}" twice`, `On ${opts.where}, "${label}" offers "${dup}" more than once, so the tool stopped rather than guess.`);
  return hit;
}

/** The choice that is ticked now, read from the page ('' when none is). */
export async function radioValue(scope: Scope, group: RadioGroup): Promise<string> {
  const ticked: string[] = [];
  for (const o of group.options) {
    const v = await valueOf(scope, o.mark);
    if (v.value === 'checked') ticked.push(o.label);
  }
  if (ticked.length > 1) throw new SiteStop('More than one choice is ticked', `"${ticked.join('" and "')}" are both ticked. Look at the site window.`);
  return ticked[0] ?? '';
}

/**
 * Ticks the choice whose words are exactly `text` ("Student Visa[Airport Pickup]", never "Social Visit…").
 * Returns true if the choice changed (the page may post back).
 */
export async function pickRadio(scope: Scope, group: RadioGroup, text: string, label: string, where: string): Promise<boolean> {
  const want = clean(text);
  const hits = group.options.filter((o) => o.label === want);
  if (hits.length === 0) {
    throw new SiteStop(`"${want}" isn't a choice`, `On ${where}, "${label}" has no choice "${want}". Nothing was saved. Pick another value in the portal.`);
  }
  if (hits.length > 1) throw new SiteStop(`"${want}" is listed twice`, `On ${where}, "${label}" has "${want}" more than once, so the tool stopped rather than guess.`);
  if ((await valueOf(scope, hits[0].mark)).value === 'checked') return false;
  const l = loc(scope, hits[0].mark);
  const off = await l.evaluate((el) => (el as HTMLInputElement).disabled === true);
  if (off) throw new SiteStop(`"${label}" is locked`, `The site doesn't let anyone change "${label}" right now, so the tool stopped. Nothing more was changed.`);
  try {
    await l.check({ timeout: 5000 });
  } catch {
    // A page that posts back as soon as the choice is ticked can reload under the click; the caller reads it again.
    const now = await l.isChecked().catch(() => null);
    if (now === false) await l.evaluate((el) => (el as HTMLInputElement).click()).catch(() => undefined);
  }
  return true;
}

/* -------------------------------------------------------------------- tab strips */

/** The header of the tab named `name`, to press it. */
export async function findTab(scope: Scope, name: string, where: string, timeout = 15_000): Promise<string> {
  await ensureHelpers(scope);
  let count = 0;
  const hit = await poll(timeout, async () => {
    const list = await scope.evaluate((n) => (window as Win).__portal!.tabHeaders(n), name);
    count = list.length;
    return list.length === 1 ? list[0] : null;
  });
  if (!hit) {
    if (count > 1) throw new SiteChanged(`More than one "${name}" tab`, `On ${where}, ${count} tabs are named "${name}", so the tool stopped rather than guess. Nothing was changed.`);
    throw new SiteChanged(
      `Couldn't find the "${name}" tab`,
      `The tool couldn't find the "${name}" tab on ${where}. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`,
    );
  }
  return hit;
}

export async function highlight(scope: Scope, mark: string) {
  await scope.evaluate((m) => (window as Win).__portal?.highlight(m), mark).catch(() => undefined);
}

/** Red or warning messages a page shows after a button, for the staff to read in the portal. */
/**
 * Words the page shows that match `re`, each once (a message with no telltale id or class, such as LOS's
 * "No data found. Please select a different stage."). Only text that shows; never inside lists or boxes.
 */
export async function shownTexts(scope: Scope, re: RegExp): Promise<string[]> {
  await ensureHelpers(scope);
  return scope
    .evaluate(
      ([src, flags]) => {
        const P = (window as Win).__portal!;
        const want = new RegExp(src, flags);
        const out: string[] = [];
        document.querySelectorAll('body *').forEach((el) => {
          if (el.closest('script,style,noscript,select,option,textarea')) return;
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (own && own.length < 200 && want.test(own) && P.visible(el) && !out.includes(own)) out.push(own);
        });
        return out.slice(0, 6);
      },
      [re.source, re.flags] as const,
    )
    .catch(() => [] as string[]);
}

export async function pageMessages(scope: Scope): Promise<string[]> {
  await ensureHelpers(scope);
  return scope
    .evaluate(() => {
      const P = (window as Win).__portal!;
      const out: string[] = [];
      document.querySelectorAll('[id*="valid" i],[class*="valid" i],[class*="error" i],[id*="error" i],[class*="alert" i],[id*="msg" i],[id*="Msg"],[class*="message" i],span[style*="red" i],font[color="red" i]').forEach((el) => {
        if (!P.visible(el)) return;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 200 && !out.includes(t)) out.push(t);
      });
      return out.slice(0, 6);
    })
    .catch(() => [] as string[]);
}

/**
 * After the site refused a save: the fields it asks for, from its checks and its words (see siteNeeds in inpage.ts).
 * `portal` lists the labels of fields it flagged that the portal fills itself.
 */
export async function askedFields(
  scope: Scope,
  messages: string[],
  skip: string[],
  opts: { marked: boolean; guess: boolean },
): Promise<{ fields: SiteNeed[]; portal: string[] }> {
  await ensureHelpers(scope);
  return scope.evaluate(([m, s, o]) => (window as Win).__portal!.siteNeeds(m, s, o), [messages, skip, opts] as const);
}

/** A field by its id, or a tick-one list by its name, as askedFields named it. */
export async function fieldByKey(scope: Scope, key: string) {
  await ensureHelpers(scope);
  return scope.evaluate((k) => (window as Win).__portal!.fieldByKey(k), key);
}

/** Rows (in any table) with a cell whose whole text is `text`. */
export async function rowsWithCell(scope: Scope, text: string): Promise<string[]> {
  await ensureHelpers(scope);
  return scope.evaluate((t) => (window as Win).__portal!.rowsWithCell(t), text);
}

export async function fileLinkIn(scope: Scope, rowMark: string, skipText: string) {
  await ensureHelpers(scope);
  return scope.evaluate(([r, s]) => (window as Win).__portal!.fileLinkIn(r, s), [rowMark, skipText] as const);
}

/** The text of each cell of a table row, read the same way as findTable reads rows. Null if the row is gone. */
export async function rowCells(scope: Scope, rowMark: string): Promise<string[] | null> {
  await ensureHelpers(scope);
  return scope.evaluate((r) => (window as Win).__portal!.rowCells(r), rowMark).catch(() => null);
}

export async function rowControls(scope: Scope, rowMark: string): Promise<Found[]> {
  await ensureHelpers(scope);
  return scope.evaluate((r) => (window as Win).__portal!.rowControls(r), rowMark);
}

/** The text after a label with no box, e.g. a student card. Stops if the label shows more than once. */
export async function textAfter(scope: Scope, label: string, where: string): Promise<string> {
  await ensureHelpers(scope);
  const list = await scope.evaluate((l) => (window as Win).__portal!.textAfter(l), label);
  if (list.length === 0) {
    throw new SiteChanged(`Couldn't find "${label}"`, `The tool couldn't find "${label}" on ${where}. Nothing was changed.`);
  }
  if (new Set(list).size > 1) {
    throw new SiteChanged(`"${label}" appears more than once`, `"${label}" shows different values on ${where}, so the tool stopped rather than guess.`);
  }
  return list[0];
}

/**
 * What the page shows for a label: the box under it (its mark), or the text written there ('' for nothing).
 * Null when the label isn't on the page. Stops if the label shows more than once.
 */
export async function shownValue(scope: Scope, label: string, where: string, prefix = true): Promise<{ box: string; value: string } | null> {
  await ensureHelpers(scope);
  const list = await scope.evaluate(([l, p]) => (window as Win).__portal!.shownAfter(l, p), [label, prefix] as const);
  if (list.length === 0) return null;
  if (list.length > 1) {
    throw new SiteChanged(`"${label}" appears more than once`, `On ${where}, "${label}" shows ${list.length} times, so the tool stopped rather than guess. Nothing was changed.`);
  }
  return list[0];
}

/** The one tick box named `label`, whether its name comes before or after it. */
export async function findCheckbox(scope: Scope, label: string, where: string, timeout = 15_000): Promise<string> {
  const byLabel = await findFieldIfAny(scope, label, { where, kinds: ['checkbox'], timeout: 0 });
  if (byLabel) return byLabel;
  await ensureHelpers(scope);
  let last: string[] = [];
  const hit = await poll(timeout, async () => {
    last = await scope.evaluate((l) => {
      const P = (window as Win).__portal!;
      const want = P.canon(l);
      const out: string[] = [];
      document.querySelectorAll('input[type=checkbox]').forEach((box) => {
        if (!P.visible(box)) return;
        // The nearest wrapper that holds only this tick box, and its words.
        let cur: Element | null = box.parentElement;
        for (let n = 0; cur && n < 3; n += 1, cur = cur.parentElement) {
          if (cur.querySelectorAll('input[type=checkbox]').length !== 1) break;
          if (P.canon(cur.textContent || '') === want) {
            out.push(P.mark(box));
            break;
          }
        }
      });
      return out;
    }, label);
    return last.length === 1 ? last[0] : null;
  });
  if (!hit) {
    if (last.length > 1) throw new SiteChanged(`"${label}" appears more than once`, `On ${where}, ${last.length} tick boxes are named "${label}", so the tool stopped rather than guess.`);
    throw new SiteChanged(`Couldn't find "${label}"`, `The tool couldn't find the "${label}" tick box on ${where}. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`);
  }
  return hit;
}

/** The one visible dropdown that has this exact option, such as "Passport Received From Student". */
export async function findSelectWithOption(scope: Scope, option: string, where: string, timeout = 15_000): Promise<string> {
  await ensureHelpers(scope);
  let last: string[] = [];
  const hit = await poll(timeout, async () => {
    last = await scope.evaluate((o) => {
      const P = (window as Win).__portal!;
      const out: string[] = [];
      document.querySelectorAll('select').forEach((sel) => {
        if (!P.visible(sel)) return;
        if (Array.from((sel as HTMLSelectElement).options).some((x) => (x.text || '').replace(/\s+/g, ' ').trim() === o)) out.push(P.mark(sel));
      });
      return out;
    }, option);
    return last.length === 1 ? last[0] : null;
  });
  if (!hit) {
    if (last.length > 1) throw new SiteChanged('More than one list', `On ${where}, ${last.length} lists have "${option}", so the tool stopped rather than guess.`);
    throw new SiteChanged(`Couldn't find "${option}"`, `The tool couldn't find a list with "${option}" on ${where}. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`);
  }
  return hit;
}

/** The one text box just before a button, in the same small group (a search box and its Search button). */
export async function inputBeforeButton(scope: Scope, buttonMark: string): Promise<string | null> {
  await ensureHelpers(scope);
  return scope.evaluate((b) => {
    const P = (window as Win).__portal!;
    const btn = document.querySelector(`[data-portal="${b}"]`);
    if (!btn) return null;
    let cur: Element | null = btn.parentElement;
    for (let n = 0; cur && n < 3; n += 1, cur = cur.parentElement) {
      const boxes = Array.from(cur.querySelectorAll('input')).filter(
        (i) =>
          ['text', 'search', ''].includes((i as HTMLInputElement).type) &&
          P.visible(i) &&
          !!(i.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING),
      );
      if (boxes.length === 1) return P.mark(boxes[0]);
      if (boxes.length > 1) return null;
    }
    return null;
  }, buttonMark);
}

/** Text near a label, or null when the label isn't on the page. */
export async function textAfterIfAny(scope: Scope, label: string, where: string): Promise<string | null> {
  try {
    return await textAfter(scope, label, where);
  } catch (e) {
    if (e instanceof SiteChanged && /Couldn't find/.test(e.title)) return null;
    throw e;
  }
}
