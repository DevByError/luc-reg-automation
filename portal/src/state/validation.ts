/** Checks on what the staff types. Used by the panels (to show messages) and by the actions (to refuse). */
import { RESULT_SECTION } from '../../shared/ops';
import type { ResultField } from '../../shared/ops';
import { isoToDmy, parseIso, tidySpaces, todayIso } from '../lib/format';
import { resultCertificate } from './store';
import type { AppState } from './types';

export const isFee = (v: string) => v.trim() === '' || /^\d{1,7}(\.\d{1,2})?$/.test(v.trim());
export const isSemesters = (v: string) => v.trim() === '' || /^\d{1,2}$/.test(v.trim());

export function contactCodeError(v: string): string | undefined {
  if (!v) return undefined;
  return /^\d{1,4}$/.test(v) ? undefined : 'Digits only, 1 to 4 of them, e.g. 60.';
}

export function contactNumberError(v: string): string | undefined {
  if (!v) return undefined;
  return /^\d{6,12}$/.test(v) ? undefined : 'Digits only, 6 to 12 of them.';
}

export function issueDateError(iso: string): string | undefined {
  if (!iso) return undefined;
  if (iso > todayIso()) return "This date is after today. A visa can't be issued in the future.";
  return undefined;
}

export function expiryDateError(issue: string, expiry: string): string | undefined {
  if (!expiry || !issue) return undefined;
  if (expiry <= issue) return 'The expiry date must be after the issue date.';
  return undefined;
}

export function expiryWarning(expiry: string): string | undefined {
  if (expiry && expiry < todayIso()) return 'This visa has already expired. Check the date on the passport.';
  return undefined;
}

export function profileMissing(s: AppState): string[] {
  const f = s.form;
  const missing: string[] = [];
  if (!f.studentType) missing.push('Student Type');
  if (!f.salutation) missing.push('Salutation');
  if (!f.intake) missing.push('Intake');
  if (!f.contactCode || contactCodeError(f.contactCode)) missing.push('Country code');
  if (!f.contactNumber || contactNumberError(f.contactNumber)) missing.push('Personal Contact number');
  if (!f.highestQualification) missing.push('Highest Qualification');
  if (!f.visaType) missing.push('Visa Type');
  if (!f.studentCategory) missing.push('Student Category');
  if (!f.classType) missing.push('Class Type');
  if (!f.accommodation) missing.push('Accommodation');
  if (!s.siteData.englishAttached) {
    missing.push(s.docs.english.status === 'error' ? 'English certificate (choose or add it below)' : 'English certificate (the tool attaches it)');
  }
  return missing;
}

export function parentsMissing(s: AppState): string[] {
  return tidySpaces(s.form.parentContact) ? [] : ['Contact No'];
}

export function finalMissing(s: AppState): string[] {
  const f = s.form;
  const pay = s.siteData.payment;
  const missing: string[] = [];
  if (!f.financer) missing.push('Financer');
  // Fees stay as the site shows them. Only a fee the staff changed (where the site allows it) is checked.
  const changed = (k: 'kptFees' | 'tuitionFees' | 'totalSemester') => !!pay?.fees[k].editable && f[k].trim() !== pay.fees[k].value;
  if (changed('kptFees') && !isFee(f.kptFees)) missing.push('KPT Fees (a number)');
  if (changed('tuitionFees') && !isFee(f.tuitionFees)) missing.push('Currently Tution Fees (a number)');
  if (changed('totalSemester') && !isSemesters(f.totalSemester)) missing.push('Total Semester (a whole number)');
  return missing;
}

export function collectionMissing(s: AppState): string[] {
  const f = s.form;
  const missing: string[] = [];
  if (!f.passportType) missing.push('Passport Type');
  if (!tidySpaces(f.remarks)) missing.push('Remarks');
  if (!tidySpaces(f.lastVisaRef)) missing.push('Last Visa Reference No');
  if (!f.issueDate || issueDateError(f.issueDate)) missing.push('Date of Issue Last Visa');
  if (!f.expiryDate || expiryDateError(f.issueDate, f.expiryDate)) missing.push('Date of Expiry Active Visa');
  for (const field of s.siteData.collection ?? []) {
    if (!field.value && !field.locked && !tidySpaces(f.siteFill[field.key] ?? '')) missing.push(field.label);
  }
  return missing;
}

export function visaMissing(s: AppState): string[] {
  const f = s.form;
  const sd = s.siteData;
  const missing: string[] = [];
  if (sd.lucCheck !== 'ok') missing.push('Admission ID check (needs the LUC number from step 1)');
  if (!f.visaIssueDate || issueDateError(f.visaIssueDate)) missing.push('Visa Issue Date');
  if (!f.visaExpiryDate || expiryDateError(f.visaIssueDate, f.visaExpiryDate)) missing.push('Visa Expiry Date');
  if (!sd.stampUploaded) missing.push('Upload Visa Page (the stamp scan)');
  return missing;
}

/* ------------------------------------------------ Verify / Upload English Result */

/** A whole value for an HTML pattern, as the browser checks it. Null when the site's pattern can't be read here. */
function matchesPattern(pattern: string, value: string): boolean | null {
  for (const flags of ['v', 'u']) {
    try {
      return new RegExp(`^(?:${pattern})$`, flags).test(value);
    } catch {
      // This browser doesn't read the pattern with these flags: try the next.
    }
  }
  return null;
}

/**
 * What is wrong with a value for a box on Verify / Upload English Result, by the site's own rules for that box
 * (the same rules the browser checks when Upload is pressed on the site). Undefined when it is fine or still empty.
 */
export function resultFieldError(f: ResultField, raw: string): string | undefined {
  if (f.kind === 'other') return "The portal can't fill this kind of box. Look at the site window.";
  const v = raw.trim();
  if (!v) return undefined;
  if (f.maxLength !== undefined && f.kind !== 'date' && f.kind !== 'select' && v.length > f.maxLength) return `The site takes up to ${f.maxLength} characters here.`;
  switch (f.kind) {
    case 'select':
      return f.options?.includes(v) ? undefined : 'Pick one of the choices the site offers.';
    case 'date': {
      if (parseIso(v) !== v) return 'Not a real date.';
      if (v > todayIso()) return 'This date is after today. A result date is never in the future.';
      if (f.format === 'iso' && f.min && v < f.min) return `The site takes ${isoToDmy(f.min)} or later here.`;
      if (f.format === 'iso' && f.max && v > f.max) return `The site takes ${isoToDmy(f.max)} or earlier here.`;
      return undefined;
    }
    case 'number': {
      if (!/^-?\d+(\.\d+)?$/.test(v)) return 'A number, with a dot for decimals.';
      const n = Number(v);
      const min = f.min !== undefined && f.min !== '' && Number.isFinite(Number(f.min)) ? Number(f.min) : null;
      const max = f.max !== undefined && f.max !== '' && Number.isFinite(Number(f.max)) ? Number(f.max) : null;
      if (min !== null && n < min) return `The site takes ${f.min} or more here.`;
      if (max !== null && n > max) return `The site takes ${f.max} or less here.`;
      // A number box without its own step takes whole numbers only (the browser's rule).
      if ((f.step ?? '').toLowerCase() !== 'any') {
        const step = f.step && Number(f.step) > 0 ? Number(f.step) : 1;
        const q = (n - (min ?? 0)) / step;
        if (Math.abs(q - Math.round(q)) > 1e-9) return step === 1 ? 'The site takes whole numbers only here.' : `The site takes steps of ${f.step} here.`;
      }
      return undefined;
    }
    case 'text': {
      if (f.pattern && matchesPattern(f.pattern, v) === false) return "The site's box doesn't take this value as it is written.";
      return undefined;
    }
  }
  return undefined;
}

/** The value as it goes to the site: dates as yyyy-mm-dd, the rest without spaces at the ends. */
export const resultValueFor = (f: ResultField, raw: string) => (f.kind === 'date' ? raw : raw.trim());

/** The boxes the site shows for the Test Name the staff picked, once the site shows them. */
/** One shared empty list, so a component that reads resultFields doesn't re-render forever. */
const NO_FIELDS: ResultField[] = [];

export function resultFields(s: AppState): ResultField[] {
  const v = s.siteData.result;
  if (!v || v.state !== 'student' || !s.form.resultTestName || v.testName !== s.form.resultTestName) return NO_FIELDS;
  return v.fields;
}

/** What is still needed before Upload on Verify / Upload English Result. */
export function resultMissing(s: AppState): string[] {
  const sd = s.siteData;
  const v = sd.result;
  const f = s.form;
  if (!v) return [`The "${RESULT_SECTION}" section (the tool finds it after Final Submit)`];
  const missing: string[] = [];
  const id = tidySpaces(f.resultStudentId);
  if (!id) missing.push('Student ID');
  else if (v.state !== 'student' || sd.resultViewed !== id) missing.push('View with this Student ID');
  else if (v.rows.length !== 1 || !v.samePassport) missing.push("A Student ID that shows this student's row");
  const own = s.docs.englishResult;
  if (own.status === 'loading') missing.push('English Result (your file is still being saved)');
  else if (own.status === 'error') missing.push('English Result (choose the file again)');
  else if (!resultCertificate(s)) missing.push('English Result (the certificate)');
  if (!f.resultTestName) missing.push('Test Name');
  else if (v.state === 'student' && v.testName !== f.resultTestName) missing.push(`Test Name (the site doesn't show ${f.resultTestName} yet)`);
  for (const field of resultFields(s)) {
    if (field.locked) continue;
    const value = f.resultValues[field.key] ?? '';
    if (field.kind === 'other') missing.push(`${field.label} (the portal can't fill it)`);
    else if (!value.trim()) missing.push(field.label);
    else if (resultFieldError(field, value)) missing.push(`${field.label} (check it)`);
  }
  return missing;
}
