/**
 * What each step does on the site, in order. Every site action goes through call(): in sample mode the
 * pretend site answers, in live mode the tool on this computer works in the site window.
 * Read-only work for one student starts side by side; saves happen one at a time, in order.
 */
import { writeDate } from '../../shared/dates';
import { FEE_KEYS, NO_UPLOAD_SIGN, RESULT_SECTION, UNCLEAR_ANSWER } from '../../shared/ops';
import type {
  CollectionRead,
  CollectionShown,
  CollectionValues,
  DocFile,
  FeeKey,
  PaymentRead,
  PaymentValues,
  ProfileOptions,
  ProfileValues,
  ReadBack,
  RegRow,
  ResultField,
  ResultFilled,
  ResultView,
  SiteDocs,
} from '../../shared/ops';
import { extensionOf, savedFileName, studentFolder } from '../lib/files';
import { fileSize, isoToDmy, isValidPassport, normalizePassport, parseDmy, parseIso, removeSpaces, tidySpaces } from '../lib/format';
import { OPTIONS, SAMPLE, demo, demoDefaults } from '../mock/site';
import { beginStudent, call, isLive } from '../site';
import { openFolder, uploadFile } from '../site/live';
import { Cancelled, StopError } from './errors';
import { TAB_LOGGED_OUT, busyKeyFor, dropQuestions, flow, noteActivity, runRead, runSave, waitUntil, waitingActivity } from './runner';
import {
  DOC_INFO,
  app,
  emptyForm,
  freshDocs,
  freshSteps,
  markSaved,
  resultCertificate,
  setBusy,
  setDoc,
  setForm,
  setSiteData,
  setStep,
  setUi,
  showDoc,
  toast,
  unmarkSaved,
} from './store';
import type { AppState, DocKey, FormState, RetryKey, SaveKey, StepId, StepStatus } from './types';
import { collectionMissing, finalMissing, parentsMissing, profileMissing, resultFields, resultMissing, resultValueFor, visaMissing } from './validation';

const currentRun = () => app.get().runId;
const passportOf = () => app.get().student?.passport ?? '';

/** The same passport or ID, whatever spaces or small letters the site shows. */
const sameId = (a: string, b: string) => a.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === b.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Defaults the portal picks, only when the site offers that choice. */
export const PROFILE_DEFAULTS = { visaType: 'Student Visa[Airport Pickup]', studentCategory: 'Normal Student', classType: 'Class 1' };

/** The same choice, even if the site spaces it differently ("Student Visa [Airport Pickup]"). */
export const sameChoice = (a: string, b: string) => !!a && a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();
export const PASSPORT_TYPE_DEFAULT = 'New(Year 1)';

/* ------------------------------------------------------------------- status */

const NOTES: Record<StepStatus, string> = {
  idle: '',
  waiting: 'Waits for step 2',
  working: 'Working',
  'needs-staff': 'Needs you',
  done: 'Done',
  error: 'Stopped',
};

/** Works out a step's status from what has happened so far. A step that stopped keeps its message. */
function settle(run: number, step: StepId) {
  const s = app.get();
  if (s.runId !== run || s.steps[step].error) return;
  const sd = s.siteData;
  let status: StepStatus = 'working';
  switch (step) {
    case 1:
      if (s.docs.registration.status === 'ready') status = s.form.lucSaved ? 'done' : 'needs-staff';
      break;
    case 2:
      if (s.saves.profile) status = 'done';
      else if (sd.profileLoaded) status = 'needs-staff';
      break;
    case 3:
      if (s.saves.englishReupload) status = 'done';
      else if (!s.saves.profile) status = 'waiting';
      else if ((sd.parents && !s.saves.parents) || (sd.paymentLoaded && !s.saves.final) || (s.saves.final && sd.result)) status = 'needs-staff';
      break;
    case 0:
      if (s.docs.miniStatement.status === 'ready') status = 'done';
      break;
    case 4:
      if (s.docs.profile.status === 'ready' && s.docs.studentType.status === 'ready') status = 'done';
      break;
    case 5:
      if (sd.stageConfirmed) status = 'done';
      else if (sd.collection && !s.saves.collection) status = 'needs-staff';
      break;
    case 6:
      if (sd.visaConfirmed) status = 'done';
      else if (sd.card) status = 'needs-staff';
      break;
  }
  setStep(run, step, { status, note: NOTES[status] });
}

export const allDone = (s: AppState) => ([1, 2, 3, 4, 5, 6] as StepId[]).every((id) => s.steps[id].status === 'done');

/* ------------------------------------------------------------------ checks */

type Row = { field: string; expected: string; actual: string };

/** "+60 120000000" on the site is the same Personal Contact as 60 120000000. Everything else must match exactly. */
function sameValue(field: string, expected: string, actual: string) {
  if (field === 'Personal Contact') {
    const norm = (v: string) => v.replace(/\+/g, '').replace(/\s+/g, ' ').trim();
    return norm(expected) === norm(actual);
  }
  return expected === actual;
}

/** Compares what the site shows with what was meant to go in, field by field, by name. */
function differences(expected: [string, string][], back: ReadBack): Row[] {
  const got = new Map(back);
  const rows: Row[] = [];
  for (const [field, want] of expected) {
    const shown = got.get(field);
    if (shown !== undefined && sameValue(field, want, shown)) continue;
    rows.push({ field, expected: want || '(empty)', actual: shown === undefined ? '(not shown)' : shown || '(empty)' });
  }
  return rows;
}

/* -------------------------------------------------------------------- files */

/**
 * Records a file in the student's folder. In live mode the tool already saved it and named it;
 * in sample mode the name is made here. Names start with the step number and never overwrite.
 */
function recordFile(run: number, key: DocKey, file: DocFile, ext: string): string {
  let name = file.fileName ?? '';
  app.set((s) => {
    if (s.runId !== run || !s.student) return s;
    const passport = s.student.passport;
    const list = s.savedFiles[passport] ?? [];
    if (!name) name = savedFileName(DOC_INFO[key].base, ext, list.map((f) => f.name));
    const saved = { name, url: file.url, kind: file.kind, step: DOC_INFO[key].step, savedAt: Date.now() };
    return { ...s, savedFiles: { ...s.savedFiles, [passport]: [...list.filter((f) => f.name !== name), saved] } };
  });
  return name;
}

async function fetchDoc(run: number, step: StepId, key: DocKey, label: string, get: () => Promise<DocFile>) {
  setDoc(run, key, { status: 'loading', startedAt: Date.now(), note: undefined });
  try {
    const file = await runRead(run, step, label, get);
    const name = recordFile(run, key, file, file.kind === 'pdf' ? 'pdf' : 'png');
    setDoc(run, key, { status: 'ready', url: file.url, kind: file.kind, fileName: name });
    noteActivity(run, step, `Saved "${name}"`, "In the student's folder");
    if (file.warning) {
      noteActivity(run, step, 'Look at this document', file.warning);
      toast(file.warning, 'warning');
    }
  } catch (e) {
    if (!(e instanceof Cancelled)) {
      setDoc(run, key, { status: 'error', note: e instanceof StopError ? e.message : 'The download stopped.' });
    }
    throw e;
  }
}

/** Opens the student's folder: File Explorer in live mode, the files list in sample mode. */
export async function openStudentFolder(passport: string) {
  if (!isLive()) {
    setUi({ filesOpen: true, filesQuery: passport });
    return;
  }
  try {
    const folder = await openFolder(passport);
    toast(`Opened ${folder} in File Explorer.`, 'info');
  } catch (e) {
    toast(e instanceof Error ? `Couldn't open the folder: ${e.message}` : "Couldn't open the folder.", 'error');
  }
}

/* ------------------------------------------------------------ start / reset */

/** Starts a student from the passport. Returns a message if the passport can't be used. */
export function startStudent(raw: string): string | null {
  const passport = normalizePassport(raw);
  if (!passport) return 'Type the passport number first.';
  if (!isValidPassport(passport)) return 'A passport number has 5 to 15 letters and digits, with no symbols.';
  if (isLive()) {
    const w = app.get().siteWindow;
    if (w.browser !== 'open' || w.login !== 'in') return 'Log in to online.lincoln.edu.my in the site window first. The portal notices by itself.';
  }
  dropQuestions();
  const run = app.get().runId + 1;
  app.set((s) => ({
    ...s,
    runId: run,
    student: { passport, folder: studentFolder(s.settings.filesRoot, passport), startedAt: Date.now() },
    steps: freshSteps(),
    docs: freshDocs(),
    activeStep: 1,
    activeDoc: 'registration',
    docPage: 1,
    form: emptyForm(),
    siteData: {},
    saves: {},
    popups: [],
    watch: null,
    ui: { ...s.ui, mobileView: 'fields', confirm: null },
  }));
  beginStudent(run, passport);
  setStep(run, 3, { status: 'waiting', note: NOTES.waiting });
  // Everything that needs only the passport starts at once, each in its own tab.
  // Stage 0 (the mini statement) runs on its own, in its own tab. No other step waits for it or uses it.
  void step0(run);
  void step1(run);
  void step2(run);
  void step4(run);
  void step5(run);
  void step6(run);
  return null;
}

export function requestNewStudent() {
  const s = app.get();
  if (s.student && !allDone(s)) setUi({ confirm: 'newStudent' });
  else clearStudent();
}

export function clearStudent() {
  dropQuestions();
  app.set((s) => ({
    ...s,
    runId: s.runId + 1,
    student: null,
    steps: freshSteps(),
    docs: freshDocs(),
    form: emptyForm(),
    siteData: {},
    saves: {},
    popups: [],
    watch: null,
    ui: { ...s.ui, confirm: null, mobileView: 'fields' },
  }));
}

/* ------------------------------------------------------------------- step 1 */

async function step1(run: number) {
  await flow(
    run,
    1,
    'step1',
    async () => {
      const passport = passportOf();
      await runRead(run, 1, 'Open the Registration Forms list', () => call(run, 'step1.open', {}));
      const rows = await runRead(run, 1, `Search the list for ${passport}`, () => call(run, 'step1.search', { passport }), {
        done: (r) => `${r.length} matching row${r.length === 1 ? '' : 's'}`,
      });
      if (rows.length === 0) {
        throw new StopError(
          'Student not found',
          `No row on the Registration Forms list matches ${passport}. Check the passport number. If it's right, the student may not be on the list yet.`,
        );
      }
      let row = rows[0];
      if (rows.length > 1) {
        // The same registration can be on the list twice: the staff chooses the row, the tool prints only that one.
        const pick = app.get().siteData.regPick;
        const chosen = pick ? rows.filter((r) => r.id === pick) : [];
        setSiteData(run, { regRows: rows });
        if (chosen.length !== 1) {
          setSiteData(run, { regPick: undefined, regChoosing: true });
          throw new StopError(
            pick ? 'The row you chose has changed' : "Choose the student's row",
            pick
              ? "The list doesn't show the row you chose any more. Choose the student's row again below. Nothing was opened."
              : `${rows.length} rows on the Registration Forms list match ${passport}. Choose the right one below: the tool then opens Print for that row only and saves its registration form.`,
            { retry: 'step1', retryLabel: 'Search again' },
          );
        }
        row = chosen[0];
        noteActivity(run, 1, 'Using the row you chose', regRowLabel(row));
      } else {
        setSiteData(run, { regRows: undefined, regPick: undefined });
        noteActivity(run, 1, 'Exactly one row', `${row.name} · ${row.course}`);
      }
      setSiteData(run, { regRow: row, regChoosing: false });
      await runRead(run, 1, 'Open Print (the registration form report)', () => call(run, 'step1.print', { key: row.key, id: row.id }));
      await fetchDoc(run, 1, 'registration', 'Export the report as PDF', () => call(run, 'step1.pdf', { passport }));
      settle(run, 1);
    },
    { working: 'Fetching the PDF' },
  );
}

/** A row's Sl No as the list shows it ('' if it has none). */
export function regRowNumber(row: RegRow): string {
  return row.shown.find(([h]) => /^s\.?\s*l?\.?\s*no\.?$/i.test(h.trim()))?.[1] ?? '';
}

const regRowLabel = (row: RegRow) => {
  const n = regRowNumber(row);
  return n ? `Sl No ${n} · ${row.name}` : row.name;
};

/**
 * The staff chose one of the rows that match the passport. The tool searches the list again, finds that same row,
 * opens Print for it only and saves its registration form. Returns a message if it can't be used now.
 */
export function pickRegRow(index: number): string | null {
  const s = app.get();
  const run = s.runId;
  if (!s.student) return 'Start a student first.';
  if (s.form.lucSaved) return 'The LUC number is already saved. Press Change on it first.';
  if (s.busy[busyKeyFor(run, 'step1')]) return 'Wait until the tool has finished.';
  const row = s.siteData.regRows?.[index];
  if (!row) return 'The list is gone. Press Search again.';
  setSiteData(run, { regPick: row.id });
  setStep(run, 1, { error: undefined });
  noteActivity(run, 1, 'You chose the row', regRowLabel(row));
  void step1(run);
  return null;
}

/** Shows the matching rows again, to use another one. Only until the LUC number is saved. */
export function chooseRegRowAgain(on = true) {
  const s = app.get();
  if (!s.student || (on && s.form.lucSaved) || s.busy[busyKeyFor(s.runId, 'step1')]) return;
  setSiteData(s.runId, { regChoosing: on });
}

/** The staff saves the LUC number copied from page 1 of the PDF. */
export function saveLuc() {
  const run = currentRun();
  const s = app.get();
  const luc = removeSpaces(s.form.luc);
  if (!luc || s.saves.profile) return;
  setForm({ luc, lucSaved: luc });
  noteActivity(run, 1, `LUC number saved: ${luc}`, 'Typed by you, spaces removed');
  settle(run, 1);
  void englishFlow(run);
  checkAdmissionId(run);
}

/** Lets the staff correct the LUC number until the Admission Profile is saved. */
export function changeLuc() {
  const run = currentRun();
  const s = app.get();
  if (s.saves.profile || s.busy[`${run}:english`]) return;
  setForm({ lucSaved: '' });
  setDoc(run, 'english', { status: 'waiting', url: undefined, fileName: undefined, note: undefined });
  setSiteData(run, {
    englishAttached: false,
    englishByStaff: undefined,
    englishDocs: undefined,
    englishFromSite: undefined,
    englishChoosing: false,
    lucCheck: s.siteData.card ? 'waiting' : undefined,
  });
  if (s.steps[6].error?.title === 'Admission ID is different') setStep(run, 6, { error: undefined });
  if (s.steps[2].error && !s.busy[`${run}:step2`]) setStep(run, 2, { error: undefined });
  noteActivity(run, 1, 'LUC number opened for a change');
  settle(run, 1);
  settle(run, 2);
  settle(run, 6);
  checkAdmissionId(run);
}

/* ------------------------------------------------------------------- step 2 */

const englishWaitLines = new Map<number, ReturnType<typeof waitingActivity>>();

/** Keeps a value only if the site offers it, word for word. */
const offered = (value: string, list: string[]) => (value && list.includes(value) ? value : '');
/** A default, in the site's own words. Only when exactly one of the site's choices is that choice. */
const offeredDefault = (def: string, list: string[]) => {
  const hits = list.filter((o) => sameChoice(o, def));
  return hits.length === 1 ? hits[0] : '';
};

async function step2(run: number) {
  await flow(
    run,
    2,
    'step2',
    async () => {
      const passport = passportOf();
      if (!app.get().form.lucSaved && !englishWaitLines.has(run)) {
        englishWaitLines.set(run, waitingActivity(run, 2, 'Find the English certificate', 'Waits for the LUC number from step 1'));
      }
      await runRead(run, 2, 'Open the Admission Form', () => call(run, 'step2.open', {}));
      const view = await runRead(run, 2, `Passport/IC Number ${passport} → View`, () => call(run, 'step2.view', { passport }), {
        done: (v) => (v.odl ? 'This student is ODL: went through the ODL Registration Page' : undefined),
      });
      if (view.odl) setSiteData(run, { odl: true });
      for (const text of view.popups) noteActivity(run, 2, `Popup: "${text}" → OK`, 'Known message');
      const site = await runRead(run, 2, 'Read the Admission Profile and its options', () => call(run, 'step2.read', {}), {
        done: () => 'Options read from the site',
      });
      const o: ProfileOptions = site.options;
      // Pre-fill from the site and set the defaults, without overwriting anything the staff already picked,
      // and only with choices the site offers.
      const f = app.get().form;
      setForm({
        studentType: offered(f.studentType, o.studentType),
        salutation: offered(f.salutation, o.salutation) || offered(site.salutation, o.salutation),
        intake: offered(f.intake, o.intake),
        contactCode: f.contactCode || site.contactCode.replace(/^\+/, ''),
        contactNumber: f.contactNumber || site.contactNumber,
        highestQualification: offered(f.highestQualification, o.highestQualification),
        visaType: offered(f.visaType, o.visaType) || offeredDefault(PROFILE_DEFAULTS.visaType, o.visaType),
        studentCategory: offered(f.studentCategory, o.studentCategory) || offeredDefault(PROFILE_DEFAULTS.studentCategory, o.studentCategory),
        classType: offered(f.classType, o.classType) || offeredDefault(PROFILE_DEFAULTS.classType, o.classType),
        accommodation: offered(f.accommodation, o.accommodation),
      });
      setSiteData(run, { profileLoaded: true, schoolName: site.schoolName, profileOptions: o });
      settle(run, 2);
    },
    { working: 'Opening the form' },
  );
}

const ENGLISH_ROW = 'English Profency Certificate / Medium of Instruction';
const ADD_ENGLISH_HINT = 'You can also add the certificate yourself in the English certificate box below.';
const CHOOSE_ENGLISH_HINT = "Press the right document in the student's list below, or add the certificate yourself.";

/**
 * Step 2's certificate: found by the LUC number on Applicant Details and downloaded, then attached to the form.
 * A certificate already in the student's folder (downloaded, or added by the staff) is only attached.
 */
async function englishFlow(run: number) {
  await flow(
    run,
    2,
    'english',
    async () => {
      const doc = app.get().docs.english;
      if (!(doc.status === 'ready' && doc.fileName)) {
        try {
          await findEnglish(run);
        } catch (e) {
          if (e instanceof Cancelled) throw e;
          // Whatever stopped the search, the staff can choose the certificate from the student's documents
          // (a master's or PhD student may have uploaded it in another row), or add it themselves.
          const stop = e instanceof StopError ? e : new StopError("The certificate didn't arrive", e instanceof Error ? e.message : String(e));
          const listed = await listEnglishDocs(run);
          throw new StopError(stop.title, stop.message, { ...stop.extra, hint: listed ? CHOOSE_ENGLISH_HINT : ADD_ENGLISH_HINT });
        }
      }
      await attachEnglish(run);
    },
    { working: 'Finding the certificate' },
  );
}

/** Finds the certificate on Applicant Details by the LUC number and saves it in the student's folder. */
async function findEnglish(run: number) {
  const passport = passportOf();
  const luc = app.get().form.lucSaved;
  const waitLine = englishWaitLines.get(run);
  if (waitLine) {
    waitLine.finish(`LUC number ${luc} saved in step 1`);
    englishWaitLines.delete(run);
  }
  setSiteData(run, { englishByStaff: undefined, englishFromSite: undefined, englishDocs: undefined, englishChoosing: false });
  setDoc(run, 'english', { status: 'loading', startedAt: Date.now(), url: undefined, fileName: undefined, note: undefined });
  try {
    await runRead(run, 2, 'Open Applicant Details [All]', () => call(run, 'english.open', {}), { detail: 'For the English certificate' });
    await runRead(run, 2, `Admission ID ${luc} → View Details`, () => call(run, 'english.search', { luc }));
    const count = await runRead(run, 2, `Find "${ENGLISH_ROW}"`, () => call(run, 'english.find', {}), {
      done: (n) => (n === 1 ? 'Found by its exact name, listed once' : n === 0 ? 'Not on the list' : `Listed ${n} times`),
    });
    if (count === 0) {
      throw new StopError(
        'No English certificate on the list',
        `Applicant Details for ${luc} has no row named "${ENGLISH_ROW}". If the LUC number in step 1 is wrong, press Change there to fix it.`,
      );
    }
    if (count > 1) {
      throw new StopError(
        'More than one English certificate',
        `Applicant Details for ${luc} lists "${ENGLISH_ROW}" ${count} times, so the tool stopped rather than pick one. Check the student's documents on the site.`,
      );
    }
  } catch (e) {
    if (!(e instanceof Cancelled)) setDoc(run, 'english', { status: 'error', note: e instanceof StopError ? e.message : 'The search stopped.' });
    throw e;
  }
  await fetchDoc(run, 2, 'english', 'Download the certificate', () => call(run, 'english.download', { passport }));
}

/** Attaches the certificate in the student's folder to the English proficiency field, once the Admission Form is open. */
async function attachEnglish(run: number) {
  const passport = passportOf();
  if (!app.get().siteData.profileLoaded) {
    const line = waitingActivity(run, 2, 'Attach it to the Admission Profile', 'Waits for the Admission Form to open');
    await waitUntil(run, () => !!app.get().siteData.profileLoaded);
    line.finish('The Admission Form is open');
  }
  const fileName = app.get().docs.english.fileName ?? '';
  if (!fileName) throw new StopError('Add the certificate again', "The certificate is not in the student's folder.", { hint: ADD_ENGLISH_HINT });
  await runRead(run, 2, 'Attach it to the English proficiency field', () => call(run, 'english.attach', { passport, fileName }), {
    done: () => 'Attached. Check it on the left.',
  });
  setSiteData(run, { englishAttached: true });
  settle(run, 2);
}

/**
 * The staff added the English certificate themselves, because the tool couldn't get it from the site.
 * It is saved in the student's folder, then attached to the form like a downloaded one. Returns a message if it can't be used.
 */
export function addEnglishFile(file: File): string | null {
  const problem = pickedFileProblem(file);
  if (problem) return problem;
  const s = app.get();
  const run = s.runId;
  const refused = englishChoiceRefused(s);
  if (refused) return refused;
  if (!s.siteData.profileLoaded) return 'Wait until the Admission Form is open in step 2.';
  const passport = s.student!.passport;
  const { kind, ext } = pickedFileType(file);
  const preview = URL.createObjectURL(file);
  clearEnglishStop(run);
  setSiteData(run, { englishAttached: false, englishByStaff: { name: file.name, size: file.size, type: file.type }, englishFromSite: undefined, englishChoosing: false });
  setDoc(run, 'english', { status: 'loading', startedAt: Date.now(), url: preview, kind, fileName: undefined, note: undefined });
  showDoc('english', 1, false);
  void flow(
    run,
    2,
    'english',
    async () => {
      let saved: DocFile;
      try {
        // Saved in the student's folder first; the site gets the saved copy.
        saved = isLive()
          ? await runRead(run, 2, `Save "${file.name}" in the student's folder`, () => uploadFile(passport, 'english', file), {
              detail: 'The certificate you added',
            })
          : { url: preview, kind };
      } catch (e) {
        if (e instanceof Cancelled) throw e;
        const note = e instanceof StopError ? e.message : "The file wasn't saved.";
        setDoc(run, 'english', { status: 'error', note });
        // Nothing to try again: the staff chooses the file again.
        throw new StopError(e instanceof StopError ? e.title : "Your file wasn't saved", note, { retry: undefined, hint: 'Choose the file again in the English certificate box below.' });
      }
      const name = recordFile(run, 'english', saved, ext);
      setDoc(run, 'english', { status: 'ready', url: saved.url, kind: saved.kind, fileName: name, note: undefined });
      noteActivity(run, 2, `Saved "${name}"`, "Added by you, in the student's folder");
      await attachEnglish(run);
    },
    { working: 'Adding your certificate' },
  );
  return null;
}

/** Why the staff can't choose or add the English certificate right now, or null when they can. */
function englishChoiceRefused(s: AppState): string | null {
  const run = s.runId;
  if (!s.student) return 'Start a student first.';
  if (s.saves.profile) return 'The Admission Profile is already saved on the site.';
  if (s.busy[busyKeyFor(run, 'profile')]) return 'Wait until Continue To Next has finished.';
  if (s.busy[busyKeyFor(run, 'english')]) return 'Wait until the tool has finished with the certificate.';
  const doc = s.docs.english;
  if (doc.status === 'error' || (doc.status === 'ready' && s.siteData.englishChoosing)) return null;
  return doc.status === 'ready' ? 'The tool already has the certificate.' : 'Wait until the tool has looked for the certificate on the site.';
}

/** The certificate's stop in step 2 goes once the staff chooses or adds the certificate. */
function clearEnglishStop(run: number) {
  const err = app.get().steps[2].error;
  if (err && (err.retry === 'english' || err.hint === CHOOSE_ENGLISH_HINT || err.hint === ADD_ENGLISH_HINT || err.hint === CHOOSE_AGAIN_HINT)) {
    setStep(run, 2, { error: undefined });
  }
}

const CHOOSE_AGAIN_HINT = "Choose another document in the student's list below, or add the certificate yourself.";

/** Words that name a link, not a document ("View", "Download"). */
const LINK_WORDS = /^(view|download|open|click|show|file|link)\b/i;

/**
 * A document's name in the site's list. On Applicant Details the name is the link itself (under "Image URL");
 * a list whose link only says "View" has the name in its own column.
 */
export function englishDocName(docs: SiteDocs, index: number): string {
  const row = docs.rows[index];
  if (!row) return '';
  const heads = docs.headers.map((h) => h.toLowerCase());
  const cellUnder = (test: (h: string) => boolean) => {
    const i = heads.findIndex(test);
    return i >= 0 ? (row.cells[i] ?? '').trim() : '';
  };
  const link = cellUnder((h) => /image\s*url/.test(h));
  const named = cellUnder((h) => /document|name/.test(h) && !/uploaded/.test(h));
  for (const v of [link, named]) if (v && !LINK_WORDS.test(v)) return v;
  return row.cells.map((c) => c.trim()).find((c) => c && !/^\d+\.?$/.test(c) && !LINK_WORDS.test(c)) ?? `Row ${index + 1}`;
}

/** Reads the student's documents on Applicant Details, for the staff to choose from. True when there are some. */
async function listEnglishDocs(run: number): Promise<boolean> {
  const luc = app.get().form.lucSaved;
  if (!luc) return false;
  try {
    const docs = await runRead(run, 2, "Read the student's documents on Applicant Details", () => call(run, 'english.list', { luc }), {
      done: (d) => `${d.rows.length} document${d.rows.length === 1 ? '' : 's'} listed below, for you to choose from`,
    });
    setSiteData(run, { englishDocs: docs });
    return docs.rows.length > 0;
  } catch (e) {
    if (e instanceof Cancelled) throw e;
    setSiteData(run, { englishDocs: undefined });
    return false;
  }
}

/**
 * The staff pressed a document in the student's list (Applicant Details): the tool downloads that one, saves it
 * in the student's folder as the English certificate, attaches it to the form and shows it on the left.
 * Returns a message if it can't be used.
 */
export function pickEnglishDoc(index: number): string | null {
  const s = app.get();
  const run = s.runId;
  const refused = englishChoiceRefused(s);
  if (refused) return refused;
  const docs = s.siteData.englishDocs;
  const row = docs?.rows[index];
  if (!docs || !row) return 'The list is gone. Press Try again to read it again.';
  if (!row.file) return 'That row has no file.';
  const passport = s.student!.passport;
  const luc = s.form.lucSaved;
  const name = englishDocName(docs, index);
  clearEnglishStop(run);
  setSiteData(run, { englishAttached: false, englishByStaff: undefined, englishFromSite: { name }, englishChoosing: false });
  setDoc(run, 'english', { status: 'loading', startedAt: Date.now(), url: undefined, fileName: undefined, note: undefined });
  showDoc('english', 1, false);
  void flow(
    run,
    2,
    'english',
    async () => {
      let saved: DocFile;
      try {
        saved = await runRead(run, 2, `Download "${name}" from Applicant Details`, () => call(run, 'english.pick', { passport, luc, index, cells: row.cells }), {
          detail: 'The document you chose',
        });
      } catch (e) {
        if (e instanceof Cancelled) throw e;
        const note = e instanceof StopError ? e.message : 'The download stopped.';
        setDoc(run, 'english', { status: 'error', note });
        throw new StopError(e instanceof StopError ? e.title : "The document didn't arrive", note, { retry: undefined, hint: CHOOSE_AGAIN_HINT });
      }
      const file = recordFile(run, 'english', saved, saved.kind === 'pdf' ? 'pdf' : 'png');
      setDoc(run, 'english', { status: 'ready', url: saved.url, kind: saved.kind, fileName: file, note: undefined });
      noteActivity(run, 2, `Saved "${file}"`, `"${name}" from Applicant Details, chosen by you`);
      await attachEnglish(run);
    },
    { working: 'Getting the document you chose' },
  );
  return null;
}

/** The staff wants a different file than the one attached: the list and the add box show again, until the profile is saved. */
export function chooseEnglishAgain() {
  const s = app.get();
  const run = s.runId;
  if (!s.student || s.saves.profile || s.busy[busyKeyFor(run, 'english')] || s.busy[busyKeyFor(run, 'profile')]) return;
  if (s.docs.english.status !== 'ready') return;
  setSiteData(run, { englishChoosing: true });
  if (!s.siteData.englishDocs) {
    void flow(
      run,
      2,
      'english',
      async () => {
        await listEnglishDocs(run);
        settle(run, 2);
      },
      { working: "Reading the student's documents" },
    );
  }
}

/** The staff keeps the file already attached. */
export function keepEnglish() {
  setSiteData(currentRun(), { englishChoosing: false });
}

/** Continue To Next on the Admission Profile, pressed by the staff. */
export async function continueProfile() {
  const run = currentRun();
  if (profileMissing(app.get()).length > 0) return;
  const ok = await flow(
    run,
    2,
    'profile',
    async () => {
      const passport = passportOf();
      const f = app.get().form;
      const englishFile = app.get().docs.english.fileName ?? '';
      const values: ProfileValues = {
        studentType: f.studentType,
        salutation: f.salutation,
        intake: f.intake,
        contactCode: f.contactCode,
        contactNumber: f.contactNumber,
        highestQualification: f.highestQualification,
        visaType: f.visaType,
        studentCategory: f.studentCategory,
        classType: f.classType,
        accommodation: f.accommodation,
      };
      const expected: [string, string][] = [
        ['Student Type', f.studentType],
        ['Salutation', f.salutation],
        ['Intake', f.intake],
        ['Personal Contact', `${f.contactCode} ${f.contactNumber}`],
        ['Highest Qualification', f.highestQualification],
        ['Visa Type', f.visaType],
        ['Student Category', f.studentCategory],
        ['Class Type', f.classType],
        ['Accommodation', f.accommodation],
        ['English certificate', englishFile],
      ];
      await reopenIfNotOnProfile(() =>
        runRead(run, 2, 'Fill your values on the Admission Profile', () => call(run, 'step2.fill', { passport, values, englishFile }), {
          done: () => '9 fields filled, each picked by its exact text, and the certificate attached',
        }),
      );
      const back = await runRead(run, 2, 'Read every value back from the site', () => call(run, 'step2.readBack', { passport, englishFile }));
      const rows = differences(expected, back);
      if (rows.length > 0) {
        throw new StopError(
          'The site shows a different value',
          'The tool did not press Continue To Next. Check the field on the site, then press Continue To Next again.',
          { rows, retry: undefined },
        );
      }
      noteActivity(run, 2, 'Every value matches what you picked');
      await runSave(run, 2, 'profile', 'Click Continue To Next', () => call(run, 'step2.continue', {}), { againLabel: 'Continue To Next' });
      try {
        await runRead(run, 2, 'Check the Address tab is now open', () => call(run, 'step2.checkNext', {}));
      } catch (e) {
        if (!(e instanceof StopError) || app.get().siteData.staffConfirmed?.profile) throw e;
        // The site didn't move on, so the save didn't go through: the staff can fix it and press again.
        unmarkSaved(run, 'profile');
        throw new StopError(e.title, `${e.message} If it did save, press "It saved on the site". Otherwise fix it on the site and press Continue To Next again.`, {
          confirmSaved: 'profile',
        });
      }
      settle(run, 2);
      settle(run, 3);
      toast('Admission Profile saved. Step 3 has started.', 'success');
    },
    { working: 'Saving', noRetryButton: true, reopen: { key: 'step2', label: 'Open the form again', then: 'press Continue To Next again' } },
  );
  if (ok && app.get().saves.profile) void passThrough(run);
}

/** The form isn't on the Admission Profile (for example it was emptied by a login): offer to open it again. */
async function reopenIfNotOnProfile(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (e) {
    if (!(e instanceof StopError) || e.title !== 'Not on the Admission Profile') throw e;
    throw new StopError(e.title, `${e.message} Press "Open the form again", then press Continue To Next again.`, {
      ...e.extra,
      retry: 'step2',
      retryLabel: 'Open the form again',
    });
  }
}

/* ------------------------------------------------------------------- step 3 */

async function passThrough(run: number) {
  await flow(
    run,
    3,
    'passThrough',
    async () => {
      await runSave(run, 3, 'address', 'Address: Continue To Next', () => call(run, 'step3.pass', { tab: 'address' }), { againLabel: 'Try again' });
      await runSave(run, 3, 'whatsapp', 'Add WhatsApp: Continue To Next', () => call(run, 'step3.pass', { tab: 'whatsapp' }), { againLabel: 'Try again' });
      await runSave(run, 3, 'wechat', 'Add Wechat: Continue To Next', () => call(run, 'step3.pass', { tab: 'wechat' }), { againLabel: 'Try again' });
      const parents = await runRead(run, 3, 'Open Parents Details and read it', () => call(run, 'step3.parents', {}), {
        done: () => 'Only the Contact No can be changed',
      });
      setSiteData(run, { parents });
      if (!app.get().form.parentContact) setForm({ parentContact: parents.contactNo });
      settle(run, 3);
    },
    { working: 'Passing through tabs' },
  );
}

/** Continue To Next on Parents Details, pressed by the staff. */
export async function continueParents() {
  const run = currentRun();
  if (parentsMissing(app.get()).length > 0) return;
  await flow(
    run,
    3,
    'parents',
    async () => {
      const s = app.get();
      const contact = tidySpaces(s.form.parentContact);
      const siteValue = s.siteData.parents?.contactNo ?? '';
      if (!s.saves.parents) {
        if (contact !== siteValue) {
          await runRead(run, 3, `Write Contact No "${contact}"`, () => call(run, 'step3.writeContact', { value: contact }));
          const back = await runRead(run, 3, 'Read Contact No back', () => call(run, 'step3.readContact', {}), {
            done: (v) => `The site shows "${v}"`,
          });
          if (back !== contact) {
            throw new StopError(
              'The site shows a different Contact No',
              'The tool did not press Continue To Next. Check the Contact No, then press Continue To Next again.',
              { rows: [{ field: 'Contact No', expected: contact, actual: back || '(empty)' }], retry: undefined },
            );
          }
        } else {
          noteActivity(run, 3, 'Contact No unchanged', contact);
        }
      }
      await runSave(run, 3, 'parents', 'Parents Details: Continue To Next', () => call(run, 'step3.continueParents', {}), {
        againLabel: 'Continue To Next',
      });
      await runSave(run, 3, 'education', 'Education: Continue To Next', () => call(run, 'step3.pass', { tab: 'education' }), {
        againLabel: 'Continue To Next',
      });
      const pay = await runRead(run, 3, 'Open Payment Plan and read it', () => call(run, 'step3.payment', {}), {
        done: (p) => `Fees and Financer as the site has them · Financer: ${p.financer || 'none'}`,
      });
      applyPayment(run, pay);
      settle(run, 3);
    },
    { working: 'Saving', noRetryButton: true },
  );
}

/** The fees by the names the site gives them. */
export const FEE_LABELS: Record<FeeKey, string> = {
  kptFees: 'KPT Fees',
  scholarship: 'Lincoln Foundation Scholarship',
  tuitionFees: 'Currently Tution Fees',
  totalSemester: 'Total Semester',
};

/**
 * Shows Payment Plan as the site has it. A fee the site only shows always follows the site.
 * The Financer, and a fee the site gives a box, follow the site until the staff changes them.
 */
function applyPayment(run: number, pay: PaymentRead) {
  const s = app.get();
  if (s.runId !== run) return;
  const before = s.siteData.payment;
  const f = s.form;
  const untouched = (now: string, was: string | undefined) => (was === undefined ? now === '' : now === was);
  const next: Partial<FormState> = {};
  for (const k of FEE_KEYS) {
    if (!pay.fees[k].editable || untouched(f[k], before?.fees[k].value)) next[k] = pay.fees[k].value;
  }
  if (untouched(f.financer, before?.financer) || !pay.financerOptions.includes(f.financer)) {
    next.financer = pay.financerOptions.includes(pay.financer) ? pay.financer : '';
  }
  setForm(next);
  setSiteData(run, { paymentLoaded: true, payment: pay });
}

export function askFinalSubmit() {
  if (finalMissing(app.get()).length === 0) setUi({ confirm: 'final' });
}

/** Final Submit on Payment Plan, pressed by the staff after the confirmation. */
export async function finalSubmit() {
  setUi({ confirm: null });
  const run = currentRun();
  if (finalMissing(app.get()).length > 0) return;
  const ok = await flow(
    run,
    3,
    'final',
    async () => {
      const s = app.get();
      const f = s.form;
      if (!s.saves.final) {
        const values: PaymentValues = {
          financer: f.financer,
          kptFees: f.kptFees.trim(),
          scholarship: f.scholarship.trim(),
          tuitionFees: f.tuitionFees.trim(),
          totalSemester: f.totalSemester.trim(),
        };
        const read = s.siteData.payment;
        const changed = FEE_KEYS.filter((k) => read?.fees[k].editable && values[k] !== read.fees[k].value);
        await runRead(run, 3, changed.length ? 'Fill the Financer and the fees you changed' : 'Fill the Financer', () => call(run, 'step3.fillPayment', { values }), {
          done: () =>
            `Financer: ${values.financer}` + changed.map((k) => ` · ${FEE_LABELS[k]}: ${values[k] || '(emptied)'}`).join(''),
        });
        // Final Submit only if the whole Payment Plan shows what the staff confirmed.
        const now = await runRead(run, 3, 'Read Payment Plan again', () => call(run, 'step3.payment', {}));
        const rows = differences(
          [['Financer', values.financer], ...FEE_KEYS.map((k): [string, string] => [FEE_LABELS[k], values[k]])],
          [['Financer', now.financer], ...FEE_KEYS.map((k): [string, string] => [FEE_LABELS[k], now.fees[k].value])],
        );
        if (rows.length > 0) {
          applyPayment(run, now);
          throw new StopError(
            'The site shows a different value',
            'The tool did not press Final Submit. The portal now shows what the site has. Check Payment Plan, then press Final Submit again.',
            { rows, retry: undefined },
          );
        }
      }
      await runSave(run, 3, 'final', 'Click Final Submit', () => call(run, 'step3.final', {}), { againLabel: 'Final Submit' });
      settle(run, 3);
      toast(`Final Submit done. Next: the English result, on "${RESULT_SECTION}".`, 'success');
    },
    { working: 'Submitting', noRetryButton: true },
  );
  if (ok && app.get().saves.final) void resultFlow(run);
}

/* ------------------------------------------- step 3: Verify / Upload English Result */

const RESULT = RESULT_SECTION;
/** After a logout lost the section: "Look again" finds it again (or opens its page in the tool's own tab). */
const RESULT_REOPEN = { key: 'result' as RetryKey, label: 'Look again', then: 'carry on here in step 3' };
const resultWaitLines = new Map<number, ReturnType<typeof waitingActivity>>();

/**
 * One piece of work on the section. Only one runs at a time (View, the Test Name, Upload), and a stop shows in step 3.
 * With `retry`, the stop has a "Look again" button that starts again from finding the section.
 */
function onResult(run: number, working: string, body: () => Promise<void>, retry: boolean) {
  return flow(
    run,
    3,
    'result',
    async () => {
      try {
        await body();
      } finally {
        setSiteData(run, { resultWork: undefined });
      }
    },
    { working, ...(retry ? { retryLabel: 'Look again' } : { noRetryButton: true }), reopen: RESULT_REOPEN },
  );
}

const listWords = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** A cell of the student's row on Verify / Upload English Result, by the site's own heading. */
export function resultCell(v: ResultView, heading: string): string {
  const i = v.headers.findIndex((h) => h.replace(/\s+/g, ' ').trim().toLowerCase() === heading.toLowerCase());
  return i >= 0 ? (v.rows[0]?.[i] ?? '').trim() : '';
}

/** A date as the site's box shows it: a calendar box shows dd/mm/yyyy, a typed box its own pattern. */
export const resultDateShown = (f: ResultField, iso: string) => writeDate(iso, !f.format || f.format === 'iso' ? 'dd/mm/yyyy' : f.format);

/** The section as the site shows it now. A box keeps the staff's value; a box new to the portal starts with what the site shows. */
function applyResult(run: number, view: ResultView) {
  const s = app.get();
  if (s.runId !== run) return;
  setSiteData(run, { result: view, ...(view.state === 'student' ? {} : { resultViewed: undefined }) });
  if (view.state !== 'student' || !view.testName || view.testName !== s.form.resultTestName) return;
  const values = { ...s.form.resultValues };
  let changed = false;
  for (const f of view.fields) {
    if (f.locked || values[f.key] !== undefined) continue;
    values[f.key] = f.value;
    changed = true;
  }
  if (changed) setForm({ resultValues: values });
}

/** The certificate for the upload shows on the left while the staff is on step 3. */
function showResultDoc() {
  const s = app.get();
  if (s.activeStep !== 3) return;
  const key: DocKey = s.docs.englishResult.status !== 'waiting' ? 'englishResult' : 'english';
  if (s.activeDoc !== key) showDoc(key, 1, false);
}

async function findResult(run: number) {
  const passport = passportOf();
  setSiteData(run, { resultWork: 'find' });
  const view = await runRead(run, 3, `Find "${RESULT}"`, () => call(run, 'result.find', { passport }), {
    detail: "LOS's own page for it, opened by its address in its own tab",
    done: () => 'Opened in its own tab',
  });
  applyResult(run, view);
}

/**
 * After Final Submit: finds Verify / Upload English Result and Views the student with the Student ID from step 4.
 * The staff picks the Test Name, fills its boxes and presses Upload. "Look again" starts here too.
 */
async function resultFlow(run: number) {
  if (app.get().saves.englishReupload) return;
  await onResult(
    run,
    'Opening the English result upload',
    async () => {
      await findResult(run);
      showResultDoc();
      await viewIfReady(run);
      settle(run, 3);
    },
    true,
  );
}

/**
 * Whether the tool should run step 4 again by itself to get the Student ID: step 3 has none yet, step 4 has found no student
 * and isn't working (it stopped, or never ran). Step 4 is only run again once per student.
 */
export function needsStepFourAgain(s: AppState, run: number, alreadyAsked: boolean): boolean {
  if (alreadyAsked || s.runId !== run || s.siteData.fileRow || s.form.resultIdByStaff || tidySpaces(s.form.resultStudentId)) return false;
  return !s.busy[busyKeyFor(run, 'step4')];
}

const stepFourAsked = new Set<number>();

/** Step 3 needs the Student ID that step 4 finds. If step 4 stopped, it runs again by itself: nobody has to press Try again. */
function getStudentIdFromStep4(run: number) {
  const look = () => {
    const s = app.get();
    if (s.runId !== run || !resultWaitLines.has(run) || tidySpaces(s.form.resultStudentId) || s.saves.englishReupload) return true;
    if (!needsStepFourAgain(s, run, stepFourAsked.has(run))) return false;
    stepFourAsked.add(run);
    noteActivity(run, 3, 'Getting the Student ID from step 4', 'Step 4 had not found it, so the tool runs step 4 again by itself');
    void step4(run);
    return true;
  };
  if (look()) return;
  // Step 4 is still working: when it ends without a student, it runs again.
  const timer = setInterval(() => {
    if (look()) clearInterval(timer);
  }, 2000);
}

/** View, once the Student ID is known (from step 4, or typed by the staff). Until then a line says what it waits for. */
async function viewIfReady(run: number) {
  const id = tidySpaces(app.get().form.resultStudentId);
  if (!id) {
    if (!resultWaitLines.has(run)) {
      resultWaitLines.set(run, waitingActivity(run, 3, 'Student ID → View', 'Waits for the Student ID from step 4. You can also type it below and press View.'));
    }
    getStudentIdFromStep4(run);
    return;
  }
  await viewStudent(run, id);
}

/** The row after View must be this student: one row, with this passport. Otherwise nothing is filled or uploaded. */
function checkResultRow(v: ResultView, id: string, passport: string) {
  if (v.state !== 'student' || v.rows.length === 0) {
    throw new StopError('No student after View', `After View with Student ID ${id}, "${RESULT}" shows no student. Nothing was uploaded. Check the Student ID, then press View again.`);
  }
  if (v.rows.length > 1) {
    throw new StopError(
      'More than one row',
      `After View with Student ID ${id}, "${RESULT}" shows ${v.rows.length} rows, so the tool stopped rather than guess. Nothing was uploaded. Check the Student ID, then press View again.`,
    );
  }
  if (!v.samePassport) {
    const shown = resultCell(v, 'IC/Passport');
    throw new StopError(
      'Another student',
      `The row for Student ID ${id} has the IC/Passport ${shown || '(empty)'}, not ${passport}. Nothing was uploaded. Check the Student ID, then press View again.`,
      { rows: [{ field: 'IC/Passport', expected: passport, actual: shown || '(empty)' }] },
    );
  }
}

/** Student ID → View on the site. The row must be this student; then the Test Name the staff picked goes on again. */
async function viewStudent(run: number, id: string) {
  const s = app.get();
  const passport = passportOf();
  const line = resultWaitLines.get(run);
  if (line) {
    line.finish(s.form.resultIdByStaff ? `Student ID ${id}, typed by you` : `Student ID ${id}, from step 4`);
    resultWaitLines.delete(run);
  }
  setSiteData(run, { resultViewed: undefined, resultWork: 'view' });
  let view: ResultView;
  try {
    view = await runRead(run, 3, `Student ID ${id} → View`, () => call(run, 'result.view', { passport, studentId: id, fileName: resultCertificate(app.get())?.name }), {
      done: (v) => [resultCell(v, 'Name'), resultCell(v, 'Programme')].filter(Boolean).join(' · ') || `${v.rows.length} row${v.rows.length === 1 ? '' : 's'}`,
    });
  } catch (e) {
    // Once the upload has gone through, LOS no longer finds the student: a View that finds nobody after an Upload may mean just that.
    const sd = app.get().siteData;
    if (e instanceof StopError && sd.resultUploadTried && !app.get().saves.englishReupload) {
      throw new StopError(e.title, e.message, {
        ...e.extra,
        confirmSaved: 'englishReupload',
        hint: 'Upload was pressed earlier. Once it goes through, LOS no longer finds the student: look at the site window, and if it took the upload, press "It saved on the site".',
      });
    }
    throw e;
  }
  applyResult(run, view);
  // The row LOS shows is the answer for this Student ID, even when it is another student's: the portal shows it
  // (with a red line), and nothing can be uploaded until a Student ID shows this student.
  if (view.state === 'student') setSiteData(run, { resultViewed: id });
  checkResultRow(view, id, passport);
  noteActivity(run, 3, 'The row is this student', `IC/Passport ${passport}`);
  await testIfPicked(run);
}

/** The site starts again without a Test Name after View: the one the staff picked goes on again. */
async function testIfPicked(run: number) {
  const s = app.get();
  const want = s.form.resultTestName;
  const v = s.siteData.result;
  if (!want || !v || v.state !== 'student' || v.testName === want) return;
  if (!v.testNames.includes(want)) {
    setForm({ resultTestName: '', resultValues: {} });
    noteActivity(run, 3, `The site doesn't offer "${want}" any more`, 'Pick the Test Name again');
    return;
  }
  await testOnSite(run, want);
}

async function testOnSite(run: number, name: string) {
  const passport = passportOf();
  setSiteData(run, { resultWork: 'test' });
  const view = await runRead(run, 3, `Test Name: ${name}`, () => call(run, 'result.test', { passport, testName: name, fileName: resultCertificate(app.get())?.name }), {
    done: (v) => (v.fields.length ? `The site asks for ${listWords(v.fields.map((f) => f.label))}` : 'The site asks for nothing more, so Upload comes next'),
  });
  applyResult(run, view);
}

/** Step 4's Student ID goes in step 3's box (unless the staff typed one). If the section waits for it, View follows. */
function resultIdFromStep4(run: number, studentId: string) {
  const s = app.get();
  if (s.runId !== run || s.form.resultIdByStaff) return;
  setForm({ resultStudentId: studentId });
  if (!studentId || !resultWaitLines.has(run) || s.saves.englishReupload) return;
  void onResult(
    run,
    'Viewing the student',
    async () => {
      await viewIfReady(run);
      settle(run, 3);
    },
    true,
  );
}

/** The staff typed the Student ID. */
export function setResultStudentId(value: string) {
  const s = app.get();
  setForm({ resultStudentId: value, resultIdByStaff: tidySpaces(value) !== (s.siteData.fileRow?.studentId ?? '') });
}

/** View, pressed by the staff: the Student ID goes in on the site and View is pressed there. */
export function viewEnglishResult() {
  const s = app.get();
  const run = s.runId;
  const id = tidySpaces(s.form.resultStudentId);
  if (!s.student || !id || !s.saves.final || s.saves.englishReupload) return;
  void onResult(
    run,
    'Viewing the student',
    async () => {
      if (!app.get().siteData.result) await findResult(run);
      await viewStudent(run, id);
      settle(run, 3);
    },
    false,
  );
}

/** The staff picked the Test Name: it goes on the site, which then shows the boxes for that test. */
export function pickResultTest(name: string) {
  const s = app.get();
  const run = s.runId;
  if (!s.student || s.saves.englishReupload || s.busy[busyKeyFor(run, 'result')] || name === s.form.resultTestName) return;
  // Another test: its boxes start empty, so nothing meant for the last test goes up with this one.
  setForm({ resultTestName: name, resultValues: {} });
  const v = s.siteData.result;
  // Only on this student's row, after View with the Student ID the portal shows.
  if (!v || v.state !== 'student' || v.rows.length !== 1 || !v.samePassport || s.siteData.resultViewed !== tidySpaces(s.form.resultStudentId)) return;
  void onResult(
    run,
    'Picking the Test Name',
    async () => {
      await testOnSite(run, name);
      settle(run, 3);
    },
    true,
  );
}

/** The staff's value for one of the boxes the site shows for the test (a date as yyyy-mm-dd). */
export function setResultValue(key: string, value: string) {
  setForm({ resultValues: { ...app.get().form.resultValues, [key]: value } });
}

/** The box to choose another file for the upload shows (or hides). */
export function chooseResultFile(on = true) {
  const s = app.get();
  if (!s.student || s.saves.englishReupload) return;
  setSiteData(s.runId, { resultChoosing: on });
}

/** Back to step 2's certificate for the upload. The file the staff chose stays in the student's folder. */
export function useStep2Certificate() {
  const s = app.get();
  const run = s.runId;
  if (!s.student || s.saves.englishReupload || s.busy[busyKeyFor(run, 'resultFile')] || s.busy[busyKeyFor(run, 'result')]) return;
  setDoc(run, 'englishResult', { status: 'waiting', url: undefined, kind: undefined, fileName: undefined, note: undefined, startedAt: undefined });
  setSiteData(run, { resultFileByStaff: undefined, resultChoosing: false });
  noteActivity(run, 3, "Back to step 2's certificate for the upload", s.docs.english.fileName);
  if (app.get().activeStep === 3) showDoc('english', 1, false);
}

/** The staff chose another file for the upload. It is saved in the student's folder and shows on the left. */
export function addEnglishResultFile(file: File): string | null {
  const problem = pickedFileProblem(file);
  if (problem) return problem;
  const s = app.get();
  const run = s.runId;
  if (!s.student) return 'Start a student first.';
  if (s.saves.englishReupload) return 'The English result is already uploaded.';
  if (s.busy[busyKeyFor(run, 'result')]) return 'Wait until the tool has finished on the site.';
  if (s.busy[busyKeyFor(run, 'resultFile')]) return 'Wait until the last file is saved.';
  const passport = s.student.passport;
  const { kind, ext } = pickedFileType(file);
  const preview = URL.createObjectURL(file);
  setSiteData(run, { resultFileByStaff: { name: file.name, size: file.size, type: file.type }, resultChoosing: false });
  setDoc(run, 'englishResult', { status: 'loading', startedAt: Date.now(), url: preview, kind, fileName: undefined, note: undefined });
  showDoc('englishResult', 1, false);
  void flow(
    run,
    3,
    'resultFile',
    async () => {
      let saved: DocFile;
      try {
        // Saved in the student's folder first; the site gets the saved copy.
        saved = isLive()
          ? await runRead(run, 3, `Save "${file.name}" in the student's folder`, () => uploadFile(passport, 'englishResult', file), {
              detail: 'The file you chose for the English result',
            })
          : { url: preview, kind };
      } catch (e) {
        if (e instanceof Cancelled) throw e;
        const note = e instanceof StopError ? e.message : "The file wasn't saved.";
        setDoc(run, 'englishResult', { status: 'error', note });
        throw new StopError(e instanceof StopError ? e.title : "Your file wasn't saved", note, { retry: undefined, hint: 'Choose the file again under English Result below.' });
      }
      const name = recordFile(run, 'englishResult', saved, ext);
      setDoc(run, 'englishResult', { status: 'ready', url: saved.url, kind: saved.kind, fileName: name, note: undefined });
      noteActivity(run, 3, `Saved "${name}"`, "Chosen by you for the English result, in the student's folder");
      settle(run, 3);
    },
    { working: 'Saving your file' },
  );
  return null;
}

/** Upload, pressed by the staff: the tool fills the section on the site, reads everything back, then presses Upload there. */
export async function uploadEnglishResult() {
  const run = currentRun();
  const start = app.get();
  if (start.saves.englishReupload || resultMissing(start).length > 0) return;
  await onResult(
    run,
    'Uploading',
    async () => {
      setSiteData(run, { resultWork: 'upload' });
      const s = app.get();
      const passport = passportOf();
      const cert = resultCertificate(s);
      if (!cert) throw new StopError('Choose the certificate again', "The file for the English result isn't in the student's folder.", { retry: undefined });
      const testName = s.form.resultTestName;
      const fields = resultFields(s).filter((f) => !f.locked);
      const values = fields.map((f) => ({ key: f.key, label: f.label, value: resultValueFor(f, s.form.resultValues[f.key] ?? '') }));
      // A date is compared as the site's box shows it, so the staff sees it the same way in a difference.
      const shown = (label: string, value: string) => {
        const f = fields.find((x) => x.label === label);
        return f?.kind === 'date' ? resultDateShown(f, value) : value;
      };
      let filled: ResultFilled;
      try {
        filled = await runRead(
          run,
          3,
          `Fill ${listWords([`Test Name ${testName}`, ...fields.map((f) => f.label)])}, then attach "${cert.name}"`,
          () => call(run, 'result.fill', { passport, fileName: cert.name, testName, values }),
          { done: () => 'Filled, and the certificate attached last' },
        );
      } catch (e) {
        // The site now shows other boxes for this test: the portal shows them too, for the staff to fill.
        if (e instanceof StopError && e.title === 'The site shows other boxes') await findResult(run).catch(() => undefined);
        throw e;
      }
      const expected: [string, string][] = [['English Result', cert.name], ['Test Name', testName], ...values.map((v): [string, string] => [v.label, shown(v.label, v.value)])];
      const rows = differences(
        expected,
        filled.back.map(([label, value]): [string, string] => [label, shown(label, value)]),
      );
      if (rows.length > 0) {
        throw new StopError('The site shows a different value', 'The tool did not press Upload. Check the values here, then press Upload again.', { rows, retry: undefined });
      }
      if (filled.invalid.length > 0) {
        throw new StopError(
          "The site doesn't take a value",
          `The site's own check refuses ${filled.invalid.map((x) => `"${x.label}" (${x.message})`).join(', ')}. The tool did not press Upload. Fix it here, then press Upload again.`,
          { retry: undefined },
        );
      }
      noteActivity(run, 3, 'Every value matches what you filled', [cert.name, testName, ...values.map((v) => shown(v.label, v.value))].join(' · '));
      setSiteData(run, { resultUploadTried: true });
      await runSave(run, 3, 'englishReupload', 'Click Upload', () => call(run, 'result.upload', { passport, fileName: cert.name }), { againLabel: 'Upload' });
      finishResult(run, cert.name, testName);
    },
    false,
  );
}

function finishResult(run: number, file: string, testName: string) {
  setSiteData(run, { resultUploaded: { file, testName }, resultChoosing: false });
  settle(run, 3);
  toast('Step 3 is done: the English result is uploaded.', 'success');
}

/* ------------------------------------------------------------------- step 0 */

/** The A/c Mini Statement: passport → View → Submit Reason (if asked) → the report → PDF in the student's folder. Read only. */
async function step0(run: number) {
  await flow(
    run,
    0,
    'step0',
    async () => {
      const passport = passportOf();
      const reason = app.get().settings.accessReason;
      if (app.get().docs.miniStatement.status !== 'ready') {
        await runRead(run, 0, 'Open A/c Mini Statement', () => call(run, 'step0.open', {}));
        const view = await runRead(run, 0, `Student Id/PassportIC: ${passport} → View`, () => call(run, 'step0.view', { passport }), {
          done: (v) => (v.reasonAsked ? 'The site asks for an access reason' : 'No access reason asked this time'),
        });
        if (view.reasonAsked) {
          await runRead(run, 0, `Access reason "${reason}" → Submit Reason`, () => call(run, 'step0.reason', { reason }), {
            done: (said) => (said ? said : 'Reason submitted'),
          });
        }
        await fetchDoc(run, 0, 'miniStatement', 'Export the mini statement as PDF', () => call(run, 'step0.pdf', { passport }));
      }
      settle(run, 0);
    },
    { working: 'Fetching' },
  );
}

/* ------------------------------------------------------------------- step 4 */

async function step4(run: number) {
  await flow(
    run,
    4,
    'step4',
    async () => {
      const passport = passportOf();
      const reason = app.get().settings.accessReason;
      if (!app.get().siteData.docsTabOpen) {
        await runRead(run, 4, 'Open Student Files', () => call(run, 'step4.open', {}));
        const view = await runRead(run, 4, `Student ID/Name/IC/Passport no: ${passport} → View`, () => call(run, 'step4.view', { passport }), {
          done: (v) => (v.reasonAsked ? 'The site asks for an access reason' : 'No access reason asked this time'),
        });
        if (view.reasonAsked) {
          await runRead(run, 4, `Access reason "${reason}" → Submit Reason`, () => call(run, 'step4.reason', { reason }), {
            done: (said) => (said ? `Popup: "${said}" → OK` : 'Reason submitted'),
          });
        }
        const row = await runRead(run, 4, 'Check the result: exactly one student with this passport', () => call(run, 'step4.result', { passport }), {
          done: (r) => `${r.name} · ${r.studentId}`,
        });
        setSiteData(run, { fileRow: row });
        resultIdFromStep4(run, row.studentId);
        await runRead(run, 4, 'View details → Click Me To View All Documents', () => call(run, 'step4.docsTab', {}), {
          done: () => 'The documents tab is open',
        });
        setSiteData(run, { docsTabOpen: true });
      }
      await docsTabWork(run, async () => {
        if (app.get().docs.profile.status !== 'ready') {
          await fetchDoc(run, 4, 'profile', 'Download "Student Profile and Family Details" (section 1)', () =>
            call(run, 'step4.download', { doc: 'profile', passport }),
          );
        }
        if (app.get().docs.studentType.status !== 'ready') {
          await fetchDoc(run, 4, 'studentType', 'Download "Student Type Document" (section 1, whole name)', () =>
            call(run, 'step4.download', { doc: 'studentType', passport }),
          );
        }
      });
      settle(run, 4);
    },
    { working: 'Downloading' },
  );
}

/** Work in the student's documents tab. If a logout lost that tab, Try again opens it again from Student Files. */
async function docsTabWork(run: number, work: () => Promise<void>) {
  try {
    await work();
  } catch (e) {
    if (e instanceof StopError && e.title === TAB_LOGGED_OUT) setSiteData(run, { docsTabOpen: false });
    throw e;
  }
}

/* ------------------------------------------------------------------- step 5 */

async function step5(run: number) {
  if (app.get().docs.val.status !== 'ready') void valFlow(run);
  await flow(
    run,
    5,
    'step5',
    async () => {
      const passport = passportOf();
      await runRead(run, 5, 'Open Passport Movement Control', () => call(run, 'step5.open', {}));
      const read = await runRead(run, 5, `Passport Collection: ${passport} → Submit`, () => call(run, 'step5.load', { passport }), {
        done: () => 'This only loads the form',
      });
      const shown = read.fields.find((x) => x.key === 'passportNumber')?.value ?? '';
      if (!sameId(shown, passport)) {
        throw new StopError('The form is for another passport', `The Passport Collection form shows ${shown || 'no passport'}, not ${passport}. The tool stopped.`, {
          rows: [{ field: 'Passport Number', expected: passport, actual: shown || '(empty)' }],
        });
      }
      noteActivity(run, 5, 'Form loaded: its Passport Number matches', shown);
      applyCollection(run, read);
      settle(run, 5);
    },
    { working: 'Loading the form' },
  );
}

export const REMARKS_DEFAULT = 'Student Visa';

/** What the tool writes in the stage's Remark box, for every student. */
export const STAGE_REMARK = 'new student';

/**
 * Shows Passport Collection with what the site already has: Passport Type, Remarks, Last Visa Reference No
 * and the dates. A value follows the site until the staff changes it. Where the site has nothing, the
 * defaults stay: New(Year 1), "Student Visa", and the staff's own entries.
 */
function applyCollection(run: number, read: CollectionRead) {
  const s = app.get();
  if (s.runId !== run) return;
  const before = s.siteData.collectionShown;
  const c = read.current;
  // The site writes dates yyyy-mm-dd; one it writes another way is still read, one that isn't a date is left out.
  const date = (label: string, v: string) => {
    const iso = v ? (parseIso(v) ?? parseDmy(v)) : '';
    if (v && !iso) noteActivity(run, 5, `${label} on the site isn't a date the tool can read`, `"${v}" · not copied`);
    return iso ?? '';
  };
  const shown: CollectionShown = {
    passportType: offered(c.passportType, read.passportTypeOptions),
    remarks: tidySpaces(c.remarks),
    lastVisaRef: tidySpaces(c.lastVisaRef),
    issueDate: date('Date of Issue Last Visa', c.issueDate),
    lastEntryDate: date('Date of Last Entry', c.lastEntryDate),
    expiryDate: date('Date of Expiry Active Visa', c.expiryDate),
  };
  setSiteData(run, { collection: read.fields, passportTypeOptions: read.passportTypeOptions, collectionShown: shown });
  const f = app.get().form;
  const follows = (now: string, was: string | undefined) => (was === undefined ? now === '' : now === was);
  const take = (key: 'passportType' | 'remarks' | 'lastVisaRef' | 'issueDate' | 'expiryDate') => !!shown[key] && follows(f[key], before?.[key]);
  const next: Partial<FormState> = {};
  if (take('passportType')) next.passportType = shown.passportType;
  if (take('remarks')) next.remarks = shown.remarks;
  if (take('lastVisaRef')) next.lastVisaRef = shown.lastVisaRef;
  setForm(next);
  if (take('issueDate')) setIssueDate(shown.issueDate);
  if (take('expiryDate')) setExpiryDate(shown.expiryDate);
  const now = app.get().form;
  const type = offered(now.passportType, read.passportTypeOptions) || offeredDefault(PASSPORT_TYPE_DEFAULT, read.passportTypeOptions);
  if (type !== now.passportType) setForm({ passportType: type });
  if (!tidySpaces(now.remarks)) setForm({ remarks: REMARKS_DEFAULT });
  const had = (['passportType', 'remarks', 'lastVisaRef', 'issueDate', 'lastEntryDate', 'expiryDate'] as const).filter((k) => shown[k]).length;
  if (had) noteActivity(run, 5, 'The site already has some of these values', 'Shown in the portal, ready to change');
}

async function valFlow(run: number) {
  await flow(
    run,
    5,
    'val',
    async () => {
      const passport = passportOf();
      if (!app.get().siteData.docsTabOpen) {
        const line = waitingActivity(run, 5, 'Get the VAL letter', "Waits for step 4's documents tab");
        // Step 4 opens that tab; start it if it isn't already working (for example after a logout lost the tab).
        if (!app.get().busy[busyKeyFor(run, 'step4')]) void step4(run);
        await waitUntil(run, () => !!app.get().siteData.docsTabOpen);
        line.finish("Step 4's documents tab is open");
      }
      await docsTabWork(run, async () => {
        await runRead(run, 5, 'Section 7 VAL Information: open the "Approval" link', () => call(run, 'val.open', {}), {
          done: () => 'Found by its exact name (not EMGS Approval Letter, not Approvalurl)',
        });
        await fetchDoc(run, 5, 'val', 'Fetch the VAL letter', () => call(run, 'val.fetch', { passport }));
      });
      settle(run, 5);
    },
    { working: 'Getting the VAL letter' },
  );
}

/** Passport Collection as the staff checked it, and what each field must show before Submit (the same for Submit again). */
function collectionValues(s: AppState): { values: CollectionValues; expected: [string, string][] } {
  const f = s.form;
  // Only the fields the site left empty (and lets anyone fill) get the staff's values.
  const toFill = (s.siteData.collection ?? []).filter((x) => !x.value && !x.locked);
  const siteFill: Record<string, string> = {};
  for (const x of toFill) siteFill[x.key] = tidySpaces(f.siteFill[x.key] ?? '');
  const values: CollectionValues = {
    passportType: f.passportType,
    remarks: tidySpaces(f.remarks),
    lastVisaRef: tidySpaces(f.lastVisaRef),
    issueDate: f.issueDate,
    lastEntryDate: f.issueDate,
    expiryDate: f.expiryDate,
    siteFill,
  };
  const expected: [string, string][] = [
    ['Passport Type', values.passportType],
    ['Remarks', values.remarks],
    ['Last Visa Reference No', values.lastVisaRef],
    ['Date of Issue Last Visa', values.issueDate],
    ['Date of Last Entry', values.lastEntryDate],
    ['Date of Expiry Active Visa', values.expiryDate],
    ...toFill.map((x) => [x.label, siteFill[x.key]] as [string, string]),
  ];
  return { values, expected };
}

/** Fills Passport Collection, reads every value back and ticks Confirm Transaction. Nothing is submitted here. */
async function prepareCollection(run: number, again: boolean) {
  const { values, expected } = collectionValues(app.get());
  await runRead(run, 5, 'Fill the Passport Collection form', () => call(run, 'step5.fill', { values }), {
    done: () => `Dates go in as YYYY-MM-DD: ${values.issueDate} and ${values.expiryDate}`,
  });
  const back = await runRead(run, 5, 'Read every value back', () => call(run, 'step5.readBack', { values }));
  const rows = differences(expected, back);
  if (rows.length > 0) {
    throw new StopError('The site shows a different value', `The tool did not press Submit. Check the field on the site, then press Submit${again ? ' again' : ''} once more.`, {
      rows,
      retry: again ? 'resubmit' : undefined,
      retryLabel: again ? 'Submit again' : undefined,
    });
  }
  noteActivity(run, 5, 'Every value matches');
  await runRead(run, 5, 'Tick Confirm Transaction', () => call(run, 'step5.confirm', {}));
}

/** Submit on Passport Collection, pressed by the staff. */
export async function submitCollection() {
  const run = currentRun();
  if (collectionMissing(app.get()).length > 0) return;
  const ok = await flow(
    run,
    5,
    'collection',
    async () => {
      if (!app.get().saves.collection) await prepareCollection(run, false);
      await runSave(run, 5, 'collection', 'Click Submit', () => call(run, 'step5.submit', {}), { againLabel: 'Submit' });
    },
    { working: 'Submitting', noRetryButton: true, reopen: { key: 'step5', label: 'Load the form again', then: 'press Submit again' } },
  );
  if (ok && app.get().saves.collection) void afterCollection(run);
}

/** After Submit: the holding letter, then the stage update. Done by the tool, shown line by line. */
async function afterCollection(run: number) {
  await flow(
    run,
    5,
    'afterSubmit',
    async () => {
      const passport = passportOf();
      if (app.get().docs.holding.status !== 'ready') {
        try {
          await runRead(run, 5, 'Wait for the holding letter below the form', () => call(run, 'step5.holdingWait', { passport }), {
            done: () => 'It appeared below the form (no popup, no new page)',
          });
        } catch (e) {
          if (!(e instanceof StopError) || app.get().siteData.staffConfirmed?.collection) throw e;
          // No letter means Submit may not have gone through: the staff looks, and can press Submit again.
          unmarkSaved(run, 'collection');
          throw new StopError(
            e.title,
            `${e.message} If the site saved it, press "It saved on the site". If the site shows a problem, fix it and press Submit again.`,
            { confirmSaved: 'collection', retry: undefined },
          );
        }
        await fetchDoc(run, 5, 'holding', 'Download it as PDF from the report viewer', () => call(run, 'step5.holding', { passport }));
        if (app.get().activeStep === 5) showDoc('holding', 1, false);
        toast('The holding letter is ready to print.', 'success');
      }
      await stageRound(run);
    },
    { working: 'Updating the stage' },
  );
}

/** How the staff fixes "No data found" by hand, which Submit again does: said the same way wherever it is offered. */
const AGAIN_STEPS =
  'the tool goes back to the Passport Collection tab and presses Submit there, then chooses "Passport Received by INSO (For Processing)" without doing anything on it, goes back to "Passport Received From Student" and updates the row';

/**
 * The stage: choose "Passport Received From Student", find the student's row, write "new student", tick it, Update, check.
 * After Submit again it is the second go: the list is shown again first (INSO, then back), with its own Update.
 * When the stage shows "No data found" the first time, the staff presses Submit again (as the team does by hand).
 * The second time, the student leaving the list is the end of it, so it never goes round again.
 */
async function stageRound(run: number) {
  const passport = passportOf();
  const remark = STAGE_REMARK;
  const again = !!app.get().saves.collectionAgain;
  const key: SaveKey = again ? 'stageAgain' : 'stage';
  if (!app.get().saves[key]) {
    await runRead(run, 5, 'Open the Passport Movement Stages tab', () => call(run, 'step5.stagesTab', {}));
    if (again) {
      await runRead(
        run,
        5,
        'Choose "Passport Received by INSO (For Processing)", then "Passport Received From Student" again',
        () => call(run, 'step5.stage', { refresh: true }),
        { done: () => 'Nothing was done on INSO: this only shows the list again' },
      );
    } else {
      await runRead(run, 5, 'Choose stage "Passport Received From Student"', () => call(run, 'step5.stage', {}));
    }
    const pick = app.get().siteData.stagePick;
    const found = await runRead(run, 5, `Search ${passport}`, () => call(run, 'step5.stageSearch', { passport, pick }), {
      done: (r) =>
        r.empty
          ? `The site says: "${r.empty}"`
          : r.rows.length === 1 && r.picked
            ? 'Exactly one row; Passport No matches'
            : r.picked
              ? `${r.rows.length} rows; using the one you chose${stageRowId(pick ?? '') ? ` (Student ID ${stageRowId(pick ?? '')})` : ''}`
              : `${r.rows.length} row${r.rows.length === 1 ? '' : 's'}`,
    });
    const n = found.rows.length;
    if (n === 0) {
      setSiteData(run, { stageRows: undefined });
      if (again) {
        // Both ways failed: the staff looks at the stage page in the portal and fixes it there.
        openStagePageWhenFree(run);
        throw new StopError(
          'Still not on "Passport Received From Student"',
          `After Submit again, the site still shows ${found.empty ? `"${found.empty}"` : `no row for ${passport}`} under "Passport Received From Student". The stage page is shown below: look at it there and fix it, or press "It's done on the site" there if it's already right.`,
          { stagePage: true },
        );
      }
      throw new StopError(
        found.empty ? '"No data found" on the stage' : 'Not on this stage',
        found.empty
          ? `"Passport Received From Student" shows "${found.empty}" on the site, so ${passport}'s row isn't there to update. Press Submit again: ${AGAIN_STEPS}.`
          : `${passport} isn't listed under "Passport Received From Student". If the stage was already updated, press "It saved on the site". Otherwise press Submit again: ${AGAIN_STEPS}.`,
        { retry: 'resubmit', retryLabel: 'Submit again', confirmSaved: found.empty ? undefined : 'stage', stagePage: true },
      );
    }
    // A student with more than one LUC ID has a row for each: the staff chooses this registration's row.
    setSiteData(run, { stageRows: n > 1 || !found.picked ? found : undefined });
    if (!found.picked) {
      if (pick) {
        throw new StopError('The row you chose has changed', "The list doesn't show the row you chose any more. Choose the student's row again below. Update was not pressed.", {
          retry: undefined,
        });
      }
      throw new StopError(
        "Choose the student's row",
        again
          ? `${n} rows have ${passport} under "Passport Received From Student" after Submit again. The tool won't guess which one to update.`
          : `${n} rows have ${passport} under "Passport Received From Student", one for each LUC ID the student has had (for example an earlier foundation or diploma). The tool won't guess which one.`,
        { retry: undefined, hint: `Press "Use this row" on this registration's row below. The tool then writes "${remark}" in it, ticks Select on that row only, and presses Update.` },
      );
    }
    const shown = await runRead(run, 5, `Clear the Remark box and write "${remark}"`, () => call(run, 'step5.remark', { remark }), {
      done: (v) => `The box shows exactly ${v}`,
    });
    if (shown !== remark) {
      throw new StopError('The Remark box shows something else', 'The tool did not press Update.', {
        rows: [{ field: 'Remark', expected: remark, actual: shown || '(empty)' }],
      });
    }
    await runRead(run, 5, 'Tick Select on that row only', () => call(run, 'step5.select', {}), { done: () => 'No other row is ticked' });
  }
  await runSave(run, 5, key, again ? 'Click Update again' : 'Click Update', () => call(run, 'step5.update', { remark }), {
    acceptAnyPopup: true,
    againLabel: 'Try again',
  });
  let result: 'moved' | 'empty';
  try {
    result = await runRead(run, 5, `Search ${passport} again to check the update`, () => call(run, 'step5.checkStage', { passport, remark }), {
      done: (r) => (r === 'empty' ? 'The site now says "No data found" for this stage' : 'The row has left this stage. Stage updated.'),
    });
  } catch (e) {
    if (!(e instanceof StopError) || app.get().siteData.staffConfirmed?.[key]) throw e;
    // The list doesn't show the change: Update may not have gone through, so Try again does the stage again.
    unmarkSaved(run, key);
    throw new StopError(e.title, `${e.message} If the site window shows it updated, press "It saved on the site". If not, press Try again.`, {
      confirmSaved: key,
      stagePage: true,
      retry: again ? 'resubmit' : 'afterSubmit',
      retryLabel: 'Try again',
    });
  }
  if (result === 'empty' && !again && !app.get().siteData.staffConfirmed?.stage) {
    // Update went through, and the list is now empty. As the team does by hand when it shows "No data found": Submit again.
    throw new StopError(
      '"No data found" after Update',
      `After Update, the site shows "No data found" under "Passport Received From Student". Press Submit again: ${AGAIN_STEPS} again.`,
      { retry: 'resubmit', retryLabel: 'Submit again', stagePage: true },
    );
  }
  setSiteData(run, { stageConfirmed: true, stagePageOpen: false });
  settle(run, 5);
  toast('Step 5 is done: the stage is updated.', 'success');
}

/**
 * Submit again, pressed by the staff, when "Passport Received From Student" shows "No data found": as the team does by
 * hand, back to the Passport Collection tab and Submit there (the same values, read back first), then the stage again.
 * Once only: after that the stage page in the portal is where the staff fixes it. The tool never does it by itself.
 */
export function submitAgain(): string | null {
  const run = currentRun();
  const s = app.get();
  if (!s.student) return 'Start a student first.';
  if (!s.saves.collection) return 'Press Submit first.';
  if (s.siteData.stageConfirmed) return 'The stage is already done.';
  if (['afterSubmit', 'resubmit', 'stageView'].some((k) => s.busy[busyKeyFor(run, k as RetryKey)])) return 'Wait until the tool has finished.';
  const submitted = !!s.saves.collectionAgain;
  // A new Submit can change the stage's rows, so the staff chooses the row again. Only the stage again keeps the choice.
  setSiteData(run, submitted ? { stageRows: undefined } : { stagePick: undefined, stageRows: undefined });
  if (!submitted) noteActivity(run, 5, 'You pressed Submit again', 'Passport Collection first, then the stage');
  void flow(
    run,
    5,
    'resubmit',
    async () => {
      const passport = passportOf();
      if (!app.get().saves.collectionAgain) {
        const onForm = await runRead(run, 5, 'Go back to the Passport Collection tab', () => call(run, 'step5.collectionTab', { passport }), {
          done: (ok) => (ok ? `The form still shows ${passport}` : "The form isn't shown, so the tool loads it again"),
        });
        if (!onForm) {
          await runRead(run, 5, `Passport Collection: ${passport} → Submit`, () => call(run, 'step5.load', { passport }), { done: () => 'This only loads the form' });
        }
        await prepareCollection(run, true);
        try {
          await runSave(run, 5, 'collectionAgain', 'Click Submit again', () => call(run, 'step5.submit', {}), { againLabel: 'Submit again' });
        } catch (e) {
          // Not saved, or not clear: the staff looks, then presses Submit again (or says it saved).
          if (e instanceof StopError && e.title !== TAB_LOGGED_OUT) throw new StopError(e.title, e.message, { retry: 'resubmit', retryLabel: 'Submit again', ...e.extra });
          throw e;
        }
        await secondHoldingLetter(run, passport);
      }
      await stageRound(run);
    },
    { working: submitted ? 'Updating the stage' : 'Submitting again', retryLabel: 'Try again' },
  );
  return null;
}

/** After Submit again: the new holding letter, saved as a second copy if the site shows one. The stage tells whether Submit went through. */
async function secondHoldingLetter(run: number, passport: string) {
  const line = waitingActivity(run, 5, 'Wait for the new holding letter below the form', 'Up to 30 seconds');
  const shows = await call(run, 'step5.holdingWait', { passport, wait: 30_000 }).then(
    () => true,
    (e) => {
      if (e instanceof Cancelled) throw e;
      return false;
    },
  );
  if (!shows) {
    line.finish('No new letter showed. The first copy is kept.');
    return;
  }
  line.finish('It appeared below the form');
  const before = app.get().docs.holding;
  try {
    await fetchDoc(run, 5, 'holding', 'Download it as PDF (a second copy)', () => call(run, 'step5.holding', { passport }));
  } catch (e) {
    if (e instanceof Cancelled) throw e;
    // The first copy is still in the folder: the portal keeps showing it.
    setDoc(run, 'holding', before);
    noteActivity(run, 5, "The second copy wasn't saved", 'The first copy is kept');
  }
}

/** The stage page in the portal: a stage as the site shows it, and this student's rows on it. Changes nothing on the site. */
export async function showStagePage(stage?: string, refresh = false): Promise<void> {
  const run = currentRun();
  const s = app.get();
  if (!s.student || !s.saves.collection) return;
  const busyKey = busyKeyFor(run, 'stageView');
  if (s.busy[busyKey] || s.busy[busyKeyFor(run, 'afterSubmit')] || s.busy[busyKeyFor(run, 'resubmit')]) return;
  setBusy(busyKey, true);
  setSiteData(run, { stagePageOpen: true, stageViewError: undefined });
  try {
    const view = await runRead(run, 5, stage ? `Show the stage "${stage}" here` : 'Show the stage page here', () => call(run, 'step5.stageView', { passport: passportOf(), stage, refresh }), {
      done: (v) => (v.empty ? `"${v.stage}": the site says "${v.empty}"` : `"${v.stage}": ${v.rows.length} row${v.rows.length === 1 ? '' : 's'} for this student`),
    });
    setSiteData(run, { stageView: view });
  } catch (e) {
    if (e instanceof Cancelled) return;
    setSiteData(run, { stageViewError: e instanceof Error ? e.message : String(e) });
  } finally {
    setBusy(busyKey, false);
  }
}

/** Opens the stage page in the portal as soon as the tool's step 5 work has stopped: it reads the same site tab. */
function openStagePageWhenFree(run: number) {
  setSiteData(run, { stagePageOpen: true, stageView: undefined, stageViewError: undefined });
  const free = () => !['afterSubmit', 'resubmit'].some((k) => app.get().busy[busyKeyFor(run, k as RetryKey)]);
  void waitUntil(run, free).then(
    () => showStagePage(),
    () => undefined,
  );
}

export function closeStagePage() {
  setSiteData(currentRun(), { stagePageOpen: false });
}

/** "Show it in the site window": the stage page's tab comes to the front in the site window. */
export function revealStagePage() {
  if (!isLive()) return void toast('Sample mode has no site window.', 'info');
  void call(currentRun(), 'site.reveal', { key: 'stage', front: true }).catch(() => undefined);
}

/**
 * On the stage page in the portal, the staff pressed Update this row (on "Passport Received From Student" only).
 * The tool then does what it does for one row: writes "new student" in it, ticks it only, presses Update and checks.
 */
export function updateStageRowFromPage(details: string): string | null {
  const s = app.get();
  const run = s.runId;
  if (!s.student) return 'Start a student first.';
  if (s.siteData.stageConfirmed) return 'The stage is already done.';
  if (['afterSubmit', 'resubmit', 'stageView'].some((k) => s.busy[busyKeyFor(run, k as RetryKey)])) return 'Wait until the tool has finished.';
  const key: SaveKey = s.saves.collectionAgain ? 'stageAgain' : 'stage';
  if (s.saves[key]) return 'Update was already pressed for this row. Press Refresh to look again, or "It\'s done on the site".';
  const id = stageRowId(details);
  setSiteData(run, { stagePick: details, stageRows: undefined });
  setStep(run, 5, { error: undefined });
  noteActivity(run, 5, 'You chose the row on the stage page', id ? `Student ID ${id}` : details.slice(0, 120));
  void afterCollection(run);
  return null;
}

/** On the stage page in the portal: the staff checked on the site that the stage is right. Nothing more is pressed. */
export function stageDoneByStaff(): string | null {
  const s = app.get();
  const run = s.runId;
  if (!s.student || !s.saves.collection) return 'Press Submit first.';
  if (['afterSubmit', 'resubmit', 'stageView'].some((k) => s.busy[busyKeyFor(run, k as RetryKey)])) return 'Wait until the tool has finished.';
  setSiteData(run, { stageConfirmed: true, stageByStaff: true, stagePageOpen: false, stageRows: undefined, staffConfirmed: { ...s.siteData.staffConfirmed, stage: true } });
  setStep(run, 5, { error: undefined });
  noteActivity(run, 5, 'You checked the stage on the site: it is done', 'The tool presses nothing more on the stage');
  settle(run, 5);
  toast('Step 5 is done.', 'success');
  return null;
}

/**
 * The staff filled, in the portal, the fields the site asked for when it refused a save (an empty Country, for example).
 * The tool puts them on the site and reads each one back. Then the save goes again: the tool presses its own
 * Continue To Next on the tabs it passes through; on the Admission Profile, Parents Details and Payment Plan the staff
 * presses it. Returns a message if it can't be done now.
 */
export function fillSiteNeeds(step: StepId, values: Record<string, string>): string | null {
  const s = app.get();
  const run = s.runId;
  const needs = s.steps[step].error?.needs;
  if (!s.student || !needs) return 'Nothing to fill now.';
  if (s.saves[needs.save]) return 'That part is already saved on the site.';
  if (s.busy[busyKeyFor(run, 'siteNeeds')]) return 'Wait until the tool has finished.';
  // Two fields with the same label (two "Country" boxes) stay apart in the read-back.
  const count = new Map<string, number>();
  const list = needs.fields.map((f) => {
    const n = (count.get(f.label) ?? 0) + 1;
    count.set(f.label, n);
    const raw = values[f.key] ?? '';
    return { key: f.key, label: n > 1 ? `${f.label} (${n})` : f.label, value: f.kind === 'text' ? tidySpaces(raw) : raw.trim() };
  });
  const empty = list.filter((v) => !v.value);
  if (empty.length) return `Fill ${empty.map((v) => v.label).join(', ')} first.`;
  const names = list.map((v) => v.label).join(', ');
  void flow(
    run,
    step,
    'siteNeeds',
    async () => {
      let back: ReadBack;
      try {
        back = await runRead(run, step, `Fill ${names} on ${needs.tab}`, () => call(run, 'form.fillNeeds', { tab: needs.tab, values: list }), {
          done: () => 'Each value read back from the site',
        });
      } catch (e) {
        // The fields stay on screen, to fill again.
        if (e instanceof StopError) throw new StopError(e.title, e.message, { ...e.extra, needs, retry: undefined });
        throw e;
      }
      const rows = differences(
        list.map((v) => [v.label, v.value] as [string, string]),
        back,
      );
      if (rows.length) {
        throw new StopError('The site shows a different value', `After filling, ${needs.tab} shows something else. Check it and fill it again below.`, {
          rows,
          needs,
          retry: undefined,
        });
      }
      noteActivity(run, step, `Filled ${names} on ${needs.tab}`, 'Each value read back from the site');
      setStep(run, step, { error: undefined });
      switch (needs.save) {
        case 'address':
        case 'whatsapp':
        case 'wechat':
          void passThrough(run);
          return;
        case 'education':
          void continueParents();
          return;
        default:
          settle(run, step);
          toast(`Filled on the site. Press ${needs.save === 'final' ? 'Final Submit' : 'Continue To Next'} again.`, 'success');
      }
    },
    { working: 'Filling the site', noRetryButton: true },
  );
  return null;
}

/** The Student ID written in a row's Student Details ('' if there is none). */
export function stageRowId(details: string): string {
  const m = details.match(/Student\s*ID\s*:?\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i);
  return m ? m[1] : '';
}

/** The row's Student Details names this id, as a whole word: the LUC number from step 1 or the Student ID from step 4. */
export function stageRowHas(details: string, id: string | undefined): boolean {
  const want = (id ?? '').trim();
  if (!want) return false;
  const esc = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, 'i').test(details);
}

/**
 * The staff chose the student's row on the Movement stage (one of several, one per LUC ID). The tool searches again,
 * writes the remark in that row only, ticks it and presses Update, as for a student with one row.
 * Returns a message if it can't be used.
 */
export function pickStageRow(index: number): string | null {
  const s = app.get();
  const run = s.runId;
  if (!s.student) return 'Start a student first.';
  if (s.siteData.stageConfirmed || s.saves[s.saves.collectionAgain ? 'stageAgain' : 'stage']) return 'The stage is already updated.';
  if (['afterSubmit', 'resubmit', 'stageView'].some((k) => s.busy[busyKeyFor(run, k as RetryKey)])) return 'Wait until the tool has finished.';
  const row = s.siteData.stageRows?.rows[index];
  if (!row) return 'The list is gone. Wait for the tool to search again.';
  const id = stageRowId(row.details);
  setSiteData(run, { stagePick: row.details });
  setStep(run, 5, { error: undefined });
  noteActivity(run, 5, 'You chose the row', id ? `Student ID ${id}` : row.details.slice(0, 120));
  void afterCollection(run);
  return null;
}

/* ------------------------------------------------------------------- step 6 */

const lucWaitLines = new Map<number, ReturnType<typeof waitingActivity>>();

async function step6(run: number) {
  await flow(
    run,
    6,
    'step6',
    async () => {
      const passport = passportOf();
      // A fresh page has nothing uploaded on it, whatever was attached on the page before.
      setSiteData(run, { stampUploaded: false, visaNumberFilled: false });
      await runRead(run, 6, 'Open Admission Assistance (Pre Medical tab)', () => call(run, 'step6.open', {}));
      const card = await runRead(run, 6, `Find the student: ${passport} → Search`, () => call(run, 'step6.find', { passport }), {
        done: (c) => `"Student found." ${c.name} · ${c.admissionId}`,
      });
      setSiteData(run, { card });
      if (!sameId(card.passportNo, passport)) {
        throw new StopError('Passport No on the card is different', `The card shows ${card.passportNo}, not ${passport}. The tool stopped.`, {
          rows: [{ field: 'Passport No', expected: passport, actual: card.passportNo || '(empty)' }],
        });
      }
      noteActivity(run, 6, 'Passport No on the card matches', passport);
      const shown = await runRead(run, 6, 'Visa Number: type the passport number', () => call(run, 'step6.visaNumber', { passport }), {
        done: (v) => `Visa Number shows ${v}`,
      });
      if (shown !== passport) {
        throw new StopError('Visa Number shows something else', 'Nothing was submitted.', { rows: [{ field: 'Visa Number', expected: passport, actual: shown || '(empty)' }] });
      }
      setSiteData(run, { visaNumberFilled: true });
      checkAdmissionId(run);
      // The stamp scan added before this page opened goes up again on it.
      if (app.get().docs.stamp.fileName && !app.get().saves.visa) await attachStamp(run);
      settle(run, 6);
    },
    { working: 'Finding the student' },
  );
}

/** Upload Visa Page: attaches the scan already saved in the student's folder. */
async function attachStamp(run: number) {
  const passport = passportOf();
  const name = app.get().docs.stamp.fileName;
  if (!name) throw new StopError('Choose the stamp scan again', 'The scan is not in the student\'s folder. Add it again.');
  setDoc(run, 'stamp', { status: 'loading', note: undefined });
  try {
    await runRead(run, 6, `Upload Visa Page: attach "${name}"`, () => call(run, 'step6.stamp', { passport, fileName: name }), {
      done: () => 'The site shows the upload finished',
    });
  } catch (e) {
    // The site said nothing either way: the staff can look at the site window and say it shows the scan.
    if (e instanceof StopError && e.title === NO_UPLOAD_SIGN) throw new StopError(e.title, e.message, { ...e.extra, confirmStamp: true });
    throw e;
  }
  setDoc(run, 'stamp', { status: 'ready' });
  setSiteData(run, { stampUploaded: true });
}

/** The site gave no sign whether it took the scan; the staff looked at the site window and says it shows it. */
export function confirmStampByStaff() {
  const run = currentRun();
  const s = app.get();
  if (!s.student || !s.docs.stamp.fileName || s.busy[busyKeyFor(run, 'stamp')]) return;
  setDoc(run, 'stamp', { status: 'ready', note: undefined });
  setSiteData(run, { stampUploaded: true });
  setStep(run, 6, { error: undefined, status: 'working', note: NOTES.working });
  noteActivity(run, 6, 'You checked the site window: it shows the scan', 'Upload Visa Page');
  settle(run, 6);
}

function stampFlow(run: number, work: () => Promise<void>) {
  void flow(run, 6, 'stamp', work, { working: 'Uploading the scan' }).then((ok) => {
    if (!ok && app.get().runId === run) setDoc(run, 'stamp', { status: 'error', note: 'The upload did not finish. Press Try again, or choose the file again.' });
  });
}

/** Admission ID on the card must equal the LUC number from step 1. */
function checkAdmissionId(run: number) {
  const s = app.get();
  const card = s.siteData.card;
  if (s.runId !== run || !card) return;
  const luc = s.form.lucSaved;
  if (!luc) {
    if (!lucWaitLines.has(run)) {
      lucWaitLines.set(run, waitingActivity(run, 6, 'Check Admission ID against the LUC number', 'Waits for the LUC number from step 1'));
    }
    setSiteData(run, { lucCheck: 'waiting' });
    return;
  }
  const line = lucWaitLines.get(run) ?? waitingActivity(run, 6, 'Check Admission ID against the LUC number', '');
  lucWaitLines.delete(run);
  if (sameId(card.admissionId, luc)) {
    line.finish(`Admission ID ${card.admissionId} matches step 1`);
    setSiteData(run, { lucCheck: 'ok' });
    if (app.get().steps[6].error?.title === 'Admission ID is different') setStep(run, 6, { error: undefined });
    settle(run, 6);
    return;
  }
  line.fail(`The card shows ${card.admissionId}, step 1 has ${luc}`);
  setSiteData(run, { lucCheck: 'bad' });
  setStep(run, 6, {
    status: 'error',
    note: NOTES.error,
    error: {
      title: 'Admission ID is different',
      message: `The card on Admission Assistance shows ${card.admissionId}, but step 1 has ${luc}. The tool stopped here. If the LUC number in step 1 is wrong, press Change there and save the right one; this check runs again.`,
      rows: [{ field: 'Admission ID', expected: luc, actual: card.admissionId }],
    },
  });
}

/** A file the staff picked or dropped: what kind it is, by its type or name. The tool checks its content again when it saves it. */
function pickedFileType(file: File): { isPdf: boolean; isJpg: boolean; isPng: boolean; kind: 'pdf' | 'image'; ext: string } {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isJpg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
  return { isPdf, isJpg, isPng, kind: isPdf ? 'pdf' : 'image', ext: isPdf ? 'pdf' : isPng ? 'png' : extensionOf(file.name) || 'jpg' };
}

/** A PDF, JPG or PNG of up to 10 MB, as the site takes. Returns what is wrong, or null. */
function pickedFileProblem(file: File): string | null {
  const { isPdf, isJpg, isPng } = pickedFileType(file);
  if (!isPdf && !isJpg && !isPng) return `"${file.name}" isn't a PDF, JPG or PNG file.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > 10 * 1024 * 1024) return `"${file.name}" is ${fileSize(file.size)}. The site takes up to 10 MB.`;
  return null;
}

/** The staff picked or dropped the stamp scan. Returns a message if the file can't be used. */
export function addStampFile(file: File): string | null {
  const problem = pickedFileProblem(file);
  if (problem) return problem;
  const s = app.get();
  const run = s.runId;
  if (!s.siteData.card || s.busy[busyKeyFor(run, 'step6')]) return 'Wait until the tool has found the student on Admission Assistance.';
  if (s.saves.visa) return 'The visa information is already submitted.';
  if (s.busy[`${run}:stamp`]) return 'Wait for the current upload to finish.';
  const passport = s.student?.passport ?? '';
  const preview = URL.createObjectURL(file);
  const { kind, ext } = pickedFileType(file);
  setSiteData(run, { stampUploaded: false, stampFile: { name: file.name, size: file.size, type: file.type } });
  setDoc(run, 'stamp', { status: 'loading', startedAt: Date.now(), url: preview, kind, fileName: undefined });
  if (app.get().activeStep === 6) showDoc('stamp', 1, false);
  stampFlow(run, async () => {
    // Saved in the student's folder first; the site gets the saved copy.
    const saved: DocFile = isLive()
      ? await runRead(run, 6, `Save "${file.name}" in the student's folder`, () => uploadFile(passport, 'stamp', file))
      : { url: preview, kind };
    const name = recordFile(run, 'stamp', saved, ext);
    setDoc(run, 'stamp', { status: 'loading', url: saved.url, kind: saved.kind, fileName: name });
    noteActivity(run, 6, `Saved "${name}"`, "In the student's folder");
    await attachStamp(run);
    settle(run, 6);
  });
  return null;
}

/** Submit Visa Information, pressed by the staff. */
export async function submitVisa() {
  const run = currentRun();
  if (visaMissing(app.get()).length > 0) return;
  await flow(
    run,
    6,
    'visa',
    async () => {
      const passport = passportOf();
      const f = app.get().form;
      const issue = isoToDmy(f.visaIssueDate);
      const expiry = isoToDmy(f.visaExpiryDate);
      if (!app.get().saves.visa) {
        await runRead(run, 6, `Fill Visa Issue Date ${issue} and Visa Expiry Date ${expiry}`, () => call(run, 'step6.fillDates', { passport, issue, expiry }), {
          done: () => 'Written as dd/mm/yyyy, the way this page wants them',
        });
        const back = await runRead(run, 6, 'Read the dates back', () => call(run, 'step6.readDates', {}));
        const rows = [
          { field: 'Visa Issue Date', expected: issue, actual: back.issue || '(empty)' },
          { field: 'Visa Expiry Date', expected: expiry, actual: back.expiry || '(empty)' },
        ].filter((r) => r.expected !== r.actual);
        if (rows.length > 0) {
          throw new StopError('The site shows a different date', 'The tool did not press Submit Visa Information. Check the dates, then press it again.', {
            rows,
            retry: undefined,
          });
        }
      }
      await runSave(run, 6, 'visa', 'Click Submit Visa Information', () => call(run, 'step6.submit', { passport }), {
        acceptAnyPopup: true,
        againLabel: 'Submit Visa Information',
      });
      setSiteData(run, { visaSent: { issue: f.visaIssueDate, expiry: f.visaExpiryDate } });
      if (app.get().siteData.staffConfirmed?.visa) {
        noteActivity(run, 6, 'You checked the site window: it saved');
      } else {
        try {
          await runRead(run, 6, 'Confirm the save on the page', () => call(run, 'step6.confirm', {}), {
            done: (said) => `The site said: "${said}"`,
          });
        } catch (e) {
          if (!(e instanceof StopError)) throw e;
          // The site showed a problem, or nothing at all: the save isn't counted, so the staff can press it again.
          unmarkSaved(run, 'visa');
          setSiteData(run, { visaSent: undefined });
          throw new StopError(e.title, e.message, e.title === 'No answer from the site' || e.title === UNCLEAR_ANSWER ? { confirmSaved: 'visa' } : {});
        }
      }
      setSiteData(run, { visaConfirmed: true });
      settle(run, 6);
      toast('Step 6 is done: the visa details are submitted.', 'success');
    },
    { working: 'Submitting', noRetryButton: true, reopen: { key: 'step6', label: 'Find the student again', then: 'press Submit Visa Information again' } },
  );
}

/* ------------------------------------------------- the staff checked the site */

const SAVE_STEP: Record<SaveKey, StepId> = {
  profile: 2,
  address: 3,
  whatsapp: 3,
  wechat: 3,
  parents: 3,
  education: 3,
  final: 3,
  englishReupload: 3,
  collection: 5,
  stage: 5,
  collectionAgain: 5,
  stageAgain: 5,
  visa: 6,
};

/**
 * The tool couldn't tell whether a save went through, and the staff looked at the site window and
 * says it did. It is counted as saved (never pressed again), and the step carries on from there.
 */
export function confirmSavedByStaff(key: SaveKey) {
  const run = currentRun();
  const s = app.get();
  if (!s.student) return;
  const step = SAVE_STEP[key];
  markSaved(run, key);
  setSiteData(run, { staffConfirmed: { ...s.siteData.staffConfirmed, [key]: true } });
  setStep(run, step, { error: undefined, status: 'working', note: NOTES.working });
  noteActivity(run, step, 'You checked the site window: it saved', 'It will not be pressed again');
  switch (key) {
    case 'profile':
      settle(run, 2);
      settle(run, 3);
      void passThrough(run);
      return;
    case 'address':
    case 'whatsapp':
    case 'wechat':
      void passThrough(run);
      return;
    case 'parents':
    case 'education':
      void continueParents();
      return;
    case 'final':
      void resultFlow(run);
      return;
    case 'englishReupload':
      finishResult(run, resultCertificate(app.get())?.name ?? '', app.get().form.resultTestName);
      return;
    case 'collection':
    case 'stage':
    case 'stageAgain':
      void afterCollection(run);
      return;
    case 'collectionAgain':
      // The second Submit went through: the new holding letter, then the stage, as after Submit again.
      void flow(
        run,
        5,
        'resubmit',
        async () => {
          await secondHoldingLetter(run, passportOf());
          await stageRound(run);
        },
        { working: 'Updating the stage', noRetryButton: true },
      );
      return;
    case 'visa':
      void submitVisa();
      return;
  }
}

/* ------------------------------------------------------------- staff edits */

/** Step 5 dates also fill step 6, until the staff changes step 6 by hand. */
export function setIssueDate(iso: string) {
  const s = app.get();
  const follow = !s.form.visaIssueEdited && !s.saves.visa;
  setForm({ issueDate: iso, ...(follow ? { visaIssueDate: iso } : {}) });
}

export function setExpiryDate(iso: string) {
  const s = app.get();
  const follow = !s.form.visaExpiryEdited && !s.saves.visa;
  setForm({ expiryDate: iso, ...(follow ? { visaExpiryDate: iso } : {}) });
}

export function setVisaIssueDate(iso: string) {
  const s = app.get();
  setForm({ visaIssueDate: iso, visaIssueEdited: iso !== s.form.issueDate });
}

export function setVisaExpiryDate(iso: string) {
  const s = app.get();
  setForm({ visaExpiryDate: iso, visaExpiryEdited: iso !== s.form.expiryDate });
}

/* ------------------------------------------------------------------ retry */

const RETRY_STEP: Partial<Record<RetryKey, StepId>> = {
  step0: 0,
  step1: 1,
  step2: 2,
  english: 2,
  passThrough: 3,
  result: 3,
  step4: 4,
  step5: 5,
  val: 5,
  afterSubmit: 5,
  step6: 6,
  stamp: 6,
};

export function retry(key: RetryKey) {
  const run = currentRun();
  const step = RETRY_STEP[key];
  if (step) noteActivity(run, step, 'Trying again', 'You pressed Try again');
  switch (key) {
    case 'step0':
      return void step0(run);
    case 'step1':
      return void step1(run);
    case 'step2':
      return void step2(run);
    case 'english':
      return void englishFlow(run);
    case 'passThrough':
      return void passThrough(run);
    case 'result':
      return void resultFlow(run);
    case 'step4':
      return void step4(run);
    case 'step5':
      return void step5(run);
    case 'val':
      return void valFlow(run);
    case 'afterSubmit':
      return void afterCollection(run);
    case 'resubmit': {
      const why = submitAgain();
      if (why) toast(why, 'warning');
      return undefined;
    }
    case 'step6':
      return void step6(run);
    case 'stamp':
      if (!app.get().docs.stamp.fileName) return void toast('Choose the stamp scan again.', 'warning');
      return stampFlow(run, async () => {
        await attachStamp(run);
        settle(run, 6);
      });
    default:
      return undefined;
  }
}

export const retryForDoc: Partial<Record<DocKey, RetryKey>> = {
  miniStatement: 'step0',
  registration: 'step1',
  english: 'english',
  profile: 'step4',
  studentType: 'step4',
  val: 'val',
  holding: 'afterSubmit',
};

/* --------------------------------------------------------------- sample mode */

export function fillSampleValues() {
  const s = app.get();
  const f = s.form;
  const siteFill = { ...f.siteFill };
  for (const field of s.siteData.collection ?? []) {
    if (!field.value && !field.locked && !siteFill[field.key]) siteFill[field.key] = 'SAMPLE CITY';
  }
  // The boxes the site shows for the Test Name picked in step 3 (the Test Name itself is left to the staff).
  const resultValues = { ...f.resultValues };
  for (const field of resultFields(s)) {
    if (field.locked || (resultValues[field.key] ?? '').trim()) continue;
    if (field.kind === 'date') resultValues[field.key] = '2026-08-15';
    else if (field.kind === 'number') resultValues[field.key] = Number(field.max) >= 80 ? '80' : '6';
    else if (field.kind === 'select') resultValues[field.key] = field.options?.[0] ?? '';
    else if (field.kind === 'text') resultValues[field.key] = '6.5';
  }
  setForm({
    resultValues,
    luc: f.lucSaved ? f.luc : f.luc || SAMPLE.admissionId,
    studentType: f.studentType || 'Normal Student',
    intake: f.intake || OPTIONS.intake[0],
    highestQualification: f.highestQualification || 'Secondary',
    accommodation: f.accommodation || 'Hostel',
    financer: f.financer || 'Self Finance',
    lastVisaRef: f.lastVisaRef || SAMPLE.val.ourRef,
    siteFill,
  });
  if (!f.issueDate) setIssueDate('2026-10-05');
  if (!f.expiryDate) setExpiryDate('2027-10-04');
  toast('Sample values filled in. Nothing was pressed.', 'info');
}

export function resetDemo() {
  demo.set(() => ({ ...demoDefaults }));
  clearStudent();
  toast('Sample mode reset.', 'info');
}
