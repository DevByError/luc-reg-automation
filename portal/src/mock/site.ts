/**
 * Sample mode: a pretend online.lincoln.edu.my.
 *
 * It answers with made-up sample values after a delay, and the test controls can make it slow,
 * drop the network, log the staff out or show an unexpected popup. src/site/mock.ts turns it into
 * the same list of actions the real automation (server/ops.ts) answers in live mode.
 */
import type { ResultField } from '../../shared/ops';
import { createStore } from '../lib/store';
import { LoggedOutError, NetworkError } from '../site/errors';

export type Speed = 'normal' | 'slow' | 'very-slow';
export type NextSave = 'normal' | 'lost-before' | 'lost-after';
export type SearchResult = 'one' | 'none' | 'two';
export type StageNoData = 'off' | 'before' | 'after';
/**
 * Verify / Upload English Result in step 3: as it should be; View finds nobody the next time; the Admission Form doesn't show
 * the section, so the tool opens its page in its own tab; or the site refuses the next Upload.
 */
export type EnglishResultMode = 'normal' | 'notfound' | 'tab' | 'refuse';

export interface DemoState {
  speed: Speed;
  offlineUntil: number;
  failNext: boolean;
  nextSave: NextSave;
  loggedOut: boolean;
  popupNext: boolean;
  mismatchNext: boolean;
  searchResult: SearchResult;
  odl: boolean;
  /** Applicant Details has no English certificate, so the staff adds it in step 2. */
  englishMissing: boolean;
  /** The student has more than one LUC ID, so Movement Stages lists a row for each and the staff chooses one in step 5. */
  multiLuc: boolean;
  /** The student left Country empty, so the site refuses Continue To Next on the Admission Profile until it is filled. */
  needsCountry: boolean;
  /**
   * "Passport Received From Student" shows "No data found" until the staff presses Submit again: when the tool first looks
   * ('before'), or after its Update ('after').
   */
  stageNoData: StageNoData;
  englishResult: EnglishResultMode;
}

export const demoDefaults: DemoState = {
  speed: 'normal',
  offlineUntil: 0,
  failNext: false,
  nextSave: 'normal',
  loggedOut: false,
  popupNext: false,
  mismatchNext: false,
  searchResult: 'one',
  odl: false,
  englishMissing: false,
  multiLuc: false,
  needsCountry: false,
  stageNoData: 'off',
  englishResult: 'normal',
};

export const demo = createStore<DemoState>({ ...demoDefaults });
const setDemo = (p: Partial<DemoState>) => demo.set((s) => ({ ...s, ...p }));

export { LoggedOutError, NetworkError } from '../site/errors';

const FACTOR: Record<Speed, number> = { normal: 1, slow: 3.5, 'very-slow': 8 };
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.85 + Math.random() * 0.3);

function checkConnection() {
  const d = demo.get();
  if (d.loggedOut) throw new LoggedOutError();
  if (Date.now() < d.offlineUntil) throw new NetworkError("Couldn't reach online.lincoln.edu.my");
}

/** One round trip to the site that only reads. */
export async function siteCall<T>(baseMs: number, result: () => T): Promise<T> {
  const d = demo.get();
  if (d.loggedOut) {
    await sleep(500);
    throw new LoggedOutError();
  }
  if (Date.now() < d.offlineUntil) {
    await sleep(1200);
    throw new NetworkError("Couldn't reach online.lincoln.edu.my");
  }
  if (d.failNext) {
    setDemo({ failNext: false });
    await sleep(jitter(baseMs) * FACTOR[d.speed]);
    throw new NetworkError('The site stopped answering');
  }
  await sleep(jitter(baseMs) * FACTOR[demo.get().speed]);
  checkConnection();
  return result();
}

const savedOnSite = new Set<string>();

/** A click that saves on the site. Returns the popup text, if a popup appeared. */
export async function siteSave(key: string, baseMs: number, popup?: string): Promise<{ popup?: string }> {
  const d = demo.get();
  if (d.loggedOut) {
    await sleep(500);
    throw new LoggedOutError();
  }
  if (Date.now() < d.offlineUntil) {
    await sleep(1200);
    throw new NetworkError("Couldn't reach online.lincoln.edu.my");
  }
  await sleep(jitter(baseMs) * FACTOR[d.speed]);
  checkConnection();
  const mode = demo.get().nextSave;
  if (mode === 'lost-before') {
    setDemo({ nextSave: 'normal' });
    throw new NetworkError('The site stopped answering');
  }
  savedOnSite.add(key);
  if (mode === 'lost-after') {
    setDemo({ nextSave: 'normal' });
    throw new NetworkError('The answer from the site was lost');
  }
  if (demo.get().popupNext) {
    setDemo({ popupNext: false });
    return { popup: 'Record saved. SMS notification could not be sent to the student.' };
  }
  return popup ? { popup } : {};
}

/** Checks, read-only, whether a save reached the site. */
export const siteCheckSaved = (key: string) => siteCall(900, () => savedOnSite.has(key));

/** What the pretend site holds now, for its own answers (no delay). */
export const siteHas = (key: string) => savedOnSite.has(key);

/** The staff logged in again in the site window. */
export async function siteLogin(): Promise<void> {
  await sleep(1200);
  setDemo({ loggedOut: false });
}

export function resetSite() {
  savedOnSite.clear();
}

/** Turns on the "read-back differs" demo once. */
export function takeMismatch(): boolean {
  if (!demo.get().mismatchNext) return false;
  setDemo({ mismatchNext: false });
  return true;
}

/* ---------------------------------------------------------------- sample values */

export const SAMPLE = {
  name: 'SAMPLE STUDENT',
  program: 'Bachelor of Science (Honours) in Hospitality Management',
  admissionId: 'LUC0000123',
  nationality: 'SAMPLELAND',
  applyDate: '2026-10-01',
  applicationId: 'APP-000123',
  transid: '000123',
  studentId: 'S000123',
  schoolName: 'Sample International School',
  salutation: 'Mr.',
  contactCode: '60',
  contactNumber: '120000000',
  parents: {
    relationship: 'Father',
    name: 'SAMPLE PARENT',
    occupation: 'Engineer',
    address: '1 Sample Road',
    city: 'Sample City',
    state: 'Sample State',
    zip: '00000',
    country: 'Sampleland',
    contactNo: '+000 3333 4444',
    email: 'parent@example.com',
  },
  val: { ourRef: 'SAMPLE/STU/0000/00/1' },
  /** Payment Plan as Accounts set it on the pretend site. Made-up numbers. */
  payment: {
    fees: { kptFees: '15000.00', scholarship: '9000.00', tuitionFees: '6000', totalSemester: '8' },
    financer: 'Sponsor by Employer',
    plan: {
      headers: ['Sl.No.', 'Semester', 'KPT Fees', 'Lincoln Foundation Scholarship', 'Total Course Fees'],
      rows: Array.from({ length: 8 }, (_, i) => [String(i + 1), `Semester ${i + 1}`, '1875.00', '1125.00', '750.00']),
    },
  },
};

/**
 * Applicant Details [All] on the pretend site: the student's documents, the way the real list shows them
 * (the document's name is the link). Made up. "Other Documents" holds the English result, as a master's
 * student might upload it; one row has no file.
 */
export const SAMPLE_DOCUMENTS = {
  headers: ['Sl.No', 'Image URL', 'Description', 'Uploaded By'],
  rows: [
    { cells: ['1', 'Passport', 'Passport bio page', 'SAMPLE AGENT'], file: true },
    { cells: ['2', 'Bachelor Degree Certificate', 'Degree certificate', 'SAMPLE AGENT'], file: true },
    { cells: ['3', 'Bachelor Degree Transcript', 'Transcript', 'SAMPLE AGENT'], file: true },
    { cells: ['4', 'Other Documents', 'IELTS result', 'SAMPLE AGENT'], file: true },
    { cells: ['5', 'Research Proposal', '', 'SAMPLE AGENT'], file: false },
  ],
};

/** Verify / Upload English Result on the pretend site: the Test Name choices (made up, like the rest). */
export const RESULT_TESTS = ['MOI', 'IELTS', 'TOEFL iBT', 'MUET', 'Pearson PTE'];
export const RESULT_HEADERS = ['IC/Passport', 'Name', 'Programme', 'Country'];

/** The boxes the pretend site shows for a Test Name: none for MOI; a score and a calendar box for the others. */
export function resultBoxes(test: string): ResultField[] {
  if (!test || test === 'MOI') return [];
  const date: ResultField = { key: 'txtResultDate', label: 'Result Date', kind: 'date', format: 'iso', value: '' };
  if (test === 'TOEFL iBT') return [{ key: 'txtScore', label: 'Test Score', kind: 'number', value: '', min: '0', max: '120' }, date];
  return [{ key: 'txtScore', label: 'Test Score', kind: 'text', value: '', maxLength: 10 }, date];
}

/** Movement Stages on the pretend site, as the real list shows a student: everything in one Student Details cell. */
export const STAGE_HEADERS = ['Sl.No.', 'Student Details', 'Update Details', 'Remark', 'Update History', 'Select'];

/** The stage choices on the pretend site. */
export const SAMPLE_STAGES = [
  'Passport Received From Student',
  'Passport Received by INSO (For Processing)',
  'Passport Ready for EMGS Submission',
  'Preparing Documents',
  'Passport Submitted to EMGS',
];

/** What LOS shows when a stage lists nobody at all. */
export const STAGE_EMPTY = 'No data found. Please select a different stage. ⚠ No data available for this stage.';

/**
 * The student's rows under "Passport Received From Student". With more than one LUC ID, an earlier foundation and
 * diploma have their own rows, one before this registration's and one after it. Made up.
 */
export function sampleStageRows(passport: string, multi: boolean) {
  const row = (n: number, id: string, year: string, at: string) => {
    const cells = [
      String(n),
      `Name: ${SAMPLE.name}\nStudent ID: ${id}\nPassport No: ${passport}\nAcademic Year: ${year}`,
      `Updated BY: SAMPLE STAFF\nTime: ${at}\nRemark: Student Visa`,
      '',
      'View',
      '',
    ];
    return { cells, details: cells[1].replace(/\s+/g, ' ').trim() };
  };
  if (!multi) return [row(1, SAMPLE.studentId, 'New(Year 1)', '31-Oct-2026 10:00 AM')];
  return [
    row(1, 'S000090', 'Foundation(Year 1)', '15-Jan-2024 09:00 AM'),
    row(2, SAMPLE.studentId, 'New(Year 1)', '31-Oct-2026 10:00 AM'),
    row(3, 'S000101', 'Diploma(Year 1)', '20-Jan-2025 10:30 AM'),
  ];
}

export const OPTIONS = {
  studentType: ['Normal Student', 'English', 'Prerequisite', 'English + Prerequisite', 'Credit Transfer', 'Sabah Office'],
  salutation: ['Miss', 'Mr. / Ms.', 'Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.', 'Datuk', 'Encik'],
  intake: ['2611'],
  highestQualification: [
    'PG / Diploma', 'SPM', 'Secondary', 'Certificate', 'Foundation', 'Pre University', 'Advance Diploma',
    'STPM', 'Diploma', 'Senior Secondary', 'Bachelor', 'Master', 'Ph.D.', 'Doctorate',
  ],
  visaType: ['Local', 'Student Visa[Airport Pickup]', 'Social Visit[No Airport Pickup]'],
  studentCategory: [
    'DEPENDENT PASS', 'Employment Pass', 'Home country with eval', 'Normal Student', 'Others Pass',
    'RESIDENT PASS - PR', 'RESIDENT PASS - RP',
  ],
  classType: ['(A)', 'Class 1', 'Class 3', 'Class 2', 'PT3', 'P10'],
  accommodation: ['Hostel', 'Own Accomodation'],
  financer: [
    'Sponsor by Employer', 'Sponsor by Government', 'Self Finance', 'PTPTN', 'JPA', 'MARA', 'Yayasan Sabah', 'JPK', 'BKNS',
  ],
  passportType: [
    'New(Year 1)', 'Renew/Extension(Year 2)', 'Renew/Extension(Year 3)', 'Renew/Extension(Year 4)',
    'Renew/Extension(Year 5)', 'Renew/Extension(Year 6)', 'Checkout Memo-Shorten Passport',
    'Checkout Memo-With Special Pass', 'Checkout Memo-Quit/Withdraw-Special Pass',
    'Checkout Memo-Quit/Withdraw-Shorten Pass', 'Endorsment Transfer', 'Checkout Memo', 'Quit', 'Others',
  ],
};

/** A made-up photo for the sample rows: a grey outline of a person. */
export const SAMPLE_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96" viewBox="0 0 72 96"><rect width="72" height="96" fill="#dbe4f0"/><circle cx="36" cy="36" r="16" fill="#94a3b8"/><path d="M6 96c4-22 16-33 30-33s26 11 30 33z" fill="#94a3b8"/></svg>',
)}`;

export const SAMPLE_FILES = {
  miniStatement: '/samples/mini-statement.pdf',
  registration: '/samples/registration-form.pdf',
  english: '/samples/english-certificate.pdf',
  profile: '/samples/student-profile.pdf',
  studentType: '/samples/student-type.pdf',
  val: '/samples/val-letter.pdf',
  holding: '/samples/holding-letter.pdf',
  stamp: '/samples/stamp-sample.png',
};

/** Passport Collection fields the site fills by itself. One is left empty on purpose. */
export function collectionFields(passport: string) {
  return [
    { key: 'passportNumber', label: 'Passport Number', value: passport },
    { key: 'dateOfBirth', label: 'Date Of Birth', value: '2005-03-14' },
    { key: 'contactNumber', label: 'Contact Number', value: '60120000000' },
    { key: 'email', label: 'Email-ID', value: 'student@example.com' },
    { key: 'passportIssueDate', label: 'Passport Issue Date', value: '2024-01-10' },
    { key: 'passportExpiryDate', label: 'Passport Expiry Date', value: '2034-01-09' },
    { key: 'passportIssuedPlace', label: 'Passport Issued Place', value: '' },
    { key: 'methodOfLastEntry', label: 'Method of Last Entry', value: 'AIR' },
  ];
}
