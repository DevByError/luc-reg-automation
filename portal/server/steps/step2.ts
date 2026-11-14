/**
 * Step 2: open the Admission Form by passport, fill the Admission Profile with the staff's choices,
 * attach the English certificate found by the LUC number, and (when the staff presses it) Continue To Next.
 */
import type { Page } from 'playwright-core';
import type { DocFile, ProfileOptions, ProfileRead, ProfileValues, ReadBack, SaveKey, SaveResult, SiteDocs } from '../../shared/ops';
import { assertLoggedIn, expectDialogs, openPage, settle } from '../browser';
import { PAGES, WAIT } from '../config';
import { SiteChanged, SiteNeedsStop, SiteStop } from '../errors';
import { docPath, saveDoc } from '../files';
import {
  activeTab,
  askedFields,
  attachFile,
  choices,
  choicesShown,
  fieldByKey,
  fieldState,
  findButton,
  findField,
  findFieldIfAny,
  findRadioGroup,
  findTable,
  fileLinkIn,
  pageMessages,
  pickRadio,
  press,
  radioValue,
  rowsWithCell,
  selectChoice,
  selectText,
  setChecked,
  typeDate,
  typeText,
  valueOf,
} from '../find';
import type { RadioGroup } from '../find';
import { catchFile, fetchUrl } from '../obtain';
import { WHERE, needPage, saveResult, stopOnUnknownDialogs, samePassport } from './common';

export const TABS = ['Admission Profile', 'Address', 'Add WhatsApp', 'Add Wechat', 'Parents Details', 'Education', 'Payment Plan'];

type ProfileKey = Exclude<keyof ProfileValues, 'contactCode' | 'contactNumber'>;

/**
 * The Admission Profile choices the staff makes. Labels and ids are the site's own, read from its pages,
 * misspellings included ("Student Catagory", "Accomodation"). Visa Type and Accommodation are tick-one
 * lists on the site; the others are dropdowns. Each has a few choices it must offer, so the tool knows
 * it found the right one.
 */
const PROFILE: Record<ProfileKey, { name: string; labels: string[]; ids: string[]; radio?: true; must: string[] }> = {
  studentType: { name: 'Student Type', labels: ['Student Type'], ids: ['ddlstddtype'], must: ['Credit Transfer'] },
  salutation: { name: 'Salutation', labels: ['Salutation', 'Student Name'], ids: ['ddlsalstd'], must: ['Mrs.'] },
  intake: { name: 'Intake', labels: ['Intake'], ids: ['ddlintake'], must: [] },
  highestQualification: { name: 'Highest Qualification', labels: ['Highest Qualification'], ids: ['ddlhishestquali'], must: ['SPM'] },
  visaType: { name: 'Visa Type', labels: ['Visa Type'], ids: ['rbp_visatype'], radio: true, must: ['Local'] },
  studentCategory: { name: 'Student Category', labels: ['Student Catagory', 'Student Category'], ids: ['ddlstdcatagory'], must: ['Others Pass'] },
  classType: { name: 'Class Type', labels: ['Class Type'], ids: ['ddlclassname'], must: ['Class 1', 'Class 3'] },
  accommodation: { name: 'Accommodation', labels: ['Accomodation', 'Accommodation'], ids: ['rbpaccomodation'], radio: true, must: ['Hostel'] },
};
/** The order the tool fills them in: the ones that may reload the page first. */
const FILL_ORDER: ProfileKey[] = ['studentType', 'intake', 'salutation', 'highestQualification', 'visaType', 'studentCategory', 'classType', 'accommodation'];

const ENGLISH_LABEL = 'English proficiency Certicate Result';
const ENGLISH_ROW = 'English Profency Certificate / Medium of Instruction';

/** A dropdown of the Admission Profile, by its id on the site or its label. */
async function profileSelect(page: Page, key: ProfileKey, timeout = 0): Promise<string> {
  const d = PROFILE[key];
  let last: unknown;
  for (const [i, label] of d.labels.entries()) {
    try {
      return await findField(page, label, { where: WHERE.profile, kinds: ['select'], mustInclude: d.must, ids: d.ids, timeout: i === 0 ? timeout : 0 });
    } catch (e) {
      last = e;
      if (!(e instanceof SiteChanged && /Couldn't find/.test(e.title))) throw e;
    }
  }
  throw new SiteChanged(`Couldn't find "${d.name}"`, (last as SiteChanged).message.replace(`"${d.labels[d.labels.length - 1]}"`, `"${d.name}"`));
}

/** A tick-one list of the Admission Profile (Visa Type, Accommodation). */
function profileRadio(page: Page, key: ProfileKey, timeout = 0) {
  const d = PROFILE[key];
  return findRadioGroup(page, d.labels, { where: WHERE.profile, names: d.ids, mustInclude: d.must, timeout });
}

/** The choices the site offers, without "Select …" placeholders. */
async function profileChoices(page: Page, key: ProfileKey): Promise<string[]> {
  if (PROFILE[key].radio) return (await profileRadio(page, key)).options.map((o) => o.label);
  return choices(page, await profileSelect(page, key));
}

/** What the site shows now: the picked option's words ('' for a tick-one list with nothing ticked). */
async function profileValue(page: Page, key: ProfileKey): Promise<string> {
  if (PROFILE[key].radio) return radioValue(page, await profileRadio(page, key));
  return (await valueOf(page, await profileSelect(page, key))).value;
}

/** Picks the staff's choice. True if it changed, so the page may post back. */
async function profileSet(page: Page, key: ProfileKey, value: string): Promise<boolean> {
  const d = PROFILE[key];
  if (d.radio) return pickRadio(page, await profileRadio(page, key), value, d.name, WHERE.profile);
  return selectText(page, await profileSelect(page, key), value, d.name, WHERE.profile);
}

async function contactBoxes(page: Page) {
  const code = await findField(page, 'Personal Contact', { where: WHERE.profile, ids: ['txtpercnocc'], timeout: 0 });
  const number = await findField(page, 'Personal Contact', { where: WHERE.profile, nth: 2, ids: ['txtpersonalcontact'], timeout: 0 });
  if (code === number) throw new SiteChanged('Personal Contact has one box', 'The tool expected a country code box and a number box under Personal Contact.');
  return { code, number };
}

/** The form shows the Admission Profile tab open. A form that shows no open tab (for example an empty form) is not it. */
async function onProfile(page: Page) {
  const tab = await activeTab(page, TABS);
  if (tab !== 'Admission Profile') {
    throw new SiteStop(
      'Not on the Admission Profile',
      tab
        ? `The Admission Form shows the ${tab} tab, not the Admission Profile. Nothing was changed.`
        : "The Admission Form in the site window doesn't show the Admission Profile tab open. Nothing was changed.",
    );
  }
}

export async function open(): Promise<true> {
  const page = await openPage('step2', PAGES.admissionForm);
  await findField(page, 'Passport/IC Number', { where: WHERE.form, kinds: ['text'], timeout: 20_000 });
  await findButton(page, 'View', { where: WHERE.form });
  return true;
}

const DATA_FOUND = /data found to verify and submit/i;
const ODL_REDIRECT = /for odl students.*redirected/i;

/** Passport → View, through the popups. Always starts from a fresh page, so trying again is safe. */
export async function view({ passport }: { passport: string }): Promise<{ odl: boolean; popups: string[] }> {
  const page = await openPage('step2', PAGES.admissionForm);
  const box = await findField(page, 'Passport/IC Number', { where: WHERE.form, kinds: ['text'], timeout: 20_000 });
  await typeText(page, box, passport, 'Passport/IC Number');
  if (!samePassport((await valueOf(page, box)).value, passport)) {
    throw new SiteStop('The passport box shows something else', 'The Passport/IC Number box did not keep the passport. Nothing was changed.');
  }
  expectDialogs('step2', [
    { match: DATA_FOUND, accept: true },
    { match: ODL_REDIRECT, accept: true },
  ]);
  await press(page, await findButton(page, 'View', { where: WHERE.form }), 'View');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const seen = await stopOnUnknownDialogs('step2', WHERE.form);
  const odl = seen.some((d) => ODL_REDIRECT.test(d.text));
  const popups = seen.map((d) => d.text);
  if (odl && !seen.some((d) => DATA_FOUND.test(d.text))) {
    // ODL students: the ODL Registration page asks for the passport again.
    const again = await findField(page, 'Enter Passport/IC Number only for ODL Applicants', { where: WHERE.odl, kinds: ['text'], timeout: 30_000 });
    await typeText(page, again, passport, 'Enter Passport/IC Number only for ODL Applicants');
    expectDialogs('step2', [{ match: DATA_FOUND, accept: true }]);
    await press(page, await findButton(page, 'View', { where: WHERE.odl }), 'View');
    await settle(page, WAIT.save);
    await assertLoggedIn(page);
    const more = await stopOnUnknownDialogs('step2', WHERE.odl);
    popups.push(...more.map((d) => d.text));
  }
  if (!popups.some((t) => DATA_FOUND.test(t))) {
    const msgs = await pageMessages(page);
    throw new SiteStop(
      'The Admission Form did not open',
      `After View, the site didn't say "Data Found to Verify and submit."${msgs.length ? ` It shows: "${msgs.join('" / "')}".` : ''} Check the passport number.`,
    );
  }
  await profileSelect(page, 'studentType', 30_000);
  return { odl, popups };
}

export async function read(): Promise<ProfileRead> {
  const page = needPage('step2', WHERE.form);
  await onProfile(page);
  const options = {} as ProfileOptions;
  for (const key of FILL_ORDER) options[key] = await profileChoices(page, key);
  const shown = await profileValue(page, 'salutation');
  const salutation = options.salutation.includes(shown) ? shown : '';
  const { code, number } = await contactBoxes(page);
  const school = await findFieldIfAny(page, 'Highest Qualification School/Institution Name', { where: WHERE.profile, ids: ['txtschl_institute'] });
  return {
    salutation,
    contactCode: (await valueOf(page, code)).value.trim(),
    contactNumber: (await valueOf(page, number)).value.trim(),
    schoolName: school ? (await valueOf(page, school)).value.trim() : '',
    options,
  };
}

async function englishBox(page: Page) {
  return findField(page, ENGLISH_LABEL, { where: WHERE.profile, kinds: ['file'], prefix: true, ids: ['FileUpload4'], timeout: 0 });
}

async function attachEnglishOn(page: Page, passport: string, fileName: string) {
  const box = await englishBox(page);
  if ((await valueOf(page, box)).value === fileName) return;
  await attachFile(page, box, docPath(passport, fileName));
  await settle(page);
  const now = await englishBox(page);
  if ((await valueOf(page, now)).value !== fileName) {
    throw new SiteStop('The certificate did not attach', `The English proficiency box doesn't show "${fileName}". Nothing was saved.`);
  }
}

/** Fills the staff's choices, one at a time; a dropdown that reloads the page is waited for. */
export async function fill({ passport, values, englishFile }: { passport: string; values: ProfileValues; englishFile: string }): Promise<true> {
  const page = needPage('step2', WHERE.form);
  await onProfile(page);
  for (const key of FILL_ORDER) {
    if (await profileSet(page, key, values[key])) await settle(page, WAIT.save);
  }
  const { code } = await contactBoxes(page);
  const codeNow = await valueOf(page, code);
  // "+60" on the site is the same code as 60: only the digits are compared, so the site's own format stays.
  const digits = (v: string) => v.replace(/\D/g, '');
  if (digits(codeNow.value) !== digits(values.contactCode) || !digits(values.contactCode)) {
    if (codeNow.kind === 'select') {
      if (await selectText(page, code, values.contactCode, 'Personal Contact (code)', WHERE.profile)) await settle(page, WAIT.save);
    } else {
      await typeText(page, code, values.contactCode.trim(), 'Personal Contact (code)');
      await settle(page);
    }
  }
  const numberMark = (await contactBoxes(page)).number;
  if ((await valueOf(page, numberMark)).value.trim() !== values.contactNumber.trim()) {
    await typeText(page, numberMark, values.contactNumber.trim(), 'Personal Contact (number)');
    await settle(page);
  }
  // Last, because a page reload empties a file box.
  if (englishFile) await attachEnglishOn(page, passport, englishFile);
  return true;
}

export async function readBack({ englishFile }: { passport: string; englishFile: string }): Promise<ReadBack> {
  const page = needPage('step2', WHERE.form);
  const out: ReadBack = [];
  for (const key of ['studentType', 'salutation', 'intake'] as ProfileKey[]) out.push([PROFILE[key].name, await profileValue(page, key)]);
  const { code, number } = await contactBoxes(page);
  out.push(['Personal Contact', `${(await valueOf(page, code)).value.trim()} ${(await valueOf(page, number)).value.trim()}`]);
  for (const key of ['highestQualification', 'visaType', 'studentCategory', 'classType', 'accommodation'] as ProfileKey[]) {
    out.push([PROFILE[key].name, await profileValue(page, key)]);
  }
  if (englishFile) out.push(['English certificate', (await valueOf(page, await englishBox(page))).value]);
  return out;
}

/** Continue To Next on the Admission Profile. Only after the staff pressed it and every value matched. */
export async function continueProfile(): Promise<SaveResult> {
  const page = needPage('step2', WHERE.form);
  await onProfile(page);
  const btn = await findButton(page, 'Continue To Next', { where: WHERE.profile });
  const before = await pageMessages(page);
  expectDialogs('step2', []);
  await press(page, btn, 'Continue To Next');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const result = saveResult('step2');
  await stopIfSiteNeeds(page, 'profile', 'Admission Profile', result, before);
  return result;
}

/* ------------------------------------------------ fields the site asks for */

/** The Admission Form's fields that the portal fills itself (steps 2 and 3): they are never asked for twice. */
const PORTAL_FIELDS = [
  'ddlstddtype', 'ddlsalstd', 'ddlintake', 'ddlhishestquali', 'rbp_visatype', 'ddlstdcatagory', 'ddlclassname', 'rbpaccomodation',
  'FileUpload4', 'txtpercnocc', 'txtpersonalcontact', 'txtparcontactno', 'ddlfinance', 'txtkpt', 'txtsch', 'txttuition', 'txtsem',
];

/**
 * After Continue To Next (or Final Submit) the form is still on the same tab, so the site didn't take it. If the site asks
 * for fields the portal doesn't fill (an empty Country, for example), the step stops with those fields, for the staff to
 * fill in the portal. A question still waiting for OK or Cancel goes to the staff first. `before`: the page's messages
 * before the press; only new ones count. Final Submit counts only the site's own checks and a popup that names a field.
 */
export async function stopIfSiteNeeds(page: Page, save: SaveKey, tab: string, result: SaveResult, before: string[]): Promise<void> {
  if (result.popupId) return;
  if ((await activeTab(page, TABS)) !== tab) return;
  const popups = result.popup ? result.popup.split(' / ') : [];
  const fresh = (await pageMessages(page)).filter((m) => !before.includes(m));
  const final = save === 'final';
  if (final && !popups.length) return;
  const said = [...popups, ...fresh];
  const asked = await askedFields(page, said, PORTAL_FIELDS, { marked: !final, guess: !final });
  const { portal } = asked;
  if (!asked.fields.length) return;
  // Two fields with the same label (a Country for each address) are told apart by their order on the tab.
  const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
  const fields = asked.fields.map((f, _, all) => {
    const same = all.filter((g) => g.label === f.label);
    return same.length > 1 ? { ...f, label: `${f.label} (${ORDINAL[same.indexOf(f)]} on ${tab})` } : f;
  });
  // A dropdown's choices as the portal shows them: a choice the site lists twice, with different values, gets its place.
  for (const f of fields) {
    if (f.kind !== 'select') continue;
    const box = await fieldByKey(page, f.key);
    if (box.marks.length !== 1) continue;
    const shown = await choicesShown(page, box.marks[0]);
    f.options = shown.options;
    f.value = shown.value;
  }
  const button = final ? 'Final Submit' : 'Continue To Next';
  const names = fields.map((f) => f.label);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  // A check that shows only a * next to the field has no words to repeat.
  const real = said.filter((m) => /[a-z0-9]/i.test(m));
  const words = real.length
    ? ` The site said: "${real.join('" / "')}".`
    : said.length
      ? ` On the site, a * shows next to ${fields.length === 1 ? 'it' : 'them'}.`
      : '';
  const also = portal.length ? ` It also marks ${portal.join(', ')}, which you set in the portal as usual.` : '';
  throw new SiteNeedsStop('The site needs more details', `${button} on ${tab} didn't go through: the site asks for ${list}.${words}${also}`, {
    save,
    tab,
    fields,
  });
}

/** A field the site asked for, found again by its id (a tick-one list by its name). */
async function askedField(page: Page, key: string, label: string): Promise<{ kind: string; mark: string; group: RadioGroup | null }> {
  const f = await fieldByKey(page, key);
  if (f.kind === 'radio') return { kind: 'radio', mark: '', group: { name: f.name, options: f.options } };
  if (f.marks.length !== 1) {
    throw new SiteChanged(`Couldn't find "${label}"`, `The tool couldn't find "${label}" on the Admission Form any more. Nothing more was changed.`);
  }
  return { kind: f.kind, mark: f.marks[0], group: null };
}

/**
 * Puts the staff's values in the fields the site asked for, on the tab where it asked, then reads each one back.
 * A choice may reload the page and change another field, so everything is read back after everything is filled.
 */
export async function fillNeeds({ tab, values }: { tab: string; values: { key: string; label: string; value: string }[] }): Promise<ReadBack> {
  const page = needPage('step2', WHERE.form);
  const now = await activeTab(page, TABS);
  if (now !== tab) {
    throw new SiteStop(
      `Not on ${tab}`,
      `The site asked for these fields on ${tab}, but the Admission Form ${now ? `shows ${now}` : "doesn't show which tab is open"}. Nothing was changed. Look at the site window.`,
    );
  }
  for (const v of values) {
    const f = await askedField(page, v.key, v.label);
    if (f.group) {
      if (await pickRadio(page, f.group, v.value, v.label, tab)) await settle(page, WAIT.save);
    } else if (f.kind === 'select') {
      if (await selectChoice(page, f.mark, v.value, v.label, tab)) await settle(page, WAIT.save);
    } else if (f.kind === 'checkbox') {
      await setChecked(page, f.mark, v.value === 'checked');
      await settle(page, WAIT.save);
    } else if (f.kind === 'date') {
      await typeDate(page, f.mark, v.value, v.label);
      await settle(page);
    } else {
      await typeText(page, f.mark, v.value, v.label);
      await settle(page);
    }
  }
  const out: ReadBack = [];
  for (const v of values) {
    const f = await askedField(page, v.key, v.label);
    const shown = f.group ? await radioValue(page, f.group) : f.kind === 'select' ? (await choicesShown(page, f.mark)).value : (await fieldState(page, f.mark)).value;
    out.push([v.label, shown]);
  }
  return out;
}

export async function checkNext(): Promise<true> {
  const page = needPage('step2', WHERE.form);
  const tab = await activeTab(page, TABS);
  if (tab === 'Address') return true;
  const msgs = await pageMessages(page);
  throw new SiteStop(
    'The Address tab did not open',
    `After Continue To Next the site ${tab ? `still shows ${tab}` : "doesn't show the Address tab"}.${msgs.length ? ` It says: "${msgs.join('" / "')}".` : ''} Look at the site window.`,
  );
}

/* ----------------------------------------------------------- the certificate */

export async function englishOpen(): Promise<true> {
  const page = await openPage('english', PAGES.applicantDetails);
  await findField(page, 'Admission ID', { where: WHERE.applicant, kinds: ['text'], timeout: 20_000 });
  return true;
}

const DOC_HEADINGS = ['Sl.No', 'Image URL', 'Uploaded By'];
let englishRows: string[] = [];

export async function englishSearch({ luc }: { luc: string }): Promise<true> {
  const page = await openPage('english', PAGES.applicantDetails);
  const box = await findField(page, 'Admission ID', { where: WHERE.applicant, kinds: ['text'], timeout: 20_000 });
  await typeText(page, box, luc, 'Admission ID');
  if ((await valueOf(page, box)).value.trim() !== luc) {
    throw new SiteStop('The Admission ID box shows something else', 'The Admission ID box did not keep the LUC number. Nothing was changed.');
  }
  expectDialogs('english', []);
  await press(page, await findButton(page, 'View Details', { where: WHERE.applicant }), 'View Details');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  await stopOnUnknownDialogs('english', WHERE.applicant, 'Check the LUC number in step 1.');
  await findTable(page, DOC_HEADINGS, WHERE.applicant, 30_000);
  return true;
}

export async function englishFind(): Promise<number> {
  const page = needPage('english', WHERE.applicant);
  englishRows = await rowsWithCell(page, ENGLISH_ROW);
  return englishRows.length;
}

export async function englishDownload({ passport }: { passport: string }): Promise<DocFile> {
  const page = needPage('english', WHERE.applicant);
  if (englishRows.length !== 1) throw new SiteStop('Find the certificate again', 'Press Try again to look for the certificate again.');
  const link = await fileLinkIn(page, englishRows[0], ENGLISH_ROW);
  if (!link) throw new SiteStop('The certificate has no file', `The row "${ENGLISH_ROW}" has no link to a file, so the tool can't download it.`);
  const bytes = link.href ? await fetchUrl(page, link.href) : await catchFile(page, () => press(page, link.mark, link.name));
  return saveDoc(passport, 'english', bytes);
}

/**
 * The student's documents, for the staff to choose the certificate when it isn't under its usual name (a master's
 * or PhD student may upload it in another row). Searched afresh by the LUC number, so the list is always this student's.
 */
async function documentsFor(luc: string) {
  await englishSearch({ luc });
  const page = needPage('english', WHERE.applicant);
  return { page, table: await findTable(page, DOC_HEADINGS, WHERE.applicant, 15_000) };
}

/** A row's file: a link with a real address. Null when the row has none. */
async function rowFile(page: Page, row: string) {
  const link = await fileLinkIn(page, row, '');
  return link && link.href ? link : null;
}

export async function englishList({ luc }: { luc: string }): Promise<SiteDocs> {
  const { page, table } = await documentsFor(luc);
  const rows: SiteDocs['rows'] = [];
  for (const r of table.rows) rows.push({ cells: r.cells, file: !!(await rowFile(page, r.mark)) });
  return { headers: table.headers, rows };
}

/** The document the staff pressed: the same row as they saw it, or nothing is saved. */
export async function englishPick({ passport, luc, index, cells }: { passport: string; luc: string; index: number; cells: string[] }): Promise<DocFile> {
  const { page, table } = await documentsFor(luc);
  const row = table.rows[index];
  if (!row || row.cells.join('\n') !== cells.join('\n')) {
    throw new SiteStop('The list changed', "Applicant Details doesn't show that document in the same place any more, so nothing was saved. Choose it again from the list.");
  }
  const link = await rowFile(page, row.mark);
  if (!link) throw new SiteStop('No file in that row', 'That row has no file to download. Choose another document, or add the certificate yourself.');
  const bytes = await fetchUrl(page, link.href);
  return saveDoc(passport, 'english', bytes);
}

/** Puts the downloaded certificate in the English proficiency box on the Admission Profile. */
export async function englishAttach({ passport, fileName }: { passport: string; fileName: string }): Promise<true> {
  const page = needPage('step2', WHERE.form);
  await onProfile(page);
  await attachEnglishOn(page, passport, fileName);
  return true;
}

