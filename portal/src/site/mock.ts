/**
 * Sample mode: the same actions as the real automation (server/ops.ts), answered by the pretend
 * site in mock/site.ts with made-up sample data. Nothing here reaches online.lincoln.edu.my.
 */
import { RESULT_SECTION } from '../../shared/ops';
import type {
  CollectionValues,
  DocFile,
  OpHandlers,
  PaymentRead,
  PaymentValues,
  ProfileValues,
  ReadBack,
  RegRow,
  ResultView,
} from '../../shared/ops';
import {
  OPTIONS,
  RESULT_HEADERS,
  RESULT_TESTS,
  SAMPLE,
  SAMPLE_DOCUMENTS,
  SAMPLE_FILES,
  SAMPLE_PHOTO,
  SAMPLE_STAGES,
  STAGE_EMPTY,
  STAGE_HEADERS,
  collectionFields,
  demo,
  resetSite,
  resultBoxes,
  sampleStageRows,
  siteCall,
  siteCheckSaved,
  siteHas,
  siteLogin,
  siteSave,
  takeMismatch,
} from '../mock/site';
import { StopError } from '../state/errors';

const DATA_FOUND = 'Data Found to Verify and submit.';
const ODL_REDIRECT = 'For ODL students, you will be redirected to the ODL Registration Page.';

/** What the pretend site holds for the open student, so a read-back shows what was filled. */
let profile: ProfileValues | null = null;
let englishFile = '';
let parentContact: string = SAMPLE.parents.contactNo;
let payment: PaymentValues | null = null;
let collection: CollectionValues | null = null;
let visaDates = { issue: '', expiry: '' };
/** Country on the Admission Profile, when the student left it empty and the staff filled it in the portal. */
let country = '';
/** Verify / Upload English Result on the pretend site: the student shown, its Test Name and what was filled. */
let result = { student: false, test: '', values: {} as Record<string, string>, file: '' };
const COUNTRY_KEY = 'ContentPlaceHolder1_maintabcontainer_Tab1_ddlcountry';

/** A new student in sample mode: the pretend site forgets the last one. */
export function resetSample() {
  resetSite();
  resetHeld();
}

function resetHeld() {
  profile = null;
  englishFile = '';
  parentContact = SAMPLE.parents.contactNo;
  payment = null;
  collection = null;
  visaDates = { issue: '', expiry: '' };
  country = '';
  result = { student: false, test: '', values: {}, file: '' };
}

const setDemo = (p: Partial<ReturnType<typeof demo.get>>) => demo.set((d) => ({ ...d, ...p }));

/** Verify / Upload English Result as the pretend site shows it now. */
function resultView(passport: string): ResultView {
  const where = demo.get().englishResult === 'tab' ? 'tab' : 'form';
  const empty: ResultView = { where, state: 'empty', headers: [], rows: [], samePassport: false, testNames: [], testName: '', fields: [], said: [] };
  if (!result.student) return empty;
  return {
    ...empty,
    state: 'student',
    headers: RESULT_HEADERS,
    rows: [[passport, SAMPLE.name, SAMPLE.program, SAMPLE.nationality]],
    samePassport: true,
    testNames: RESULT_TESTS,
    testName: result.test,
    fields: resultBoxes(result.test).map((f) => ({ ...f, value: result.values[f.key] ?? '' })),
  };
}

const pdf = (url: string): DocFile => ({ url, kind: 'pdf' });

/** "Passport Received From Student" shows "No data found" on the pretend site now (a test control), until Submit again. */
function stageEmptyNow(): boolean {
  const mode = demo.get().stageNoData;
  if (mode === 'off' || siteHas('collectionAgain')) return false;
  return mode === 'before' || siteHas('stage');
}

/** Payment Plan on the pretend site: fees set by Accounts (only shown), and the Financer as last saved. */
function samplePayment(): PaymentRead {
  const f = SAMPLE.payment.fees;
  const shown = (value: string) => ({ value, editable: false });
  return {
    fees: { kptFees: shown(f.kptFees), scholarship: shown(f.scholarship), tuitionFees: shown(f.tuitionFees), totalSemester: shown(f.totalSemester) },
    financer: payment ? (takeMismatch() ? (payment.financer === 'PTPTN' ? 'JPA' : 'PTPTN') : payment.financer) : SAMPLE.payment.financer,
    financerOptions: OPTIONS.financer,
    plan: SAMPLE.payment.plan,
  };
}

export const mockHandlers: OpHandlers = {
  'session.start': async () => {
    resetSite();
    resetHeld();
    return true;
  },
  // In sample mode "checking the login" is the staff logging in again.
  'login.check': async () => {
    await siteLogin();
    return true;
  },
  'save.check': ({ key }) => siteCheckSaved(key),
  'site.reveal': async () => ({ outlined: false }),
  'popup.answer': async () => true,

  'step1.open': () => siteCall(1400, () => true),
  'step1.search': ({ passport }) =>
    siteCall(900, () => {
      // Like the real list: two rows can be the same registration twice, told apart only by Sl No and the photo.
      const row = (n: number, photo: string): RegRow => ({
        name: SAMPLE.name,
        applicationId: `${SAMPLE.admissionId} ${passport}`,
        course: SAMPLE.program,
        applyDate: SAMPLE.applyDate,
        key: `row-${n}`,
        id: `sample-${n}`,
        shown: [
          ['Sl No.', String(n)],
          ['Name', SAMPLE.name],
          ['Application ID/Passport', `${SAMPLE.admissionId} ${passport}`],
          ['Course name', SAMPLE.program],
          ['Apply Date', SAMPLE.applyDate],
          ['Status', 'New'],
          ['Days', '1'],
        ],
        photo,
      });
      const result = demo.get().searchResult;
      if (result === 'none') return [];
      if (result === 'two') return [row(5, ''), row(6, SAMPLE_PHOTO)];
      return [row(1, SAMPLE_PHOTO)];
    }),
  'step1.print': ({ key }) =>
    siteCall(1500, () => {
      if (!/^row-\d+$/.test(key)) throw new StopError('The list changed', 'Choose the row again.');
      return true;
    }),
  'step1.pdf': () => siteCall(2200, () => pdf(SAMPLE_FILES.registration)),

  'step2.open': () => siteCall(1300, () => true),
  'step2.view': () => {
    const odl = demo.get().odl;
    return siteCall(odl ? 2200 : 1000, () => ({ odl, popups: odl ? [ODL_REDIRECT, DATA_FOUND] : [DATA_FOUND] }));
  },
  'step2.read': () =>
    siteCall(1100, () => ({
      salutation: SAMPLE.salutation,
      contactCode: SAMPLE.contactCode,
      contactNumber: SAMPLE.contactNumber,
      schoolName: SAMPLE.schoolName,
      options: {
        studentType: OPTIONS.studentType,
        salutation: OPTIONS.salutation,
        intake: OPTIONS.intake,
        highestQualification: OPTIONS.highestQualification,
        visaType: OPTIONS.visaType,
        studentCategory: OPTIONS.studentCategory,
        classType: OPTIONS.classType,
        accommodation: OPTIONS.accommodation,
      },
    })),
  'step2.fill': ({ values, englishFile: file }) =>
    siteCall(1500, () => {
      profile = { ...values };
      if (file) englishFile = file;
      return true;
    }),
  'step2.readBack': ({ englishFile: file }) =>
    siteCall(900, () => {
      const p = profile;
      if (!p) return [];
      const out: ReadBack = [
        ['Student Type', p.studentType],
        ['Salutation', p.salutation],
        ['Intake', p.intake],
        ['Personal Contact', `${p.contactCode} ${p.contactNumber}`],
        ['Highest Qualification', p.highestQualification],
        ['Visa Type', p.visaType],
        ['Student Category', p.studentCategory],
        ['Class Type', takeMismatch() ? (p.classType === 'Class 3' ? 'Class 1' : 'Class 3') : p.classType],
        ['Accommodation', p.accommodation],
      ];
      if (file) out.push(['English certificate', englishFile]);
      return out;
    }),
  'step2.continue': () => {
    if (!demo.get().needsCountry || country) return siteSave('profile', 1400);
    return siteCall(1400, () => {
      throw new StopError(
        'The site needs more details',
        'Continue To Next on Admission Profile didn\'t go through: the site asks for Country. The site said: "Please select Country".',
        {
          needs: {
            save: 'profile',
            tab: 'Admission Profile',
            fields: [{ key: COUNTRY_KEY, label: 'Country', kind: 'select', value: '', options: ['Sampleland', 'Malaysia'], said: 'Please select Country' }],
          },
        },
      );
    });
  },
  'step2.checkNext': () => siteCall(700, () => true),

  'english.open': () => siteCall(1300, () => true),
  'english.search': () => siteCall(1000, () => true),
  'english.find': () => siteCall(500, () => (demo.get().englishMissing ? 0 : 1)),
  'english.download': () => siteCall(1600, () => pdf(SAMPLE_FILES.english)),
  'english.attach': ({ fileName }) =>
    siteCall(900, () => {
      englishFile = fileName;
      return true;
    }),
  'english.list': () => siteCall(1400, () => SAMPLE_DOCUMENTS),
  'english.pick': ({ index, cells }) =>
    siteCall(1600, () => {
      const row = SAMPLE_DOCUMENTS.rows[index];
      if (!row || row.cells.join('\n') !== cells.join('\n')) throw new StopError('The list changed', 'Choose the document again from the list.');
      return pdf(SAMPLE_FILES.english);
    }),

  'form.fillNeeds': ({ values }) =>
    siteCall(900, () => {
      for (const v of values) if (v.key === COUNTRY_KEY) country = v.value;
      return values.map((v): [string, string] => [v.label, v.key === COUNTRY_KEY ? country : v.value]);
    }),

  'step3.pass': ({ tab }) => siteSave(tab, tab === 'address' ? 1100 : 1000),
  'step3.parents': () => siteCall(1000, () => ({ ...SAMPLE.parents, contactNo: parentContact })),
  'step3.writeContact': ({ value }) =>
    siteCall(800, () => {
      parentContact = value;
      return true;
    }),
  'step3.readContact': () => siteCall(600, () => (takeMismatch() ? SAMPLE.parents.contactNo : parentContact)),
  'step3.continueParents': () => siteSave('parents', 1200),
  'step3.payment': () => siteCall(payment ? 700 : 1000, samplePayment),
  'step3.fillPayment': ({ values }) =>
    siteCall(1000, () => {
      payment = { ...values };
      return true;
    }),
  'step3.final': () => siteSave('final', 1800),

  'result.find': ({ passport }) => siteCall(1500, () => resultView(passport)),
  'result.view': ({ passport, studentId }) =>
    siteCall(1300, () => {
      result = { student: false, test: '', values: {}, file: '' };
      // "ID not found" is a test control for one View; any other ID than the sample's is never found.
      const missing = demo.get().englishResult === 'notfound';
      if (missing) setDemo({ englishResult: 'normal' });
      if (missing || studentId !== SAMPLE.studentId) {
        throw new StopError('The site showed a message', `After View with Student ID ${studentId}, the site said: "No record found". Check the Student ID, then press View again.`);
      }
      result.student = true;
      return resultView(passport);
    }),
  'result.test': ({ passport, testName }) =>
    siteCall(900, () => {
      if (!result.student) throw new StopError("The student isn't showing", `"${RESULT_SECTION}" doesn't show the student's row any more. Nothing was uploaded. Press View in the portal again.`);
      result.test = testName;
      result.values = {};
      return resultView(passport);
    }),
  'result.fill': ({ fileName, testName, values }) =>
    siteCall(1500, () => {
      if (!result.student) throw new StopError("The student isn't showing", `"${RESULT_SECTION}" doesn't show the student's row any more. Nothing was uploaded. Press View in the portal again.`);
      result.test = testName;
      for (const v of values) result.values[v.key] = v.value;
      result.file = fileName;
      const back: ReadBack = [
        ['English Result', result.file],
        ['Test Name', result.test],
      ];
      for (const f of resultBoxes(result.test)) back.push([f.label, takeMismatch() && f.kind !== 'date' ? '5' : (result.values[f.key] ?? '')]);
      return { back, invalid: [] };
    }),
  'result.upload': () => {
    if (demo.get().englishResult !== 'refuse') {
      return siteSave('englishReupload', 1600).then((r) => {
        result = { student: false, test: '', values: {}, file: '' };
        return r;
      });
    }
    return siteCall(1400, () => {
      setDemo({ englishResult: 'normal' });
      throw new StopError(
        "The site didn't take the upload",
        'After Upload the site said: "Upload failed. Please try again." Check the certificate and the boxes in the portal, then press Upload again.',
      );
    });
  },

  'step0.open': () => siteCall(1200, () => true),
  'step0.view': () => siteCall(900, () => ({ reasonAsked: true })),
  'step0.reason': () => siteCall(900, () => 'Reason submitted Successfully'),
  'step0.pdf': () => siteCall(2000, () => pdf(SAMPLE_FILES.miniStatement)),

  'step4.open': () => siteCall(1300, () => true),
  'step4.view': () => siteCall(900, () => ({ reasonAsked: true })),
  'step4.reason': () => siteCall(900, () => 'Reason submitted Successfully'),
  'step4.result': () => siteCall(1200, () => ({ studentId: SAMPLE.studentId, name: SAMPLE.name, course: SAMPLE.program })),
  'step4.docsTab': () => siteCall(1500, () => true),
  'step4.download': ({ doc }) => siteCall(1600, () => pdf(doc === 'profile' ? SAMPLE_FILES.profile : SAMPLE_FILES.studentType)),

  'val.open': () => siteCall(1200, () => true),
  'val.fetch': () => siteCall(1500, () => pdf(SAMPLE_FILES.val)),

  'step5.open': () => siteCall(1300, () => true),
  'step5.load': ({ passport }) =>
    siteCall(1900, () => ({
      fields: collectionFields(passport).map((f) => (f.key === 'passportNumber' ? { ...f, locked: true } : f)),
      passportTypeOptions: OPTIONS.passportType,
      // The pretend site has nothing in these yet, so the portal starts from its defaults.
      current: { passportType: '', remarks: '', lastVisaRef: '', issueDate: '', lastEntryDate: '', expiryDate: '' },
    })),
  'step5.fill': ({ values }) =>
    siteCall(1400, () => {
      collection = { ...values, siteFill: { ...values.siteFill } };
      return true;
    }),
  'step5.readBack': () =>
    siteCall(800, () => {
      const c = collection;
      if (!c) return [];
      const out: ReadBack = [
        ['Passport Type', c.passportType],
        ['Remarks', c.remarks],
        ['Last Visa Reference No', c.lastVisaRef],
        ['Date of Issue Last Visa', c.issueDate],
        ['Date of Last Entry', takeMismatch() ? '' : c.lastEntryDate],
        ['Date of Expiry Active Visa', c.expiryDate],
      ];
      for (const f of collectionFields('')) {
        const v = (c.siteFill[f.key] ?? '').trim();
        if (v && f.key !== 'passportNumber') out.push([f.label, v]);
      }
      return out;
    }),
  'step5.confirm': () => siteCall(400, () => true),
  // The second Submit (Submit again) is its own save on the pretend site, as in the portal.
  'step5.submit': () => siteSave(siteHas('collection') ? 'collectionAgain' : 'collection', 1600),
  'step5.collectionTab': () => siteCall(900, () => true),
  'step5.holdingWait': () => siteCall(1800, () => true),
  'step5.holding': () => siteCall(1700, () => pdf(SAMPLE_FILES.holding)),
  'step5.stagesTab': () => siteCall(1100, () => true),
  'step5.stage': ({ refresh }) => siteCall(refresh ? 1800 : 900, () => true),
  'step5.stageSearch': ({ passport, pick }) =>
    siteCall(1000, () => {
      if (stageEmptyNow()) return { headers: [], rows: [], picked: false, empty: STAGE_EMPTY };
      const rows = sampleStageRows(passport, demo.get().multiLuc);
      const chosen = pick ? rows.filter((r) => r.details === pick.replace(/\s+/g, ' ').trim()) : rows.length === 1 ? rows : [];
      return { headers: STAGE_HEADERS, rows, picked: chosen.length === 1, empty: '' };
    }),
  'step5.remark': ({ remark }) => siteCall(600, () => remark),
  'step5.select': () => siteCall(500, () => true),
  'step5.update': () => siteSave(siteHas('collectionAgain') ? 'stageAgain' : 'stage', 1400, Math.random() < 0.5 ? 'Updated Successfully' : undefined),
  'step5.checkStage': () => siteCall(1000, () => (stageEmptyNow() ? 'empty' : 'moved')),
  'step5.stageView': ({ passport, stage }) =>
    siteCall(1300, () => {
      const name = stage && SAMPLE_STAGES.includes(stage) ? stage : SAMPLE_STAGES[0];
      // The student's row sits on "Passport Received From Student" until an Update moves it to INSO.
      const moved = siteHas(siteHas('collectionAgain') ? 'stageAgain' : 'stage');
      const here = name === SAMPLE_STAGES[0] ? !moved && !stageEmptyNow() : name === SAMPLE_STAGES[1] && moved;
      const rows = here ? sampleStageRows(passport, demo.get().multiLuc) : [];
      return {
        stages: SAMPLE_STAGES,
        stage: name,
        empty: name === SAMPLE_STAGES[0] && stageEmptyNow() ? STAGE_EMPTY : '',
        headers: rows.length ? STAGE_HEADERS : [],
        rows,
      };
    }),

  'step6.open': () => siteCall(1300, () => true),
  'step6.find': ({ passport }) =>
    siteCall(1600, () => ({
      name: SAMPLE.name,
      program: SAMPLE.program,
      admissionId: SAMPLE.admissionId,
      passportNo: passport,
      nationality: SAMPLE.nationality,
    })),
  'step6.visaNumber': ({ passport }) => siteCall(600, () => passport),
  'step6.stamp': () => siteCall(1800, () => true),
  'step6.fillDates': ({ issue, expiry }) =>
    siteCall(900, () => {
      visaDates = { issue, expiry };
      return true;
    }),
  'step6.readDates': () =>
    siteCall(600, () => ({
      issue: visaDates.issue,
      expiry: takeMismatch() ? visaDates.expiry.split('/').reverse().join('/') : visaDates.expiry,
    })),
  'step6.submit': () => siteSave('visa', 1600, Math.random() < 0.5 ? 'Visa information submitted successfully.' : undefined),
  'step6.confirm': () => siteCall(900, () => 'Visa information submitted successfully.'),
};
