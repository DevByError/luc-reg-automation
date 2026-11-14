/**
 * Step 3: the remaining tabs of the Admission Form. The tool presses Continue To Next on the
 * pass-through tabs; the staff checks Parents Details and presses Final Submit on Payment Plan.
 */
import type { Page } from 'playwright-core';
import type { FeeKey, Parents, PaymentRead, PaymentValues, SaveResult } from '../../shared/ops';
import { assertLoggedIn, expectDialogs, hasHeld, peekDialogs, settle, settleOrTimeout, sleep } from '../browser';
import { WAIT } from '../config';
import { SiteChanged, SiteNetwork, SiteStop } from '../errors';
import {
  activeTab,
  choices,
  fieldState,
  findButton,
  findField,
  findFieldIfAny,
  findRadioGroup,
  findTableIfAny,
  pageMessages,
  press,
  radioValue,
  selectText,
  shownValue,
  typeText,
  valueOf,
} from '../find';
import { finalGone } from './result';
import { WHERE, needPage, saveResult } from './common';
import { TABS, stopIfSiteNeeds } from './step2';

type PassTab = 'address' | 'whatsapp' | 'wechat' | 'education';
const TAB_OF: Record<PassTab | 'parents', string> = {
  address: 'Address',
  whatsapp: 'Add WhatsApp',
  wechat: 'Add Wechat',
  parents: 'Parents Details',
  education: 'Education',
};
const NEXT_OF: Record<PassTab | 'parents', string> = {
  address: 'Add WhatsApp',
  whatsapp: 'Add Wechat',
  wechat: 'Parents Details',
  parents: 'Education',
  education: 'Payment Plan',
};

async function requireTab(page: Page, name: string) {
  const tab = await activeTab(page, TABS);
  if (tab !== name) {
    throw new SiteStop(
      `Not on ${name}`,
      `The tool expected the ${name} tab, but the Admission Form ${tab ? `shows ${tab}` : "doesn't show which tab is open"}. Nothing was pressed. Look at the site window.`,
    );
  }
}

/** Continue To Next on a tab, then checks the next tab opened. */
async function continueFrom(key: PassTab | 'parents'): Promise<SaveResult> {
  const page = needPage('step2', WHERE.form);
  await requireTab(page, TAB_OF[key]);
  const btn = await findButton(page, 'Continue To Next', { where: `the ${TAB_OF[key]} tab` });
  const before = await pageMessages(page);
  expectDialogs('step2', []);
  await press(page, btn, 'Continue To Next');
  await settle(page, WAIT.save);
  await assertLoggedIn(page);
  const result = saveResult('step2');
  await stopIfSiteNeeds(page, key, TAB_OF[key], result, before);
  if (result.popup) return result;
  const now = await activeTab(page, TABS);
  if (now !== NEXT_OF[key]) {
    const msgs = await pageMessages(page);
    throw new SiteStop(
      `${NEXT_OF[key]} did not open`,
      `After Continue To Next on ${TAB_OF[key]}, the site ${now ? `shows ${now}` : "doesn't show the next tab"}.${msgs.length ? ` It says: "${msgs.join('" / "')}".` : ''} Look at the site window.`,
    );
  }
  return {};
}

export const pass = ({ tab }: { tab: PassTab }) => continueFrom(tab);

/** Parents Details as the site shows it. Ids are the site's own; the labels are used if an id is missing. */
const PARENT_FIELDS: { key: Exclude<keyof Parents, 'relationship'>; labels: string[]; ids: string[] }[] = [
  { key: 'name', labels: ['Name'], ids: ['txtparname'] },
  { key: 'occupation', labels: ['Occupation'], ids: ['txtparoccup'] },
  { key: 'address', labels: ['Address'], ids: ['txtparaddress'] },
  { key: 'city', labels: ['City/Town/village', 'City', 'Enter City Name'], ids: ['txtparcity'] },
  { key: 'state', labels: ['State/province', 'State'], ids: ['txtparstate'] },
  { key: 'zip', labels: ['Postal/ZIP Code', 'Postal Code', 'Enter Postal Code'], ids: ['txtparzip'] },
  { key: 'country', labels: ['Country'], ids: ['ddlparcountry'] },
  { key: 'contactNo', labels: ['Contact No', 'Contact Number', 'Enter Number with country code'], ids: ['txtparcontactno'] },
  { key: 'email', labels: ['Email'], ids: ['txtparemail'] },
];
const CONTACT = PARENT_FIELDS.find((f) => f.key === 'contactNo')!;

/** The first of these labels that names a field, or null. */
async function parentField(page: Page, labels: string[], ids: string[]): Promise<string | null> {
  for (const label of labels) {
    const mark = await findFieldIfAny(page, label, { where: 'Parents Details', ids });
    if (mark) return mark;
  }
  return null;
}

export async function parents(): Promise<Parents> {
  const page = needPage('step2', WHERE.form);
  await requireTab(page, 'Parents Details');
  await contactBox(page, 20_000);
  // Relationship is a tick-one list on the site: Father / Mother / Guardian.
  const rel = await findRadioGroup(page, ['Relationship'], { where: 'Parents Details', names: ['rbprelation'], timeout: 0 }).catch(() => null);
  const out = { relationship: rel ? await radioValue(page, rel) : '' } as Parents;
  for (const f of PARENT_FIELDS) {
    const mark = await parentField(page, f.labels, f.ids);
    out[f.key] = mark ? (await valueOf(page, mark)).value.trim() : '';
  }
  return out;
}

async function contactBox(page: Page, timeout = 15_000) {
  for (const [i, label] of CONTACT.labels.entries()) {
    const last = i === CONTACT.labels.length - 1;
    const mark = last
      ? await findField(page, label, { where: 'Parents Details', kinds: ['text'], ids: CONTACT.ids, timeout })
      : await findFieldIfAny(page, label, { where: 'Parents Details', kinds: ['text'], ids: CONTACT.ids, timeout: i === 0 ? timeout : 0 });
    if (mark) return mark;
  }
  throw new SiteStop("Couldn't find Contact No", "The tool couldn't find the Contact No box on Parents Details. Nothing was changed.");
}

export async function writeContact({ value }: { value: string }): Promise<true> {
  const page = needPage('step2', WHERE.form);
  await requireTab(page, 'Parents Details');
  await typeText(page, await contactBox(page), value, 'Contact No');
  await settle(page);
  return true;
}

export async function readContact(): Promise<string> {
  const page = needPage('step2', WHERE.form);
  return (await valueOf(page, await contactBox(page))).value.trim();
}

export const continueParents = () => continueFrom('parents');

/**
 * The fees on Payment Plan. On the site they are usually just shown (Accounts sets them), so the tool reads them
 * and never types there. If the site ever gives a fee a box, the staff can change it in the portal and the tool types it.
 * Lincoln Foundation Scholarship is calculated by the site, so the tool never types it.
 */
const FEE_FIELDS: { key: FeeKey; label: string; labels: string[]; auto?: true }[] = [
  { key: 'kptFees', label: 'KPT Fees', labels: ['KPT Fees'] },
  { key: 'scholarship', label: 'Lincoln Foundation Scholarship', labels: ['Lincoln Foundation Scholarship'], auto: true },
  { key: 'tuitionFees', label: 'Currently Tution Fees', labels: ['Currently Tution Fees', 'Currently Tuition Fees'] },
  { key: 'totalSemester', label: 'Total Semester', labels: ['Total Semester'] },
];
const PLAN_HEADINGS = ['Semester', 'KPT Fees'];

async function financerBox(page: Page) {
  return findField(page, 'Financer', { where: 'Payment Plan', kinds: ['select'], mustInclude: ['Self Finance', 'PTPTN'], ids: ['ddlfinance'], timeout: 20_000 });
}

/** One fee as the site shows it: its box (if the site gives it one), what it shows, and whether the tool may type there. */
async function feeOnSite(page: Page, f: (typeof FEE_FIELDS)[number]): Promise<{ box: string; value: string; editable: boolean }> {
  for (const label of f.labels) {
    const shown = await shownValue(page, label, 'Payment Plan');
    if (!shown) continue;
    if (!shown.box) return { box: '', value: shown.value, editable: false };
    const st = await fieldState(page, shown.box);
    return { box: shown.box, value: st.value, editable: st.kind === 'text' && !st.locked && !f.auto };
  }
  throw new SiteChanged(
    `Couldn't find "${f.label}"`,
    `The tool couldn't find "${f.label}" on Payment Plan. Nothing was changed. The page layout was saved in the site-check folder so this can be fixed.`,
  );
}

/** Everything Payment Plan shows: the fees, the Financer and the fee table. */
export async function payment(): Promise<PaymentRead> {
  const page = needPage('step2', WHERE.form);
  await requireTab(page, 'Payment Plan');
  const box = await financerBox(page);
  const financerOptions = await choices(page, box);
  const financer = (await fieldState(page, box)).value;
  const fees = {} as PaymentRead['fees'];
  for (const f of FEE_FIELDS) {
    const site = await feeOnSite(page, f);
    fees[f.key] = { value: site.value, editable: site.editable };
  }
  const table = await findTableIfAny(page, PLAN_HEADINGS);
  const rows = table ? table.rows.map((r) => r.cells).filter((cells) => cells.some((c) => c.trim() !== '')) : [];
  return { fees, financer, financerOptions, plan: { headers: table && rows.length ? table.headers : [], rows } };
}

/**
 * Puts what the staff confirmed on the site: the fees the site lets the tool change, then the Financer.
 * A fee the site only shows is never touched; the portal checks it still shows the confirmed value afterwards.
 */
export async function fillPayment({ values }: { values: PaymentValues }): Promise<true> {
  const page = needPage('step2', WHERE.form);
  await requireTab(page, 'Payment Plan');
  for (const f of FEE_FIELDS) {
    const site = await feeOnSite(page, f);
    const want = values[f.key].trim();
    if (!site.editable || site.value === want) continue;
    // Empty in the portal means the staff emptied it: the box is cleared, never filled with 0.
    await typeText(page, site.box, want, f.label);
    await settle(page);
  }
  if (await selectText(page, await financerBox(page), values.financer, 'Financer', 'Payment Plan')) await settle(page, WAIT.save);
  return true;
}

/**
 * Final Submit, pressed by the staff. The Admission Form then shows its sections, one of them
 * "Verify / Upload English Result" (see result.ts).
 */
export async function finalSubmit(): Promise<SaveResult> {
  const page = needPage('step2', WHERE.form);
  await requireTab(page, 'Payment Plan');
  const btn = await findButton(page, 'Final Submit', { where: 'Payment Plan' });
  const before = await pageMessages(page);
  expectDialogs('step2', []);
  await press(page, btn, 'Final Submit');
  // After Final Submit the Admission Form fills with many sections, each loading its own page, and the page as a whole
  // may never go quiet. So the tool doesn't wait for quiet alone: it is also done as soon as the Admission Form no longer shows Final Submit. The English result is then done on its own page (result.ts).
  const end = Date.now() + WAIT.save;
  let shown = false;
  let alertAt = 0;
  for (;;) {
    await assertLoggedIn(page);
    if (hasHeld('step2')) break;
    if (await finalGone(page)) {
      shown = true;
      break;
    }
    // A popup the tool doesn't know (LOS refusing Final Submit, for example): the section gets a few seconds to show, then the staff sees the words.
    if (peekDialogs('step2').some((d) => !d.known)) {
      alertAt ||= Date.now();
      if (Date.now() - alertAt > 4000) break;
    }
    const left = end - Date.now();
    if (left <= 0) throw new SiteNetwork('The site took too long to answer');
    if (await settleOrTimeout(page, Math.min(4000, left))) {
      if (await finalGone(page)) shown = true;
      break;
    }
    await sleep(300);
  }
  await assertLoggedIn(page);
  const result = saveResult('step2');
  if (!shown) await stopIfSiteNeeds(page, 'final', 'Payment Plan', result, before);
  return result;
}
