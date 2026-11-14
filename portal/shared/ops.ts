/**
 * Everything the portal asks the site to do, by name. The same list is used by sample mode
 * (src/site/mock.ts) and by the real automation (server/ops.ts), so both always match.
 */

export type SaveKey =
  | 'profile'
  | 'address'
  | 'whatsapp'
  | 'wechat'
  | 'parents'
  | 'education'
  | 'final'
  | 'englishReupload'
  | 'collection'
  | 'stage'
  /** Submit on Passport Collection a second time, when the stage shows "No data found" (pressed by the staff). */
  | 'collectionAgain'
  /** Update on the stage after that second Submit. */
  | 'stageAgain'
  | 'visa';

/** A file the tool saved in the student's folder (or a sample file in sample mode). */
export interface DocFile {
  url: string;
  kind: 'pdf' | 'image';
  /** Set by the real automation, which names the file itself. */
  fileName?: string;
  /** Something the staff should look at, though the file was saved (the mini statement shows another passport, for example). */
  warning?: string;
}

export interface RegRow {
  name: string;
  applicationId: string;
  course: string;
  /** As the site shows it. */
  applyDate: string;
  /** Which row to open with Print, from the last search. */
  key: string;
  /** What tells this row from the others: the same row gives the same id when the list is searched again. */
  id: string;
  /** The row's columns as the list shows them (not Photo, Print, Complete, Upload or Edit), for the staff to tell rows apart. */
  shown: [string, string][];
  /** The row's photo, made small, or '' when the row has none (or the site shows a broken image). */
  photo: string;
}

export interface ProfileOptions {
  studentType: string[];
  salutation: string[];
  intake: string[];
  highestQualification: string[];
  visaType: string[];
  studentCategory: string[];
  classType: string[];
  accommodation: string[];
}

export interface ProfileRead {
  salutation: string;
  contactCode: string;
  contactNumber: string;
  schoolName: string;
  /** The site's own dropdown options, read live. */
  options: ProfileOptions;
}

export interface ProfileValues {
  studentType: string;
  salutation: string;
  intake: string;
  contactCode: string;
  contactNumber: string;
  highestQualification: string;
  visaType: string;
  studentCategory: string;
  classType: string;
  accommodation: string;
}

export interface Parents {
  relationship: string;
  name: string;
  occupation: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  contactNo: string;
  email: string;
}

/** The stop title when the site gave no sign whether it took the scan: the staff looks and says. */
export const NO_UPLOAD_SIGN = 'No sign of the upload on the site';

/** The stop title when the site answered a save with words that don't say it saved: the staff looks and says. */
export const UNCLEAR_ANSWER = "The site's answer isn't clear";

/** The section of the Admission Form, after Final Submit, where the English result is uploaded. */
export const RESULT_SECTION = 'Verify / Upload English Result';

export type FeeKey = 'kptFees' | 'scholarship' | 'tuitionFees' | 'totalSemester';
export const FEE_KEYS: FeeKey[] = ['kptFees', 'scholarship', 'tuitionFees', 'totalSemester'];

/** A fee as Payment Plan shows it. */
export interface FeeShown {
  /** What the site shows now ('' when it shows nothing). */
  value: string;
  /** True only when the site has a box the tool may type in. Fees the site just shows (set by Accounts) are false. */
  editable: boolean;
}

/** Everything Payment Plan shows, so the staff sees what is already in the main system. */
export interface PaymentRead {
  fees: Record<FeeKey, FeeShown>;
  /** The Financer the site shows now. */
  financer: string;
  financerOptions: string[];
  /** The fee table under the fields, as the site shows it (no rows when it has none). */
  plan: { headers: string[]; rows: string[][] };
}

/** What the staff confirmed. The tool types only the fees the site lets it change; the others must still show these values. */
export interface PaymentValues {
  financer: string;
  kptFees: string;
  scholarship: string;
  tuitionFees: string;
  totalSemester: string;
}

/** The student's documents as Applicant Details [All] lists them: the site's own headings, and each row with whether it has a file. */
export interface SiteDocs {
  headers: string[];
  rows: { cells: string[]; file: boolean }[];
}

/**
 * The student's rows under a Movement stage: one for each LUC ID the student has had (an earlier foundation or diploma
 * has its own). `details` is the row's Student Details, which tells the rows apart. `picked` is true when the tool has
 * the row to update: the only row, or the one the staff chose.
 */
export interface StageRows {
  headers: string[];
  rows: { cells: string[]; details: string }[];
  picked: boolean;
  /** LOS's own words when the stage lists nobody at all ("No data found. Please select a different stage."); '' otherwise. */
  empty: string;
}

/** Passport Movement Stages as the site shows it, for the staff to look at in the portal: this student's rows only. */
export interface StageView {
  /** The site's own stage choices. */
  stages: string[];
  /** The stage the site shows now. */
  stage: string;
  /** LOS's own words when the stage lists nobody ('' otherwise). */
  empty: string;
  headers: string[];
  rows: { cells: string[]; details: string }[];
}

/**
 * A field the site asked for when it refused Continue To Next (or Final Submit), and that the portal doesn't fill
 * itself: for example Country, when the student left it empty. The staff fills it in the portal; the tool puts it on the site.
 */
export interface SiteNeed {
  /** The field's id on the site (a tick-one list's name): how the tool finds it again. */
  key: string;
  /** Its label on the site, such as "Country". */
  label: string;
  kind: 'select' | 'text' | 'date' | 'radio' | 'checkbox';
  /** What it shows now ('' when empty). */
  value: string;
  /** The site's own choices, for a dropdown or a tick-one list. */
  options: string[];
  /** What the site said about it, if it named it. */
  said: string;
}

/** The fields the site asked for on one tab of the Admission Form, and the save they are for. */
export interface SiteNeeds {
  save: SaveKey;
  tab: string;
  fields: SiteNeed[];
}

export interface FileRow {
  studentId: string;
  name: string;
  course: string;
}

export interface CollectionField {
  key: string;
  label: string;
  value: string;
  /** The site doesn't let anyone change it. */
  locked?: boolean;
  /** Set when it is a dropdown: its choices. */
  options?: string[];
}

/** The staff's fields as the site shows them when the form loads ('' when empty), so the portal shows what is already there. */
export interface CollectionShown {
  passportType: string;
  remarks: string;
  lastVisaRef: string;
  issueDate: string;
  lastEntryDate: string;
  expiryDate: string;
}

export interface CollectionRead {
  fields: CollectionField[];
  passportTypeOptions: string[];
  current: CollectionShown;
}

/** Dates are yyyy-mm-dd. siteFill holds the staff's values for fields the site left empty. */
export interface CollectionValues {
  passportType: string;
  remarks: string;
  lastVisaRef: string;
  issueDate: string;
  lastEntryDate: string;
  expiryDate: string;
  siteFill: Record<string, string>;
}

export interface Card {
  name: string;
  program: string;
  admissionId: string;
  passportNo: string;
  nationality: string;
}

/** A box Verify / Upload English Result shows for the chosen Test Name, such as Test Score or Result Date. */
export interface ResultField {
  /** The box's id (or name) on the site: how the tool finds it again. */
  key: string;
  /** Its label on the site. */
  label: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'other';
  /** A date box: 'iso' for a calendar box (it holds yyyy-mm-dd whatever it shows), or the pattern it is typed in, such as dd/mm/yyyy. */
  format?: string;
  /** What it shows now ('' when empty). A date as yyyy-mm-dd, or as the site shows it when that isn't a date. */
  value: string;
  /** A dropdown's choices, without "Select …". */
  options?: string[];
  /** The site doesn't let anyone change it: the portal only shows it. */
  locked?: boolean;
  /** The site's own limits on the box, so the portal checks a value the way the site does. */
  maxLength?: number;
  min?: string;
  max?: string;
  step?: string;
  pattern?: string;
  placeholder?: string;
}

/** Verify / Upload English Result as the site shows it now. */
export interface ResultView {
  /** 'form': a section of the Admission Form after Final Submit. 'tab': the same page, opened by the tool in its own tab. */
  where: 'form' | 'tab';
  /** 'empty': the Student ID box and View show. 'student': a student's row shows, with the boxes for the upload. */
  state: 'empty' | 'student';
  /** The student's row as the site shows it (IC/Passport, Name, Programme, Country). */
  headers: string[];
  rows: string[][];
  /** The row's IC/Passport is this student's passport. */
  samePassport: boolean;
  /** The Test Name choices the site offers, and the one it shows now ('' for none). */
  testNames: string[];
  testName: string;
  /** The boxes the site shows for that Test Name (none for MOI). */
  fields: ResultField[];
  /** What the site said after the last press (a message on the page or a popup), if anything. */
  said: string[];
}

/** What the boxes show after the tool filled them, and any box the site's own check doesn't accept. */
export interface ResultFilled {
  back: ReadBack;
  invalid: { label: string; message: string }[];
}

/** What a click that saves left behind: a popup's text, if one appeared. */
export interface SaveResult {
  popup?: string;
  /** Set when the popup still waits for OK or Cancel (the staff decides). */
  popupId?: string;
}

/** [field, value] pairs, in the order the portal shows them. */
export type ReadBack = [string, string][];

type Op<A, R> = { args: A; result: R };
type None = Record<string, never>;

export interface Ops {
  'session.start': Op<{ passport: string }, true>;
  'login.check': Op<None, boolean>;
  'save.check': Op<{ key: SaveKey; passport: string }, boolean | 'unknown'>;
  /** Watch mode: outlines the button and returns a picture of the page. `front` shows the tab in the site window instead. */
  'site.reveal': Op<{ key: SaveKey; front?: boolean }, { picture?: string; outlined: boolean; spot?: { x: number; y: number } }>;
  'popup.answer': Op<{ id: string; accept: boolean }, true>;

  'step1.open': Op<None, true>;
  'step1.search': Op<{ passport: string }, RegRow[]>;
  /** `id` is the row the staff chose: Print opens only if the row under `key` is still that row. */
  'step1.print': Op<{ key: string; id?: string }, true>;
  'step1.pdf': Op<{ passport: string }, DocFile>;

  'step2.open': Op<None, true>;
  'step2.view': Op<{ passport: string }, { odl: boolean; popups: string[] }>;
  'step2.read': Op<None, ProfileRead>;
  'step2.fill': Op<{ passport: string; values: ProfileValues; englishFile: string }, true>;
  'step2.readBack': Op<{ passport: string; englishFile: string }, ReadBack>;
  'step2.continue': Op<None, SaveResult>;
  'step2.checkNext': Op<None, true>;

  'english.open': Op<None, true>;
  'english.search': Op<{ luc: string }, true>;
  'english.find': Op<None, number>;
  'english.download': Op<{ passport: string }, DocFile>;
  'english.attach': Op<{ passport: string; fileName: string }, true>;
  /** Every document on Applicant Details for this LUC number, for the staff to choose the certificate from. */
  'english.list': Op<{ luc: string }, SiteDocs>;
  /** The document the staff chose, saved as the certificate. `cells` is its row as the staff saw it, so a changed list stops the tool. */
  'english.pick': Op<{ passport: string; luc: string; index: number; cells: string[] }, DocFile>;

  'step3.pass': Op<{ tab: 'address' | 'whatsapp' | 'wechat' | 'education' }, SaveResult>;
  'step3.parents': Op<None, Parents>;
  'step3.writeContact': Op<{ value: string }, true>;
  'step3.readContact': Op<None, string>;
  'step3.continueParents': Op<None, SaveResult>;
  'step3.payment': Op<None, PaymentRead>;
  'step3.fillPayment': Op<{ values: PaymentValues }, true>;
  'step3.final': Op<None, SaveResult>;
  /** Puts the staff's values in the fields the site asked for, then reads each back. */
  'form.fillNeeds': Op<{ tab: string; values: { key: string; label: string; value: string }[] }, ReadBack>;

  /**
   * After Final Submit: finds "Verify / Upload English Result" among the sections the Admission Form shows (or, when it
   * isn't there, opens that page in its own tab) and returns what it shows.
   */
  'result.find': Op<{ passport: string }, ResultView>;
  /** Types the Student ID and presses View. A student shown earlier is cleared first by opening the section again. */
  'result.view': Op<{ passport: string; studentId: string; fileName?: string }, ResultView>;
  /** Picks the Test Name on the site and returns the boxes the site shows for it. */
  'result.test': Op<{ passport: string; testName: string; fileName?: string }, ResultView>;
  /** Fills the Test Name and its boxes (dates as yyyy-mm-dd), attaches the certificate last, then reads everything back. */
  'result.fill': Op<{ passport: string; fileName: string; testName: string; values: { key: string; label: string; value: string }[] }, ResultFilled>;
  /** Upload, pressed by the staff. Done when the section is back to the empty Student ID box and the site shows no problem. */
  'result.upload': Op<{ passport: string; fileName: string }, SaveResult>;

  /** Stage 0: A/c Mini Statement (read only). */
  'step0.open': Op<None, true>;
  'step0.view': Op<{ passport: string }, { reasonAsked: boolean }>;
  'step0.reason': Op<{ reason: string }, string>;
  'step0.pdf': Op<{ passport: string }, DocFile>;

  'step4.open': Op<None, true>;
  'step4.view': Op<{ passport: string }, { reasonAsked: boolean }>;
  'step4.reason': Op<{ reason: string }, string>;
  'step4.result': Op<{ passport: string }, FileRow>;
  'step4.docsTab': Op<None, true>;
  'step4.download': Op<{ doc: 'profile' | 'studentType'; passport: string }, DocFile>;

  'val.open': Op<None, true>;
  'val.fetch': Op<{ passport: string }, DocFile>;

  'step5.open': Op<None, true>;
  'step5.load': Op<{ passport: string }, CollectionRead>;
  'step5.fill': Op<{ values: CollectionValues }, true>;
  'step5.readBack': Op<{ values: CollectionValues }, ReadBack>;
  'step5.confirm': Op<None, true>;
  'step5.submit': Op<None, SaveResult>;
  'step5.holdingWait': Op<{ passport: string; wait?: number }, true>;
  'step5.holding': Op<{ passport: string }, DocFile>;
  /** Submit again: back to the Passport Collection tab. True when it shows this passport's form. */
  'step5.collectionTab': Op<{ passport: string }, boolean>;
  'step5.stagesTab': Op<None, true>;
  /** Passport Received From Student unless named. `refresh`: another stage first, with nothing done there, then this one. */
  'step5.stage': Op<{ name?: string; refresh?: boolean }, true>;
  'step5.stageSearch': Op<{ passport: string; pick?: string }, StageRows>;
  'step5.remark': Op<{ remark: string }, string>;
  'step5.select': Op<None, true>;
  'step5.update': Op<{ remark: string }, SaveResult>;
  /** 'empty': after Update, LOS shows "No data found" for the stage. */
  'step5.checkStage': Op<{ passport: string; remark: string }, 'moved' | 'empty'>;
  /** The stage page as the site shows it, for the staff to look at in the portal. Changes nothing. */
  'step5.stageView': Op<{ passport: string; stage?: string; refresh?: boolean }, StageView>;

  'step6.open': Op<None, true>;
  'step6.find': Op<{ passport: string }, Card>;
  'step6.visaNumber': Op<{ passport: string }, string>;
  'step6.stamp': Op<{ passport: string; fileName: string }, true>;
  /** Dates as dd/mm/yyyy. */
  'step6.fillDates': Op<{ passport: string; issue: string; expiry: string }, true>;
  'step6.readDates': Op<None, { issue: string; expiry: string }>;
  'step6.submit': Op<{ passport: string }, SaveResult>;
  'step6.confirm': Op<None, string>;
}

export type OpName = keyof Ops;
export type OpArgs<K extends OpName> = Ops[K]['args'];
export type OpResult<K extends OpName> = Ops[K]['result'];
export type OpHandlers = { [K in OpName]: (args: OpArgs<K>) => Promise<OpResult<K>> };

/** How the real automation reports a problem to the portal. */
export type OpError =
  | { kind: 'logged-out' }
  | { kind: 'network'; message: string }
  | { kind: 'stop'; title: string; message: string; rows?: { field: string; expected: string; actual: string }[]; needs?: SiteNeeds }
  | { kind: 'cancelled' }
  | { kind: 'bug'; message: string };

export type OpResponse = { ok: true; result: unknown } | { ok: false; error: OpError };

/** The documents the tool saves, with the name each file starts with. */
export const DOC_BASES = {
  /** Stage 0: the A/c Mini Statement, for the staff to read. */
  miniStatement: '0 Mini statement',
  registration: '1 Registration form',
  english: '2 English certificate',
  /** Only when the staff chooses another file for Verify / Upload English Result in step 3. */
  englishResult: '3 English result',
  profile: '4 Student Profile and Family Details',
  studentType: '4 Student Type Document',
  val: '5 VAL letter',
  holding: '5 Passport holding letter',
  stamp: '6 Visa stamp scan',
} as const;

export type DocKey = keyof typeof DOC_BASES;

export interface StatusResponse {
  ok: true;
  platform: string;
  siteUrl: string;
  browser: 'closed' | 'starting' | 'open' | 'error';
  browserError?: string;
  login: 'in' | 'out' | 'unknown';
}

export interface FolderListing {
  root: string;
  folders: {
    passport: string;
    folder: string;
    files: { name: string; step: number; savedAt: number; kind: 'pdf' | 'image' | 'other'; url: string }[];
  }[];
}
