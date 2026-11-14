/**
 * Step 3 / Step 5 / version checks against the sample-mode site (nothing reaches LOS).
 * Run: node scripts/run-tests.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
(globalThis as any).window = globalThis;

import { mockHandlers, resetSample } from '../src/site/mock';
import { SAMPLE, demo } from '../src/mock/site';
import { versionText } from '../src/version';
import { STAGE_REMARK, allDone, needsStepFourAgain } from '../src/state/actions';
import { freshSteps } from '../src/state/store';
import { datePattern, readDate, writeDate } from '../shared/dates';

const P = 'AB1234567';
const h: any = mockHandlers;
const fresh = () => resetSample();

test('version text', () => assert.equal(versionText(), '6 Nov 2026, 10:45'));
test('step 5 remark is "new student"', () => assert.equal(STAGE_REMARK, 'new student'));

test('dates follow the box format', () => {
  assert.equal(datePattern('dd/mm/yyyy'), 'dd/mm/yyyy');
  assert.equal(writeDate('2026-11-04', 'dd/mm/yyyy'), '04/11/2026');
  assert.equal(readDate('04/11/2026', 'dd/mm/yyyy'), '2026-11-04');
  assert.equal(readDate('31/02/2026', 'dd/mm/yyyy'), null);
});

test('wrong Student ID is not found', async () => {
  fresh();
  await assert.rejects(h['result.view']({ passport: P, studentId: 'S999999' }), /No record found/);
});

test('View shows the student, MOI has no boxes, IELTS has score + date', async () => {
  fresh();
  const v = await h['result.view']({ passport: P, studentId: SAMPLE.studentId });
  assert.equal(v.state, 'student');
  assert.equal(v.samePassport, true);
  const moi = await h['result.test']({ passport: P, testName: 'MOI' });
  assert.equal(moi.fields.length, 0);
  const ielts = await h['result.test']({ passport: P, testName: 'IELTS' });
  assert.deepEqual(ielts.fields.map((f: any) => f.label), ['Test Score', 'Result Date']);
  assert.equal(ielts.fields[1].kind, 'date');
});

test('test before View is refused', async () => {
  fresh();
  await assert.rejects(h['result.test']({ passport: P, testName: 'IELTS' }), /doesn't show the student/);
  await assert.rejects(h['result.fill']({ fileName: 'a.pdf', testName: 'IELTS', values: [] }), /doesn't show the student/);
});

test('fill reads back what was filled; upload returns to the empty Student ID box', async () => {
  fresh();
  await h['result.view']({ passport: P, studentId: SAMPLE.studentId });
  await h['result.test']({ passport: P, testName: 'IELTS' });
  const f = await h['result.fill']({
    fileName: 'cert.pdf', testName: 'IELTS',
    values: [{ key: 'txtScore', label: 'Test Score', value: '6.5' }, { key: 'txtResultDate', label: 'Result Date', value: '2026-10-01' }],
  });
  const back = Object.fromEntries(f.back);
  assert.equal(back['English Result'], 'cert.pdf');
  assert.equal(back['Test Name'], 'IELTS');
  assert.equal(back['Test Score'], '6.5');
  assert.equal(back['Result Date'], '2026-10-01');
  await h['result.upload']({ passport: P, fileName: 'cert.pdf' });
  const after = await h['result.find']({ passport: P });
  assert.equal(after.state, 'empty');
  await assert.rejects(h['result.test']({ passport: P, testName: 'IELTS' }), /doesn't show the student/);
});

test('refused upload throws and leaves the student showing', async () => {
  fresh();
  await h['result.view']({ passport: P, studentId: SAMPLE.studentId });
  await h['result.test']({ passport: P, testName: 'MOI' });
  await h['result.fill']({ fileName: 'c.pdf', testName: 'MOI', values: [] });
  (demo as any).set((d: any) => ({ ...d, englishResult: 'refuse' }));
  await assert.rejects(h['result.upload']({ passport: P, fileName: 'c.pdf' }), /Upload failed/);
  assert.equal((await h['result.find']({ passport: P })).state, 'student');
});

test('no "I uploaded it myself" / "I\'ve uploaded" button anywhere in the UI', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const bad = walk('src').filter((f) => /uploaded it myself|I['’]ve uploaded|I have uploaded/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});

test('Step 3 has no staff-name box and Step 3 UI has Upload + Test Name', () => {
  const s3 = readFileSync('src/components/steps/Step3.tsx', 'utf8');
  assert.match(s3, /Test Name/);
  assert.match(s3, />\s*Upload\s*</);
  assert.doesNotMatch(readFileSync('src/components/steps/Step5.tsx', 'utf8'), /Staff name/i);
});

test('stage 0 (mini statement) never decides "all done" for the other steps', () => {
  const steps: any = freshSteps();
  for (const id of [1, 2, 3, 4, 5, 6]) steps[id] = { ...steps[id], status: 'done' };
  steps[0] = { ...steps[0], status: 'error' };
  assert.equal(allDone({ steps } as any), true);
  steps[3] = { ...steps[3], status: 'working' };
  steps[0] = { ...steps[0], status: 'done' };
  assert.equal(allDone({ steps } as any), false);
});

test('sample mode: stage 0 gives a PDF', async () => {
  fresh();
  const f = await h['step0.pdf']({ passport: P });
  assert.equal(f.kind, 'pdf');
});

/* ---- ZIP files from the site (students sometimes upload a folder) ---- */
import { saveDoc, settings } from '../server/files';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ZIP_MANY = Buffer.from('UEsDBBQAAAAIADBzZV1+4NxQIwAAAGcCAAAVAAAAY2VydC9JRUxUUyByZXN1bHQucGRmUw1wcdM11DPhykjNyclXKM8vyklRGGWPsqnF5lJVdfV3AwBQSwMEFAAAAAgAMHNlXRYUFPAJAAAAaAAAAA4AAABjZXJ0L3Bob3RvLmpwZ/t/4/+DCjoAAFBLAwQUAAAACAAwc2Vd0n08ywgAAAAGAAAAGQAAAF9fTUFDT1NYL2NlcnQvLl9waG90by5qcGf7fyOrNC8bAFBLAwQUAAAACAAwc2Vdh3LgtAsAAAAJAAAADgAAAGNlcnQvbm90ZXMudHh0y0zPyy9KVchNBQBQSwECFAAUAAAACAAwc2VdfuDcUCMAAABnAgAAFQAAAAAAAAAAAAAAgAEAAAAAY2VydC9JRUxUUyByZXN1bHQucGRmUEsBAhQAFAAAAAgAMHNlXRYUFPAJAAAAaAAAAA4AAAAAAAAAAAAAAIABVgAAAGNlcnQvcGhvdG8uanBnUEsBAhQAFAAAAAgAMHNlXdJ9PMsIAAAABgAAABkAAAAAAAAAAAAAAIABiwAAAF9fTUFDT1NYL2NlcnQvLl9waG90by5qcGdQSwECFAAUAAAACAAwc2Vdh3LgtAsAAAAJAAAADgAAAAAAAAAAAAAAgAHKAAAAY2VydC9ub3Rlcy50eHRQSwUGAAAAAAQABAACAQAAAQEAAAAA', 'base64'); // IELTS result.pdf + photo.jpg + junk (__MACOSX, notes.txt), packed (deflate)
const ZIP_ONE = Buffer.from('UEsDBBQAAAAIADBzZV279dHsDQAAAFgAAAAUAAAAb25seS9jZXJ0aWZpY2F0ZS5wbmfrDPBz5+WS4qqkMgAAUEsBAhQAFAAAAAgAMHNlXbv10ewNAAAAWAAAABQAAAAAAAAAAAAAAIABAAAAAG9ubHkvY2VydGlmaWNhdGUucG5nUEsFBgAAAAABAAEAQgAAAD8AAAAAAA==', 'base64'); // one PNG inside a folder

test('ZIP with one picture: it is taken out and saved like any document', () => {
  settings.filesRoot = mkdtempSync(join(tmpdir(), 'zip1-'));
  const f = saveDoc('ZP1', 'english', ZIP_ONE);
  assert.equal(f.kind, 'image');
  assert.equal(f.fileName, '2 English certificate.png');
  assert.equal(f.warning, undefined);
  assert.ok(existsSync(join(settings.filesRoot, 'ZP1', '2 English certificate.png')));
});

test('ZIP with several files: all saved, the PDF is first, the staff is told, junk is left out', () => {
  settings.filesRoot = mkdtempSync(join(tmpdir(), 'zip2-'));
  const f = saveDoc('ZP2', 'english', ZIP_MANY);
  const names = readdirSync(join(settings.filesRoot, 'ZP2')).sort();
  assert.deepEqual(names, ['2 English certificate - 1 of 2 IELTS result.pdf', '2 English certificate - 2 of 2 photo.jpg']);
  assert.equal(f.fileName, names[0]);
  assert.equal(f.kind, 'pdf');
  assert.match(f.warning ?? '', /ZIP with 2 files/);
});

test('ZIP with nothing usable, or a Word file, is refused with words', () => {
  settings.filesRoot = mkdtempSync(join(tmpdir(), 'zip3-'));
  assert.throws(() => saveDoc('ZP3', 'english', Buffer.from('PK\u0005\u0006' + '\u0000'.repeat(18), 'latin1')), /no PDF, JPG or PNG/);
  assert.throws(() => saveDoc('ZP3', 'english', Buffer.from('<html>no</html>')), /not a PDF or a picture/);
});

test('step 3 runs step 4 again by itself only when it needs the Student ID and step 4 is not working', () => {
  const base: any = { runId: 7, siteData: {}, form: { resultIdByStaff: false, resultStudentId: '' }, busy: {} };
  assert.equal(needsStepFourAgain(base, 7, false), true);
  assert.equal(needsStepFourAgain(base, 7, true), false, 'only once');
  assert.equal(needsStepFourAgain({ ...base, busy: { '7:step4': true } }, 7, false), false, 'step 4 is still working');
  assert.equal(needsStepFourAgain({ ...base, siteData: { fileRow: { studentId: 'S1' } } }, 7, false), false, 'already found');
  assert.equal(needsStepFourAgain({ ...base, form: { ...base.form, resultStudentId: 'S1' } }, 7, false), false, 'already filled');
  assert.equal(needsStepFourAgain({ ...base, form: { ...base.form, resultIdByStaff: true } }, 7, false), false, 'typed by the staff');
  assert.equal(needsStepFourAgain({ ...base, runId: 8 }, 7, false), false, 'another student now');
});
