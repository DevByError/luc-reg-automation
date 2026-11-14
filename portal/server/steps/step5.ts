/**
 * Step 5: Passport Movement Control. The staff fills Passport Collection and presses Submit;
 * the tool then exports the holding letter and moves the passport to its first stage.
 */
import type { Frame, Page } from 'playwright-core';
import type { CollectionField, CollectionRead, CollectionShown, CollectionValues, DocFile, ReadBack, SaveResult, StageRows, StageView } from '../../shared/ops';
import { assertLoggedIn, existingPage, expectDialogs, openPage, pathOf, settle, sleep, takeDialogs } from '../browser';
import { PAGES, WAIT } from '../config';
import { SiteChanged, SiteStop } from '../errors';
import { saveDoc } from '../files';
import {
  activeTab,
  canon,
  cell,
  choices,
  fieldState,
  findButton,
  findCheckbox,
  findField,
  findFieldIfAny,
  findSelectWithOption,
  findTab,
  findTable,
  findTableIfAny,
  loc,
  pageMessages,
  press,
  rowCells,
  rowControls,
  selectText,
  setChecked,
  shownTexts,
  textAfter,
  typeDate,
  typeText,
  valueOf,
} from '../find';
import type { TableInfo } from '../find';
import { exportReportPdf } from '../obtain';
import { WHERE, needPage, samePassport, stopOnUnknownDialogs } from './common';

const SEARCH_LABEL = 'Passport / Student ID';
const TABS = ['Passport Collection', 'Passport Movement Stages'];
const PASSPORT_TYPE = 'Passport Type';
const NEW_YEAR_1 = 'New(Year 1)';
const CONFIRM = 'Confirm Transaction';
const STAGE = 'Passport Received From Student';
/** The next stage. Chosen only to make LOS show "Passport Received From Student" again; nothing is done on it. */
const INSO = 'Passport Received by INSO (For Processing)';
/** What LOS shows when a stage lists nobody: "No data found. Please select a different stage." / "No data available for this stage." */
const NO_DATA = /no data (found|available)/i;

/**
 * Fields the site fills by itself. The tool shows them and fills only an empty one, with the staff's value.
 * The ids are the site's own (seen on the real page); the label is used if an id isn't there.
 */
const SITE_FIELDS: { key: string; label: string; ids: string[] }[] = [
  { key: 'passportNumber', label: 'Passport Number', ids: ['txtpass'] },
  { key: 'dateOfBirth', label: 'Date Of Birth', ids: ['DateControl1'] },
  { key: 'contactNumber', label: 'Contact Number', ids: ['txtcontactno'] },
  { key: 'email', label: 'Email-ID', ids: ['txtemailid'] },
  { key: 'passportIssueDate', label: 'Passport Issue Date', ids: ['txtpassissudt'] },
  { key: 'passportExpiryDate', label: 'Passport Expiry Date', ids: ['txtpassexp'] },
  { key: 'passportIssuedPlace', label: 'Passport Issued Place', ids: ['txtpassportissuedplace'] },
  { key: 'methodOfLastEntry', label: 'Method of Last Entry', ids: ['ddlmetflastentry'] },
];

/** The staff's fields, in the order they are filled and read back. The site writes dates yyyy-mm-dd. */
const STAFF: { key: Exclude<keyof CollectionShown, 'passportType'>; label: string; ids: string[]; date?: true }[] = [
  { key: 'remarks', label: 'Remarks', ids: ['txtpasscs'] },
  { key: 'lastVisaRef', label: 'Last Visa Reference No', ids: ['txtlastvisarefno'] },
  { key: 'issueDate', label: 'Date of Issue Last Visa', ids: ['txtvisaissuedt'], date: true },
  { key: 'lastEntryDate', label: 'Date of Last Entry', ids: ['txtdtlastentry'], date: true },
  { key: 'expiryDate', label: 'Date of Expiry Active Visa', ids: ['txtactvisaexp'], date: true },
];
const staffFields = (v: CollectionValues) => STAFF.map((f) => ({ ...f, value: f.date ? v[f.key] : v[f.key].trim() }));

async function staffBox(page: Page, f: (typeof STAFF)[number], timeout = 0) {
  return findField(page, f.label, { where: WHERE.collection, kinds: ['text', 'date'], ids: f.ids, timeout });
}

/* --------------------------------------------------------- Passport Collection */

let loadedFor = '';

async function onCollection(page: Page) {
  const tab = await activeTab(page, TABS);
  if (tab && tab !== 'Passport Collection') {
    throw new SiteStop('Not on Passport Collection', `Passport Movement Control shows the ${tab} tab, not Passport Collection. Nothing was changed.`);
  }
}

async function passportTypeBox(page: Page, timeout = 0) {
  return findField(page, PASSPORT_TYPE, { where: WHERE.collection, kinds: ['select'], mustInclude: [NEW_YEAR_1], ids: ['ddlpassporttype'], timeout });
}

/** The form's Passport Number: a box, or text when the site shows it without a box. */
async function formPassport(page: Page): Promise<string> {
  const box = await findFieldIfAny(page, 'Passport Number', { where: WHERE.collection, kinds: ['text'], ids: ['txtpass'] });
  if (box) return (await valueOf(page, box)).value.trim();
  return textAfter(page, 'Passport Number', WHERE.collection);
}

/** The form is still the one for this student. */
async function requireStudent(page: Page) {
  if (!loadedFor) throw new SiteStop('Load the form again', 'Press Try again on step 5 to load the Passport Collection form again.');
  const shown = await formPassport(page);
  if (!samePassport(shown, loadedFor)) {
    throw new SiteStop('The form is for another passport', `The Passport Collection form now shows ${shown || 'no passport'}, not ${loadedFor}. Nothing was changed.`, [
      { field: 'Passport Number', expected: loadedFor, actual: shown || '(empty)' },
    ]);
  }
}

export async function open(): Promise<true> {
  const page = await openPage('step5', PAGES.passportMovement);
  await findField(page, SEARCH_LABEL, { where: WHERE.collection, kinds: ['text'], timeout: 20_000 });
  return true;
}

/** Passport → Submit, which only loads the form. Always from a fresh page, so trying again is safe. */
export async function load({ passport }: { passport: string }): Promise<CollectionRead> {
  loadedFor = '';
  const page = await openPage('step5', PAGES.passportMovement);
  await onCollection(page);
  const box = await findField(page, SEARCH_LABEL, { where: WHERE.collection, kinds: ['text'], timeout: 20_000 });
  await typeText(page, box, passport, SEARCH_LABEL);
  if (!samePassport((await valueOf(page, box)).value, passport)) {
    throw new SiteStop('The search box shows something else', `The "${SEARCH_LABEL}" box did not keep the passport. Nothing was changed.`);
  }
  expectDialogs('step5', []);
  await press(page, await findButton(page, 'Submit', { where: WHERE.collection, after: box }), 'Submit');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  await stopOnUnknownDialogs('step5', WHERE.collection, 'Check the passport number.');
  let typeBox: string;
  try {
    typeBox = await passportTypeBox(page, 30_000);
  } catch (e) {
    const msgs = await pageMessages(page);
    if (e instanceof SiteChanged && msgs.length) {
      throw new SiteStop('The form did not load', `After Submit the site says: "${msgs.join('" / "')}". Check the passport number.`);
    }
    throw e;
  }
  const shown = await formPassport(page);
  if (!samePassport(shown, passport)) {
    throw new SiteStop('The form is for another passport', `The Passport Collection form shows ${shown || 'no passport'}, not ${passport}. The tool stopped.`, [
      { field: 'Passport Number', expected: passport, actual: shown || '(empty)' },
    ]);
  }
  loadedFor = passport;
  const fields: CollectionField[] = [];
  for (const f of SITE_FIELDS) {
    if (f.key === 'passportNumber') {
      fields.push({ key: f.key, label: f.label, value: shown, locked: true });
      continue;
    }
    const mark = await findFieldIfAny(page, f.label, { where: WHERE.collection, ids: f.ids });
    if (!mark) continue;
    const st = await fieldState(page, mark);
    fields.push({ key: f.key, label: f.label, value: st.value, locked: st.locked || undefined, options: st.options });
  }
  // What the site already has in the staff's fields, so the portal can show it.
  const current: CollectionShown = { passportType: (await fieldState(page, typeBox)).value, remarks: '', lastVisaRef: '', issueDate: '', lastEntryDate: '', expiryDate: '' };
  for (const f of STAFF) current[f.key] = (await fieldState(page, await staffBox(page, f))).value;
  return { fields, passportTypeOptions: await choices(page, typeBox), current };
}

/**
 * Submit again: back to the Passport Collection tab of the same page, as the staff does by hand. True when it shows
 * the form for this passport; false when it doesn't show the form (the tool then loads it again).
 */
export async function collectionTab({ passport }: { passport: string }): Promise<boolean> {
  const page = existingPage('step5');
  if (!page || pathOf(page.url()) !== PAGES.passportMovement.toLowerCase()) return false;
  if ((await activeTab(page, TABS)) !== 'Passport Collection') {
    expectDialogs('step5', []);
    await press(page, await findTab(page, 'Passport Collection', 'Passport Movement Control'), 'Passport Collection');
    await settle(page, WAIT.save);
    await assertLoggedIn(page);
    await stopOnUnknownDialogs('step5', WHERE.collection);
  }
  if ((await activeTab(page, TABS)) !== 'Passport Collection') return false;
  if (!(await findFieldIfAny(page, PASSPORT_TYPE, { where: WHERE.collection, kinds: ['select'], ids: ['ddlpassporttype'], timeout: 5000 }))) return false;
  const shown = await formPassport(page);
  if (!shown) return false;
  if (!samePassport(shown, passport)) {
    throw new SiteStop('The form is for another passport', `The Passport Collection form shows ${shown}, not ${passport}. Nothing was submitted.`, [
      { field: 'Passport Number', expected: passport, actual: shown },
    ]);
  }
  loadedFor = passport;
  return true;
}

/** Fills the staff's values, then the site's empty fields. A field the site already filled is never changed. */
export async function fill({ values }: { values: CollectionValues }): Promise<true> {
  const page = needPage('step5', WHERE.collection);
  await onCollection(page);
  await requireStudent(page);
  if (await selectText(page, await passportTypeBox(page), values.passportType, PASSPORT_TYPE, WHERE.collection)) await settle(page, WAIT.save);
  for (const f of staffFields(values)) {
    const box = await staffBox(page, f);
    if (f.date) await typeDate(page, box, f.value, f.label);
    else await typeText(page, box, f.value, f.label);
    await settle(page);
  }
  for (const f of SITE_FIELDS) {
    const v = (values.siteFill[f.key] ?? '').trim();
    if (!v || f.key === 'passportNumber') continue;
    const mark = await findField(page, f.label, { where: WHERE.collection, ids: f.ids, timeout: 0 });
    const st = await fieldState(page, mark);
    if (st.value) continue;
    if (st.locked) throw new SiteStop(`"${f.label}" is locked`, `"${f.label}" is empty on the site, but the site doesn't let anyone fill it. Nothing was submitted.`);
    if (st.kind === 'select') {
      if (await selectText(page, mark, v, f.label, WHERE.collection)) await settle(page, WAIT.save);
    } else if (st.kind === 'date') {
      await typeDate(page, mark, v, f.label);
    } else {
      await typeText(page, mark, v, f.label);
    }
    await settle(page);
  }
  return true;
}

/** Every value as the site shows it now, by field name. */
export async function readBack({ values }: { values: CollectionValues }): Promise<ReadBack> {
  const page = needPage('step5', WHERE.collection);
  await requireStudent(page);
  const out: ReadBack = [[PASSPORT_TYPE, (await valueOf(page, await passportTypeBox(page))).value]];
  for (const f of staffFields(values)) {
    out.push([f.label, (await valueOf(page, await staffBox(page, f))).value.trim()]);
  }
  for (const f of SITE_FIELDS) {
    if (!(values.siteFill[f.key] ?? '').trim() || f.key === 'passportNumber') continue;
    const mark = await findField(page, f.label, { where: WHERE.collection, ids: f.ids, timeout: 0 });
    out.push([f.label, (await fieldState(page, mark)).value]);
  }
  return out;
}

async function confirmBox(page: Page) {
  return findCheckbox(page, CONFIRM, WHERE.collection, 5000);
}

/** Ticks Confirm Transaction. Only after every value was read back and matched. */
export async function confirm(): Promise<true> {
  const page = needPage('step5', WHERE.collection);
  await onCollection(page);
  await requireStudent(page);
  const box = await confirmBox(page);
  if ((await valueOf(page, box)).value !== 'checked') {
    await setChecked(page, box, true);
    await settle(page, WAIT.save);
  }
  if ((await valueOf(page, await confirmBox(page))).value !== 'checked') {
    throw new SiteStop(`${CONFIRM} is not ticked`, `The tool ticked "${CONFIRM}" but the site doesn't show it ticked. Submit was not pressed.`);
  }
  return true;
}

let framesBefore = new Map<Frame, string>();

/** Submit, pressed by the staff: the first Submit after Confirm Transaction. Nothing else is pressed. */
export async function submit(): Promise<SaveResult> {
  const page = needPage('step5', WHERE.collection);
  await onCollection(page);
  await requireStudent(page);
  const box = await confirmBox(page);
  if ((await valueOf(page, box)).value !== 'checked') {
    throw new SiteStop(`${CONFIRM} is not ticked`, `"${CONFIRM}" isn't ticked on the site, so Submit was not pressed.`);
  }
  const btn = await findButton(page, 'Submit', { where: WHERE.collection, after: box });
  framesBefore = new Map(page.frames().map((f) => [f, f.url()]));
  expectDialogs('step5', []);
  await press(page, btn, 'Submit');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const seen = takeDialogs('step5');
  const last = seen[seen.length - 1];
  if (!last) return {};
  return last.heldId ? { popup: last.text, popupId: last.heldId } : { popup: seen.map((d) => d.text).join(' / ') };
}

/* ------------------------------------------------------------- the holding letter */

let holding: Frame | null = null;

/** A frame that is new since Submit (or loaded something new) and shows the student's passport. */
async function findHolding(page: Page, passport: string): Promise<Frame | null> {
  const want = canon(passport);
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    const before = framesBefore.get(f);
    if (before !== undefined && before === f.url()) continue;
    const ok = await f
      .evaluate((w) => (document.body ? document.body.innerText : '').toLowerCase().replace(/[^a-z0-9]+/g, '').includes(w), want)
      .catch(() => false);
    if (ok) return f;
  }
  return null;
}

/** The part of the report viewer that has Export: the frame itself or one around it. */
async function exportScope(frame: Frame): Promise<Frame> {
  for (let f: Frame | null = frame; f && f.parentFrame(); f = f.parentFrame()) {
    const has = await f
      .evaluate(() => {
        const sys = (window as unknown as { Sys?: { Application?: { getComponents?: () => unknown[] } } }).Sys;
        const comps = sys?.Application?.getComponents?.() ?? [];
        if (comps.some((c) => typeof (c as { exportReport?: unknown }).exportReport === 'function')) return true;
        return Array.from(document.querySelectorAll('a,input,button,img,select')).some(
          (el) => /export/i.test(`${el.getAttribute('title') || ''} ${el.getAttribute('alt') || ''} ${(el as HTMLInputElement).value || ''} ${el.textContent || ''}`),
        );
      })
      .catch(() => false);
    if (has) return f;
  }
  return frame;
}

/** Submit shows no popup and opens no page: the letter appears below the form. Waits up to 90 seconds (or `wait` ms). */
export async function holdingWait({ passport, wait = 90_000 }: { passport: string; wait?: number }): Promise<true> {
  const page = needPage('step5', WHERE.collection);
  const end = Date.now() + Math.min(Math.max(wait, 5_000), 90_000);
  holding = null;
  for (;;) {
    const f = await findHolding(page, passport);
    if (f) {
      holding = f;
      break;
    }
    if (Date.now() > end) {
      const msgs = await pageMessages(page);
      throw new SiteStop(
        "The holding letter didn't appear",
        `After Submit, the holding letter with ${passport} didn't show below the form.${msgs.length ? ` The page says: "${msgs.join('" / "')}".` : ''} Look at the site window. Submit was not pressed again.`,
      );
    }
    await sleep(1000);
  }
  await settle(holding, WAIT.save);
  return true;
}

export async function holdingFile({ passport }: { passport: string }): Promise<DocFile> {
  const page = needPage('step5', WHERE.collection);
  if (!holding || holding.isDetached()) holding = await findHolding(page, passport);
  if (!holding) throw new SiteStop('The holding letter is not on the page', 'The tool can no longer see the holding letter below the form. Look at the site window.');
  const scope = await exportScope(holding);
  return saveDoc(passport, 'holding', await exportReportPdf(scope, 'the holding letter'));
}

/** For the save check: the holding letter below the form means Submit went through. */
export async function holdingShows(passport: string): Promise<boolean> {
  const page = existingPage('step5');
  return !!page && !!(await findHolding(page, passport));
}

/* ----------------------------------------------------------- Movement Stages */

export async function stagesTab(): Promise<true> {
  const page = needPage('step5', WHERE.stages);
  if ((await activeTab(page, TABS)) !== 'Passport Movement Stages') {
    expectDialogs('step5', []);
    await press(page, await findTab(page, 'Passport Movement Stages', 'Passport Movement Control'), 'Passport Movement Stages');
    await settle(page, WAIT.save);
    await assertLoggedIn(page);
    await stopOnUnknownDialogs('step5', WHERE.stages);
  }
  await findSelectWithOption(page, STAGE, WHERE.stages, 30_000);
  return true;
}

/** The stage list's option for INSO, in the site's own words. */
async function insoName(page: Page, sel: string): Promise<string> {
  const want = canon('Passport Received by INSO');
  const hit = (await choices(page, sel)).filter((o) => canon(o).startsWith(want));
  if (hit.length !== 1) {
    throw new SiteChanged(`Couldn't find "${INSO}"`, `The stage list on ${WHERE.stages} has no single "${INSO}" choice, so the tool didn't change the stage. Nothing was changed.`);
  }
  return hit[0];
}

/**
 * Chooses a stage (Passport Received From Student unless named). With `refresh`, another stage first, with nothing done
 * there: LOS shows a stage's list again only when the choice changes (the staff does the same by hand with INSO).
 */
export async function stage({ name = STAGE, refresh = false }: { name?: string; refresh?: boolean } = {}): Promise<true> {
  const page = needPage('step5', WHERE.stages);
  const choose = async (want: string) => {
    const sel = await findSelectWithOption(page, STAGE, WHERE.stages, 15_000);
    if (await selectText(page, sel, want, 'Stage', WHERE.stages)) {
      await settle(page, WAIT.save);
      await assertLoggedIn(page);
      await stopOnUnknownDialogs('step5', WHERE.stages);
    }
  };
  if (refresh) {
    const sel = await findSelectWithOption(page, STAGE, WHERE.stages, 15_000);
    await choose(name === STAGE ? await insoName(page, sel) : STAGE);
  }
  await choose(name);
  return true;
}

/**
 * The stage's list, or LOS's own words when the stage lists nobody (then there is no list and no search box).
 * Waits up to 30 seconds for one of them.
 */
async function stageList(page: Page): Promise<{ table: TableInfo | null; empty: string }> {
  const end = Date.now() + 30_000;
  for (;;) {
    const table = await findTableIfAny(page, STAGE_HEADINGS);
    // A list that only says it has nothing ("No data available in table") is no list.
    const rows = table ? table.rows.filter((r) => !(r.cells.filter((c) => c.trim()).length <= 1 && NO_DATA.test(r.cells.join(' ')))) : [];
    if (table && rows.length) return { table, empty: '' };
    const words = await shownTexts(page, NO_DATA);
    if (words.length) return { table: null, empty: words.join(' ') };
    if (table) return { table, empty: '' };
    if (Date.now() > end) {
      await findTable(page, STAGE_HEADINGS, WHERE.stages, 0);
      return { table: null, empty: '' };
    }
    await sleep(500);
  }
}

/**
 * The student's rows on the stage, found with the list's search box: a list that filters as you type, or a box with its
 * own Search button. When LOS shows that the stage lists nobody, there is no list: `empty` has LOS's words.
 */
async function searchStage(page: Page, passport: string): Promise<{ table: TableInfo | null; rows: TableInfo['rows']; empty: string }> {
  const first = await stageList(page);
  if (!first.table) return { table: null, rows: [], empty: first.empty };
  const filter = await page.evaluate(() => {
    const P = (window as unknown as { __portal: { visible: (e: Element) => boolean; mark: (e: Element) => string } }).__portal;
    const el = Array.from(document.querySelectorAll('.dataTables_filter input, .dt-search input, input[type=search]')).filter((e) => P.visible(e));
    return el.length === 1 ? P.mark(el[0]) : null;
  });
  if (filter) {
    await typeText(page, filter, passport, 'Search');
    await sleep(500);
    await settle(page, WAIT.save);
  } else {
    const box = await findField(page, 'Search', { where: WHERE.stages, kinds: ['text'], timeout: 5000 });
    await typeText(page, box, passport, 'Search');
    const btn = await findButton(page, 'Search', { where: WHERE.stages, near: box, timeout: 0 }).catch(() => null);
    expectDialogs('step5', []);
    if (btn) await press(page, btn, 'Search');
    await settle(page, WAIT.save);
    await assertLoggedIn(page);
    await stopOnUnknownDialogs('step5', WHERE.stages);
  }
  // The list shows each student in one cell: "Name: … Student ID: … Passport No: … Academic Year: …".
  const table = await findTable(page, STAGE_HEADINGS, WHERE.stages, 30_000);
  return { table, rows: table.rows.filter((r) => samePassport(passportIn(cell(table, r, 'Student Details')), passport)), empty: '' };
}

const STAGE_HEADINGS = ['Student Details', 'Remark', 'Select'];

/** The passport written after "Passport No:" in a Student Details cell ('' if there is none). */
function passportIn(details: string): string {
  const m = details.match(/Passport\s*No\.?\s*:?\s*([A-Za-z0-9]+)/i);
  return m ? m[1] : '';
}

/** Student Details with its spacing evened out: what tells the student's rows apart. */
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const detailsOf = (table: TableInfo, row: TableInfo['rows'][number]) => tidy(cell(table, row, 'Student Details'));

let stageRow = '';
let stagePassport = '';
/** The Student Details of the row the tool works on. A student with more than one LUC ID has a row for each. */
let stageDetails = '';
/** The Student Details of a row the tool typed in or ticked on this page. Nothing there is saved until Update. */
let touchedDetails = '';

/** A row's cells as they show, each line apart ("Name: …", "Student ID: …"), for the staff to read. */
async function rowLines(page: Page, row: string): Promise<string[]> {
  return loc(page, row).evaluate((tr) =>
    Array.from((tr as HTMLTableRowElement).cells).map((c) =>
      (c.innerText ?? c.textContent ?? '')
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n'),
    ),
  );
}

/**
 * Finds the student's rows. With one row, that is the row. With more (one per LUC ID), the tool works on the row
 * the staff chose (`pick`, its Student Details) and on no other; until then it has no row.
 */
export async function stageSearch({ passport, pick }: { passport: string; pick?: string }): Promise<StageRows> {
  let page = needPage('step5', WHERE.stages);
  if (pick && touchedDetails && touchedDetails !== tidy(pick)) {
    // The tool already typed in or ticked another of the student's rows: a fresh page drops that, as it was never saved.
    page = await openPage('step5', PAGES.passportMovement);
    touchedDetails = '';
    await stagesTab();
    await stage();
  }
  const { table, rows, empty } = await searchStage(page, passport);
  if (!table) {
    stageRow = '';
    stagePassport = '';
    stageDetails = '';
    return { headers: [], rows: [], picked: false, empty };
  }
  const chosen = pick ? rows.filter((r) => detailsOf(table, r) === tidy(pick)) : rows.length === 1 ? rows : [];
  if (chosen.length > 1) {
    throw new SiteStop(
      'Two rows look the same',
      `${chosen.length} of the student's rows show exactly the same Student Details, so the tool can't tell which one to update. Update was not pressed.`,
    );
  }
  stageRow = chosen.length === 1 ? chosen[0].mark : '';
  stagePassport = stageRow ? passport : '';
  stageDetails = stageRow ? detailsOf(table, chosen[0]) : '';
  const shown = await Promise.all(rows.map(async (r) => ({ cells: await rowLines(page, r.mark).catch(() => r.cells), details: detailsOf(table, r) })));
  return { headers: table.headers, rows: shown, picked: !!stageRow, empty: '' };
}

/** The student's row from the last search, still on the page and still showing the same Student Details. */
async function currentRow(page: Page): Promise<string> {
  if (!stageRow) throw new SiteStop('Search again', "The tool lost the student's row. Press Try again to search again.");
  // Its Student Details cell must still say "Passport No: <this passport>", with the same Student ID as when it was found.
  const table = await findTableIfAny(page, STAGE_HEADINGS);
  const row = table?.rows.find((r) => r.mark === stageRow);
  if (!table || !row || !samePassport(passportIn(cell(table, row, 'Student Details')), stagePassport) || detailsOf(table, row) !== stageDetails) {
    stageRow = '';
    throw new SiteStop('The list changed', "The student's row is no longer where it was. Press Try again to search again. Update was not pressed.");
  }
  return stageRow;
}

async function remarkBox(page: Page, row: string): Promise<string> {
  const inRow = (await rowControls(page, row)).filter((c) => c.kind === 'text');
  if (inRow.length === 1) return inRow[0].mark;
  const named = inRow.filter((c) => /remark/i.test(`${c.id} ${c.name}`));
  if (named.length === 1) return named[0].mark;
  if (inRow.length === 0) return findField(page, 'Remark', { where: WHERE.stages, kinds: ['text'], timeout: 0 });
  throw new SiteChanged('More than one box in the row', `The student's row has ${inRow.length} boxes, so the tool can't tell which is the Remark. Nothing was changed.`);
}

/** Clears the Remark box and writes the remark ("new student"); reads it back exactly. */
export async function remark({ remark: want }: { remark: string }): Promise<string> {
  const page = needPage('step5', WHERE.stages);
  const row = await currentRow(page);
  const box = await remarkBox(page, row);
  touchedDetails = stageDetails;
  await typeText(page, box, want, 'Remark');
  await settle(page);
  const now = (await valueOf(page, await remarkBox(page, await currentRow(page)))).value;
  if (now !== want) {
    throw new SiteStop('The Remark box shows something else', `The Remark box shows "${now}", not "${want}". Update was not pressed.`, [
      { field: 'Remark', expected: want, actual: now || '(empty)' },
    ]);
  }
  return now;
}

async function rowTick(page: Page, row: string): Promise<string> {
  const boxes = (await rowControls(page, row)).filter((c) => c.kind === 'checkbox');
  if (boxes.length !== 1) {
    throw new SiteChanged(
      boxes.length ? 'More than one tick box in the row' : 'No Select tick box',
      boxes.length ? `The student's row has ${boxes.length} tick boxes, so the tool stopped rather than guess.` : "The student's row has no Select tick box. Nothing was changed.",
    );
  }
  return boxes[0].mark;
}

/** Tick boxes ticked in the list, other than the student's row. Update applies to every ticked row. */
async function otherTicks(page: Page, row: string): Promise<number> {
  return loc(page, row).evaluate((tr) => {
    const table = tr.closest('table');
    if (!table) return 0;
    return Array.from(table.querySelectorAll('input[type=checkbox]')).filter((b) => (b as HTMLInputElement).checked && !tr.contains(b)).length;
  });
}

export async function select(): Promise<true> {
  const page = needPage('step5', WHERE.stages);
  const row = await currentRow(page);
  const tick = await rowTick(page, row);
  touchedDetails = stageDetails;
  if ((await valueOf(page, tick)).value !== 'checked') {
    await setChecked(page, tick, true);
    await settle(page, WAIT.save);
  }
  const rowNow = await currentRow(page);
  if ((await valueOf(page, await rowTick(page, rowNow))).value !== 'checked') {
    throw new SiteStop('Select is not ticked', "The tool ticked Select on the student's row, but the site doesn't show it ticked. Update was not pressed.");
  }
  const others = await otherTicks(page, rowNow);
  if (others > 0) {
    throw new SiteStop(
      'Another row is ticked',
      `${others} other row${others === 1 ? ' is' : 's are'} also ticked in the list, and Update would change ${others === 1 ? 'it' : 'them'} too. Untick ${others === 1 ? 'it' : 'them'} on the site, then press Try again. Update was not pressed.`,
    );
  }
  return true;
}

/** What the row looked like right before Update, to see afterwards that it changed. */
let beforeUpdate: { passport: string; details: string; cells: string[]; remarkMark: string; remark: string } | null = null;

export async function update({ remark: want }: { remark: string }): Promise<SaveResult> {
  const page = needPage('step5', WHERE.stages);
  // A last look before the click: the student's row, its remark, its tick, and no other tick.
  const row = await currentRow(page);
  const box = await remarkBox(page, row);
  const now = (await valueOf(page, box)).value;
  if (now !== want) {
    throw new SiteStop('The Remark box shows something else', `The Remark box shows "${now}", not "${want}". Update was not pressed.`, [
      { field: 'Remark', expected: want, actual: now || '(empty)' },
    ]);
  }
  if ((await valueOf(page, await rowTick(page, row))).value !== 'checked') throw new SiteStop('Select is not ticked', "The student's row isn't ticked. Update was not pressed.");
  if ((await otherTicks(page, row)) > 0) throw new SiteStop('Another row is ticked', 'Another row is also ticked in the list. Untick it on the site, then press Try again. Update was not pressed.');
  // Update moves the ticked row on from the stage the site shows: it must be "Passport Received From Student".
  const shownStage = (await fieldState(page, await findSelectWithOption(page, STAGE, WHERE.stages, 0))).value;
  if (canon(shownStage) !== canon(STAGE)) {
    throw new SiteStop('Another stage is chosen', `The stage list on the site shows "${shownStage || 'no stage'}", not "${STAGE}". Update was not pressed. Press Try again.`);
  }
  const btn = await findButton(page, 'Update', { where: WHERE.stages });
  const cells = (await rowCells(page, row)) ?? [];
  beforeUpdate = { passport: stagePassport, details: stageDetails, cells, remarkMark: box, remark: want };
  // Whatever popup Update shows is answered OK and its text is shown; the stage is checked afterwards anyway.
  expectDialogs('step5', [{ match: /[\s\S]*/, accept: true }]);
  await press(page, btn, 'Update');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const seen = takeDialogs('step5');
  return seen.length ? { popup: seen.map((d) => d.text).join(' / ') } : {};
}

/**
 * After Update: the row left this stage, or it changed (a new update time), or the page shows the
 * new remark from the site itself. 'still' means the list shows the row exactly as before.
 */
async function stageState(page: Page, passport: string, want: string): Promise<'moved' | 'still' | 'empty'> {
  if ((await activeTab(page, TABS)) === 'Passport Collection') await stagesTab();
  await stage();
  const found = await searchStage(page, passport);
  const table = found.table;
  // LOS says the stage lists nobody now: the row left it too.
  if (!table) return 'empty';
  // A student with more than one LUC ID has a row for each: only the row that was updated counts.
  const details = beforeUpdate && beforeUpdate.passport === passport ? beforeUpdate.details : '';
  const rows = details ? found.rows.filter((r) => detailsOf(table, r) === details) : found.rows;
  if (rows.length === 0) return 'moved';
  if (rows.length > 1) throw new SiteStop('More than one row', `${rows.length} rows have ${passport} after Update. Look at the site window.`);
  const cells = rows[0].cells;
  if (beforeUpdate && beforeUpdate.passport === passport && cells.join('|') !== beforeUpdate.cells.join('|')) return 'moved';
  // The page drew the row again (the box the tool typed in is gone) and the new box shows the remark.
  const typedStillThere = beforeUpdate ? await page.locator(`[data-portal="${beforeUpdate.remarkMark}"]`).count() : 1;
  if (!typedStillThere) {
    const box = await remarkBox(page, rows[0].mark).catch(() => null);
    if (box && (await valueOf(page, box)).value === want) return 'moved';
  }
  // The site itself now shows the new remark as text in the row.
  if (cells.some((c) => c.includes(want)) && !(beforeUpdate?.cells ?? []).some((c) => c.includes(want))) return 'moved';
  return 'still';
}

/**
 * Searches again after Update. 'moved': the row left the stage (or changed). 'empty': LOS shows "No data found" for
 * the stage, so it lists nobody now. If the row looks the same, the page is opened fresh and checked once more.
 */
export async function checkStage({ passport, remark: want }: { passport: string; remark: string }): Promise<'moved' | 'empty'> {
  let page = needPage('step5', WHERE.stages);
  const first = await stageState(page, passport, want);
  if (first !== 'still') return first;
  page = await openPage('step5', PAGES.passportMovement);
  await stagesTab();
  const again = await stageState(page, passport, want);
  if (again !== 'still') return again;
  throw new SiteStop(
    "The stage didn't change",
    `After Update, ${passport} is still listed under "${STAGE}" and looks the same as before. Look at the site window. Update was not pressed again.`,
  );
}

/** For the save check after a lost answer: a fresh page, so the list is the site's own. */
export async function stageSaved(passport: string): Promise<boolean | 'unknown'> {
  if (!beforeUpdate || beforeUpdate.passport !== passport) return 'unknown';
  const page = await openPage('step5', PAGES.passportMovement);
  await stagesTab();
  return (await stageState(page, passport, beforeUpdate.remark)) !== 'still';
}

/**
 * Passport Movement Stages as the site shows it, for the staff to look at in the portal: the stage chosen on the site
 * (or `stage`), and this student's rows on it only. Nothing is typed, ticked or updated.
 */
export async function stageView({ passport, stage: name, refresh }: { passport: string; stage?: string; refresh?: boolean }): Promise<StageView> {
  let page = existingPage('step5');
  if (!page || pathOf(page.url()) !== PAGES.passportMovement.toLowerCase()) page = await openPage('step5', PAGES.passportMovement);
  await stagesTab();
  const sel = await findSelectWithOption(page, STAGE, WHERE.stages, 15_000);
  const stages = await choices(page, sel);
  const now = (await fieldState(page, sel)).value;
  const want = name || now || STAGE;
  if (!stages.includes(want)) throw new SiteStop(`"${want}" isn't a stage`, `The stage list on the site has no "${want}". Nothing was changed.`);
  if (want !== now) await stage({ name: want });
  else if (refresh) await stage({ name: want, refresh: true });
  const found = await searchStage(page, passport);
  const table = found.table;
  const rows = table ? await Promise.all(found.rows.map(async (r) => ({ cells: await rowLines(page, r.mark).catch(() => r.cells), details: detailsOf(table, r) }))) : [];
  return { stages, stage: want, empty: found.empty, headers: table?.headers ?? [], rows };
}

/** The Submit that saves: the first one after Confirm Transaction. For showing it to the staff. */
export async function submitButton(): Promise<string | null> {
  const page = needPage('step5', WHERE.collection);
  const box = await findCheckbox(page, CONFIRM, WHERE.collection, 0).catch(() => null);
  if (!box) return null;
  return findButton(page, 'Submit', { where: WHERE.collection, after: box, timeout: 0 }).catch(() => null);
}
