import { useMemo } from 'react';
import { createStore, useStore } from '../lib/store';
import type {
  Activity,
  AppState,
  DocKey,
  DocState,
  FormState,
  SaveKey,
  Settings,
  SiteData,
  StepId,
  StepState,
  Toast,
} from './types';

export const STEP_INFO: Record<StepId, { title: string; short: string; subtitle: string }> = {
  0: { title: 'Mini statement', short: 'Mini statement', subtitle: 'A/c Mini Statement, for you to read. Nothing else needs it' },
  1: { title: 'Registration form', short: 'Registration form', subtitle: 'Fetch the PDF, then copy the LUC number' },
  2: { title: 'Admission profile', short: 'Admission profile', subtitle: 'Pick the values, then press Continue To Next' },
  3: { title: 'Final submit', short: 'Final submit', subtitle: "Check the parent's contact and the Payment Plan, then Final Submit" },
  4: { title: 'Student file', short: 'Student file', subtitle: 'Two documents for you to print' },
  5: { title: 'Passport', short: 'Passport', subtitle: 'Record the collection; the tool gets the holding letter and updates the stage' },
  6: { title: 'Visa details', short: 'Visa details', subtitle: 'Check the dates, upload the stamp scan, then submit' },
};

export const DOC_INFO: Record<DocKey, { step: StepId; title: string; tab: string; base: string; waitingNote: string }> = {
  miniStatement: {
    step: 0,
    title: 'A/c Mini Statement',
    tab: 'Mini statement',
    base: '0 Mini statement',
    waitingNote: 'Fetched in step 0 as soon as you start a student.',
  },
  registration: {
    step: 1,
    title: 'Registration form',
    tab: 'Registration form',
    base: '1 Registration form',
    waitingNote: 'Fetched in step 1 as soon as you start a student.',
  },
  english: {
    step: 2,
    title: 'English proficiency certificate',
    tab: 'English certificate',
    base: '2 English certificate',
    waitingNote: 'Found by the LUC number once you save it in step 1.',
  },
  englishResult: {
    step: 3,
    title: 'English result, chosen in step 3',
    tab: 'English result',
    base: '3 English result',
    waitingNote: "Only when you choose another file in step 3. Otherwise step 3 uploads step 2's certificate.",
  },
  profile: {
    step: 4,
    title: 'Student Profile and Family Details',
    tab: 'Student profile',
    base: '4 Student Profile and Family Details',
    waitingNote: "Downloaded from the student's file in step 4.",
  },
  studentType: {
    step: 4,
    title: 'Student Type Document',
    tab: 'Student type',
    base: '4 Student Type Document',
    waitingNote: "Downloaded from the student's file in step 4.",
  },
  val: {
    step: 5,
    title: 'VAL letter',
    tab: 'VAL letter',
    base: '5 VAL letter',
    waitingNote: "Opened from section 7 of the student's documents once step 4's tab is open.",
  },
  holding: {
    step: 5,
    title: 'Student Passport Holding Letter',
    tab: 'Holding letter',
    base: '5 Passport holding letter',
    waitingNote: 'Appears after you press Submit in step 5.',
  },
  stamp: {
    step: 6,
    title: 'Scan of the passport stamp',
    tab: 'Stamp scan',
    base: '6 Visa stamp scan',
    waitingNote: 'Shows here once you add the scan in step 6.',
  },
};

const SETTINGS_KEY = 'registration-portal.settings';
const DEFAULT_SETTINGS: Settings = {
  filesRoot: 'E:\\Registration system\\students',
  accessReason: 'Registration',
  mode: 'live',
  watchMode: true,
};

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        filesRoot: parsed.filesRoot || DEFAULT_SETTINGS.filesRoot,
        accessReason: parsed.accessReason || DEFAULT_SETTINGS.accessReason,
        mode: parsed.mode === 'sample' ? 'sample' : 'live',
        watchMode: parsed.watchMode !== false,
      };
    }
  } catch {
    // Storage blocked: fall back to the defaults.
  }
  return { ...DEFAULT_SETTINGS };
}

export function storeSettings(s: Settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Settings still apply for this session.
  }
}

export const emptyForm = (): FormState => ({
  luc: '',
  lucSaved: '',
  studentType: '',
  salutation: '',
  intake: '',
  contactCode: '',
  contactNumber: '',
  highestQualification: '',
  visaType: '',
  studentCategory: '',
  classType: '',
  accommodation: '',
  parentContact: '',
  kptFees: '',
  scholarship: '',
  tuitionFees: '',
  totalSemester: '',
  financer: '',
  passportType: '',
  remarks: '',
  lastVisaRef: '',
  issueDate: '',
  expiryDate: '',
  siteFill: {},
  visaIssueDate: '',
  visaExpiryDate: '',
  visaIssueEdited: false,
  visaExpiryEdited: false,
  resultStudentId: '',
  resultIdByStaff: false,
  resultTestName: '',
  resultValues: {},
});

const emptyStep = (): StepState => ({ status: 'idle', note: '', activities: [] });
const emptyDoc = (): DocState => ({ status: 'waiting' });

export const freshSteps = (): Record<StepId, StepState> => ({
  0: emptyStep(),
  1: emptyStep(),
  2: emptyStep(),
  3: emptyStep(),
  4: emptyStep(),
  5: emptyStep(),
  6: emptyStep(),
});

export const freshDocs = (): Record<DocKey, DocState> => ({
  miniStatement: emptyDoc(),
  registration: emptyDoc(),
  english: emptyDoc(),
  englishResult: emptyDoc(),
  profile: emptyDoc(),
  studentType: emptyDoc(),
  val: emptyDoc(),
  holding: emptyDoc(),
  stamp: emptyDoc(),
});

export const app = createStore<AppState>({
  runId: 0,
  settings: loadSettings(),
  site: { status: 'signed-in' },
  siteWindow: { tool: 'connecting', browser: 'closed', login: 'unknown' },
  student: null,
  steps: freshSteps(),
  docs: freshDocs(),
  activeStep: 1,
  activeDoc: 'registration',
  docPage: 1,
  form: emptyForm(),
  siteData: {},
  busy: {},
  saves: {},
  savedFiles: {},
  popups: [],
  watch: null,
  toasts: [],
  ui: {
    mobileView: 'fields',
    demoOpen: false,
    settingsOpen: false,
    filesOpen: false,
    filesQuery: '',
    confirm: null,
  },
});

export const useApp = <U,>(selector: (s: AppState) => U): U => useStore(app, selector);

/** For selectors that build a list (a new array each time): compares by content so React doesn't loop. */
export function useAppList(selector: (s: AppState) => string[]): string[] {
  const joined = useStore(app, (s) => selector(s).join('\u0000'));
  return useMemo(() => (joined ? joined.split('\u0000') : []), [joined]);
}

/* ------------------------------------------------------------------ updates */

export const patch = (p: Partial<AppState>) => app.set((s) => ({ ...s, ...p }));

export const setUi = (p: Partial<AppState['ui']>) => app.set((s) => ({ ...s, ui: { ...s.ui, ...p } }));

export const setForm = (p: Partial<FormState>) => app.set((s) => ({ ...s, form: { ...s.form, ...p } }));

export function setSiteData(run: number, p: Partial<SiteData>) {
  app.set((s) => (s.runId !== run ? s : { ...s, siteData: { ...s.siteData, ...p } }));
}

export function setStep(run: number, id: StepId, p: Partial<StepState>) {
  app.set((s) => (s.runId !== run ? s : { ...s, steps: { ...s.steps, [id]: { ...s.steps[id], ...p } } }));
}

export function setDoc(run: number, key: DocKey, p: Partial<DocState>) {
  app.set((s) => (s.runId !== run ? s : { ...s, docs: { ...s.docs, [key]: { ...s.docs[key], ...p } } }));
}

export function setBusy(key: string, on: boolean) {
  app.set((s) => ({ ...s, busy: { ...s.busy, [key]: on } }));
}

export function markSaved(run: number, key: SaveKey) {
  app.set((s) => (s.runId !== run ? s : { ...s, saves: { ...s.saves, [key]: true } }));
}

/** A save that turned out not to have gone through: the staff can press it again. */
export function unmarkSaved(run: number, key: SaveKey) {
  app.set((s) => {
    if (s.runId !== run || !s.saves[key]) return s;
    const saves = { ...s.saves };
    delete saves[key];
    return { ...s, saves };
  });
}

let activityCounter = 0;

export function addActivity(run: number, step: StepId, a: Omit<Activity, 'id'>): number {
  const id = ++activityCounter;
  app.set((s) => {
    if (s.runId !== run) return s;
    const st = s.steps[step];
    return { ...s, steps: { ...s.steps, [step]: { ...st, activities: [...st.activities, { id, ...a }] } } };
  });
  return id;
}

export function updateActivity(run: number, step: StepId, id: number, p: Partial<Activity>) {
  app.set((s) => {
    if (s.runId !== run) return s;
    const st = s.steps[step];
    return {
      ...s,
      steps: {
        ...s.steps,
        [step]: { ...st, activities: st.activities.map((a) => (a.id === id ? { ...a, ...p } : a)) },
      },
    };
  });
}

let toastCounter = 0;

export function toast(text: string, tone: Toast['tone'] = 'info') {
  const id = ++toastCounter;
  app.set((s) => ({ ...s, toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  window.setTimeout(() => dismissToast(id), tone === 'error' ? 8000 : 4500);
}

export function dismissToast(id: number) {
  app.set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** Shows a document on the left (and on phones, switches to the documents view). */
export function showDoc(key: DocKey, page = 1, switchMobile = true) {
  app.set((s) => ({
    ...s,
    activeDoc: key,
    docPage: page,
    ui: switchMobile && window.innerWidth < 1024 ? { ...s.ui, mobileView: 'docs' } : s.ui,
  }));
}

/**
 * The certificate that goes up on Verify / Upload English Result: the file the staff chose in step 3, or else step 2's.
 * Null while the staff's file is still being saved, or didn't save.
 */
export function resultCertificate(s: AppState): { key: 'english' | 'englishResult'; name: string } | null {
  const own = s.docs.englishResult;
  if (own.status !== 'waiting') return own.status === 'ready' && own.fileName ? { key: 'englishResult', name: own.fileName } : null;
  const step2 = s.docs.english;
  return step2.status === 'ready' && step2.fileName ? { key: 'english', name: step2.fileName } : null;
}

/** The document that fits each step best. */
export function mainDocFor(step: StepId, s: AppState): { key: DocKey; page: number } {
  switch (step) {
    case 0:
      return { key: 'miniStatement', page: 1 };
    case 1:
      return { key: 'registration', page: 1 };
    case 2:
      return { key: 'registration', page: 1 };
    case 3:
      // After Final Submit: the certificate that goes up on Verify / Upload English Result.
      if (s.saves.final) return { key: s.docs.englishResult.status !== 'waiting' ? 'englishResult' : 'english', page: 1 };
      return { key: 'registration', page: 2 };
    case 4:
      return { key: 'profile', page: 1 };
    case 5:
      return s.docs.holding.status !== 'waiting' ? { key: 'holding', page: 1 } : { key: 'val', page: 1 };
    case 6:
      return s.docs.stamp.status !== 'waiting' ? { key: 'stamp', page: 1 } : { key: 'val', page: 1 };
  }
}

export function selectStep(step: StepId) {
  app.set((s) => {
    const doc = mainDocFor(step, s);
    return { ...s, activeStep: step, activeDoc: doc.key, docPage: doc.page };
  });
}
