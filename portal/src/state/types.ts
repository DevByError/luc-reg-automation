import type { CollectionField, CollectionShown, PaymentRead, ProfileOptions, RegRow, ResultView, SaveKey, SiteDocs, SiteNeeds, StageRows, StageView } from '../../shared/ops';

export type { SaveKey } from '../../shared/ops';

/** Step 0 is the A/c Mini Statement, only for the staff to read. No other step uses it, and it is not needed for "all done". */
export type StepId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const STEP_IDS: StepId[] = [0, 1, 2, 3, 4, 5, 6];

/** waiting: needs another step first · working: the tool is busy · needs-staff: your turn · error: stopped */
export type StepStatus = 'idle' | 'waiting' | 'working' | 'needs-staff' | 'done' | 'error';

export type ActivityState = 'waiting' | 'running' | 'retrying' | 'paused' | 'done' | 'error';

export interface Activity {
  id: number;
  label: string;
  detail?: string;
  state: ActivityState;
  startedAt?: number;
  endedAt?: number;
  retryAt?: number;
}

export type RetryKey =
  | 'step1'
  | 'luc'
  | 'step2'
  | 'english'
  | 'profile'
  | 'passThrough'
  | 'parents'
  | 'final'
  /** Verify / Upload English Result after Final Submit: finding it, View, the Test Name and Upload. */
  | 'result'
  /** Saving the file the staff chose for Verify / Upload English Result. */
  | 'resultFile'
  | 'step0'
  | 'step4'
  | 'step5'
  | 'val'
  | 'collection'
  | 'afterSubmit'
  | 'resubmit'
  | 'stageView'
  | 'step6'
  | 'stamp'
  | 'visa'
  | 'siteNeeds';

export interface StepError {
  title: string;
  message: string;
  rows?: { field: string; expected: string; actual: string }[];
  retry?: RetryKey;
  retryLabel?: string;
  /** The tool can't tell whether this save went through: the staff looks at the site window and says. */
  confirmSaved?: SaveKey;
  /** The site gave no sign whether it took the stamp scan: the staff looks at the site window and says. */
  confirmStamp?: boolean;
  /** A second line under the message: what else the staff can do. */
  hint?: string;
  /** The site refused a save and asks for these fields, which the staff fills here. */
  needs?: SiteNeeds;
  /** Step 5: the staff can look at Passport Movement Stages in the portal ("Show the stage page here"). */
  stagePage?: boolean;
}

export interface StepState {
  status: StepStatus;
  note: string;
  activities: Activity[];
  error?: StepError;
}

export type DocKey = 'miniStatement' | 'registration' | 'english' | 'englishResult' | 'profile' | 'studentType' | 'val' | 'holding' | 'stamp';
export const DOC_KEYS: DocKey[] = ['miniStatement', 'registration', 'english', 'englishResult', 'profile', 'studentType', 'val', 'holding', 'stamp'];
/** Saved only when the staff chooses another file for the English result in step 3, so it has a tab only then. */
export const OPTIONAL_DOCS: DocKey[] = ['englishResult'];

export type DocStatus = 'waiting' | 'loading' | 'ready' | 'error';

export interface DocState {
  status: DocStatus;
  url?: string;
  kind?: 'pdf' | 'image';
  fileName?: string;
  startedAt?: number;
  note?: string;
}

export interface SavedFile {
  name: string;
  url: string;
  kind: 'pdf' | 'image';
  step: StepId;
  savedAt: number;
}

export interface Student {
  passport: string;
  folder: string;
  startedAt: number;
}

export interface FormState {
  luc: string;
  lucSaved: string;
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
  parentContact: string;
  kptFees: string;
  scholarship: string;
  tuitionFees: string;
  totalSemester: string;
  financer: string;
  passportType: string;
  remarks: string;
  lastVisaRef: string;
  issueDate: string;
  expiryDate: string;
  siteFill: Record<string, string>;
  visaIssueDate: string;
  visaExpiryDate: string;
  visaIssueEdited: boolean;
  visaExpiryEdited: boolean;
  /** Step 3, Verify / Upload English Result: the Student ID (from step 4 unless the staff typed one). */
  resultStudentId: string;
  resultIdByStaff: boolean;
  /** The Test Name the staff picked, from the site's own list. */
  resultTestName: string;
  /** The staff's values for the boxes the site shows for that test, by the box's id. Dates as yyyy-mm-dd. */
  resultValues: Record<string, string>;
}

export interface SiteData {
  /** The row of the Registration Forms list the tool printed. */
  regRow?: RegRow;
  /** Every row that matched the passport, when there was more than one, for the staff to choose from. */
  regRows?: RegRow[];
  /** The row the staff chose (its id). */
  regPick?: string;
  /** The list of rows shows for the staff to choose (again, until the LUC number is saved). */
  regChoosing?: boolean;
  odl?: boolean;
  profileLoaded?: boolean;
  schoolName?: string;
  /** The site's own dropdown choices, read live. */
  profileOptions?: ProfileOptions;
  englishAttached?: boolean;
  /** The staff added the English certificate themselves, because the tool couldn't get it from the site. */
  englishByStaff?: { name: string; size: number; type: string };
  /** The student's documents on Applicant Details, shown when the certificate isn't under its usual name. */
  englishDocs?: SiteDocs;
  /** The staff chose the certificate from that list: the document's name as the site shows it. */
  englishFromSite?: { name: string };
  /** The staff asked to choose a different file, while the Admission Profile isn't saved yet. */
  englishChoosing?: boolean;
  parents?: {
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
  };
  paymentLoaded?: boolean;
  /** Payment Plan as the site showed it when last read: the fees, the Financer and the fee table. */
  payment?: PaymentRead;
  /** After Final Submit: Verify / Upload English Result as the site showed it last. */
  result?: ResultView;
  /** The Student ID that View was pressed with, while the site shows that student's row. */
  resultViewed?: string;
  /** The file the staff chose instead of step 2's certificate. */
  resultFileByStaff?: { name: string; size: number; type: string };
  /** The box to choose another file shows. */
  resultChoosing?: boolean;
  /** Upload was pressed on the site at least once (so a View that finds nobody may mean it went through). */
  resultUploadTried?: boolean;
  /** What went up, for the message once it's done. */
  resultUploaded?: { file: string; testName: string };
  /** What the tool is doing on the section right now, for the portal's buttons. */
  resultWork?: 'find' | 'view' | 'test' | 'upload';
  fileRow?: { studentId: string; name: string; course: string };
  docsTabOpen?: boolean;
  collection?: CollectionField[];
  passportTypeOptions?: string[];
  /** Passport Collection's own fields as the site had them when the form loaded (dates yyyy-mm-dd). */
  collectionShown?: CollectionShown;
  stageConfirmed?: boolean;
  /** The staff said the stage is right on the site ("It's done on the site"), so the tool didn't check it itself. */
  stageByStaff?: boolean;
  /** The student's rows on the Movement stage when there is more than one (one per LUC ID), for the staff to choose from. */
  stageRows?: StageRows;
  /** The Student Details of the row the staff chose. */
  stagePick?: string;
  /** Passport Movement Stages as the site showed it last, when the staff opened it in the portal. */
  stageView?: StageView;
  /** The stage page shows in the portal. */
  stagePageOpen?: boolean;
  /** Why the stage page couldn't be read, if it couldn't. */
  stageViewError?: string;
  card?: { name: string; program: string; admissionId: string; passportNo: string; nationality: string };
  lucCheck?: 'waiting' | 'ok' | 'bad';
  visaNumberFilled?: boolean;
  stampUploaded?: boolean;
  stampFile?: { name: string; size: number; type: string };
  visaSent?: { issue: string; expiry: string };
  visaConfirmed?: boolean;
  /** Saves the staff said went through after looking at the site window. */
  staffConfirmed?: Partial<Record<SaveKey, true>>;
}

export type Mode = 'live' | 'sample';

export interface Settings {
  filesRoot: string;
  accessReason: string;
  /** live: works on online.lincoln.edu.my in the site window. sample: made-up data, nothing leaves the portal. */
  mode: Mode;
  /** Live mode: before each press on the site, the button is outlined in the site window and the staff says go. */
  watchMode: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface PopupQuestion {
  id: number;
  step: StepId;
  text: string;
  action: string;
  /** The site still waits for OK or Cancel (otherwise the popup was a message and is already closed). */
  held: boolean;
}

/** Watch mode: the press the tool is about to make, waiting for the staff. */
export interface WatchQuestion {
  id: number;
  step: StepId;
  key: SaveKey;
  label: string;
  /** A picture of the site page with the button outlined, taken without bringing the site window forward. */
  picture?: string;
  /** The tool found the button and outlined it. */
  outlined?: boolean;
  /** Where the button's middle is in the picture, in pixels. */
  spot?: { x: number; y: number };
}

/** The site window (live mode), as the tool on this computer reports it. */
export interface SiteWindow {
  /** The tool on this computer: not asked yet, answering, or not answering. */
  tool: 'connecting' | 'ok' | 'down';
  browser: 'closed' | 'starting' | 'open' | 'error';
  login: 'in' | 'out' | 'unknown';
  error?: string;
}

export interface AppState {
  runId: number;
  settings: Settings;
  /** The login has no fixed length; it shows logged-out only after the site says so. */
  site: { status: 'signed-in' | 'logged-out' | 'checking' };
  siteWindow: SiteWindow;
  student: Student | null;
  steps: Record<StepId, StepState>;
  docs: Record<DocKey, DocState>;
  activeStep: StepId;
  activeDoc: DocKey;
  docPage: number;
  form: FormState;
  siteData: SiteData;
  busy: Record<string, boolean>;
  saves: Partial<Record<SaveKey, boolean>>;
  savedFiles: Record<string, SavedFile[]>;
  popups: PopupQuestion[];
  watch: WatchQuestion | null;
  toasts: Toast[];
  ui: {
    mobileView: 'fields' | 'docs';
    demoOpen: boolean;
    settingsOpen: boolean;
    filesOpen: boolean;
    filesQuery: string;
    confirm: null | 'final' | 'newStudent';
  };
}
