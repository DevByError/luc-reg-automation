/**
 * Practice-site test for step 3 after Final Submit: the tool goes straight to /admin_stf/verify_eng_res.aspx in its own
 * tab (no searching on the Admission Form) and does View, Test Name, score/date, certificate and Upload there.
 * The site's popup disappears by itself after 0.7 s, as the real one does.
 * Run: node scripts/run-practice.mjs result [ok|refuse|silent|slowlist]  (slowlist: the Test Name list is drawn 3 s after the student's row)
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const mode = process.argv[3] || 'ok';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-practice-'));
const filesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-students-'));
const PASS = 'AB1234567';
fs.mkdirSync(path.join(filesRoot, PASS), { recursive: true });
fs.writeFileSync(path.join(filesRoot, PASS, 'cert.pdf'), '%PDF-1.4 test');

const PAGE = `<!doctype html><html><head><title>Verify / Upload English Result</title></head><body>
<div id="top"><b>Welcome</b></div>
<h1>Verify / Upload English Result</h1>
<div><a href="#" class="active">Upload Student English Result</a> <a href="#">Verify Student English Result</a></div>
<div id="box"></div>
<script>
const MODE = ${JSON.stringify(mode)};
const box = document.getElementById('box');
function empty() {
  box.innerHTML = '<label>Student ID:</label><br><input id="txtsid" type="text"> <input type="button" id="view" value="View">';
  document.getElementById('view').onclick = () => {
    const id = document.getElementById('txtsid').value.trim();
    if (id !== 'S100') { toast('No record found'); return; }
    student();
  };
}
function toast(t) {
  const d = document.createElement('div');
  d.className = 'swal2-container';
  d.innerHTML = '<div class="swal2-popup"><div class="swal2-title">' + t + '</div><button class="swal2-confirm">OK</button></div>';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 700);
}
function student() {
  box.innerHTML = '<table><tr><th>IC/Passport</th><th>Name</th><th>Programme</th><th>Country</th></tr>' +
    '<tr><td>${PASS}</td><td>TEST STUDENT</td><td>BACHELOR</td><td>Sudan</td></tr></table>' +
    '<div><label>English Result:</label><br><input type="file" id="ContentPlaceHolder1_fileUpload"></div>' +
    '<div id="tnbox"></div><div id="extra"></div><input type="submit" id="up" value="Upload">';
  const tnChange = (e) => {
    document.getElementById('extra').innerHTML = e.target.value === 'IELTS'
      ? '<div><label>Test Score</label><br><input id="sc" type="text"></div><div><label>Result Date</label><br><input id="rd" type="date"></div>' : '';
  };
  const drawList = () => {
    document.getElementById('tnbox').innerHTML = '<div><label>Test Name:</label><br><select id="ContentPlaceHolder1_ddl1" name="ctl00$ContentPlaceHolder1$ddl1"><option>Select Test Name</option><option>MOI</option><option>IELTS</option><option>TOEFL</option></select></div>';
    document.getElementById('ContentPlaceHolder1_ddl1').onchange = tnChange;
  };
  if (MODE === 'slowlist') setTimeout(drawList, 3000); else drawList();
  document.getElementById('up').onclick = (e) => {
    e.preventDefault();
    if (MODE === 'refuse') { toast('Upload failed: file too large'); return; }
    if (MODE !== 'silent') toast('Uploaded successfully');
    setTimeout(empty, 50);
  };
}
empty();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname.toLowerCase() === '/admin_stf/verify_eng_res.aspx') {
    res.setHeader('content-type', 'text/html');
    return res.end(PAGE);
  }
  res.statusCode = 404;
  res.end();
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as any).port;
process.env.PORTAL_SITE_URL = `http://127.0.0.1:${port}`;
process.env.PORTAL_BROWSER_PROFILE = profile;
process.env.PORTAL_HEADLESS = '1';

const { closeBrowser, ensureBrowser } = await import('../../server/browser');
const { settings } = await import('../../server/files');
const sr = await import('../../server/steps/result');
settings.filesRoot = filesRoot;
await ensureBrowser();

let failed = '';
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${what}`);
  if (!ok) failed += what + '; ';
};
try {
  const t0 = Date.now();
  const first = await sr.find({ passport: PASS });
  check(first.state === 'empty' && first.where === 'tab', `page opened by its address, shows the empty Student ID box (${Date.now() - t0} ms)`);

  await sr.view({ passport: PASS, studentId: 'S999' }).then(
    () => check(false, 'wrong Student ID is refused'),
    (e) => check(/No record found/.test(String(e.message ?? e)), `wrong Student ID: the vanishing popup's words are caught ("${String((e as Error).message).slice(0, 80)}")`),
  );

  const v = await sr.view({ passport: PASS, studentId: 'S100', fileName: 'cert.pdf' });
  check(v.state === 'student' && v.samePassport, 'View shows the student, same passport');
  check(v.testNames.join(',') === 'MOI,IELTS,TOEFL', `the Test Name list is in the answer to View: ${v.testNames.join(', ') || '(empty)'}`);
  const t = await sr.test({ passport: PASS, testName: 'IELTS', fileName: 'cert.pdf' });
  check(t.fields.map((f) => f.label).join(',') === 'Test Score,Result Date' && t.fields[1].kind === 'date', 'IELTS shows Test Score + Result Date (date box)');
  const f = await sr.fill({
    passport: PASS,
    fileName: 'cert.pdf',
    testName: 'IELTS',
    values: [
      { key: 'sc', label: 'Test Score', value: '6.5' },
      { key: 'rd', label: 'Result Date', value: '2026-10-01' },
    ],
  });
  const back = Object.fromEntries(f.back);
  check(back['English Result'] === 'cert.pdf' && back['Test Score'] === '6.5' && back['Result Date'] === '2026-10-01', `filled and read back ${JSON.stringify(back)}`);

  if (mode === 'refuse') {
    await sr.upload({ passport: PASS, fileName: 'cert.pdf' }).then(
      () => check(false, 'a refused upload must stop'),
      (e) => check(/didn't take the upload|Upload failed/i.test(String(e.message ?? e)) || /file too large/.test(String(e.message ?? e)), `refused upload stops with the site's words: ${String((e as Error).message).slice(0, 120)}`),
    );
  } else {
    const r = await sr.upload({ passport: PASS, fileName: 'cert.pdf' });
    check(!r.popup, 'Upload done: LOS is back to the empty Student ID box, no second search');
  }
} catch (e) {
  check(false, `unexpected stop: ${(e as Error).message}`);
}
await closeBrowser();
server.closeAllConnections?.();
server.close();
console.log(failed ? `FAILED: ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
