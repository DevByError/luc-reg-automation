/**
 * Practice-site test for stage 0 (A/c Mini Statement): passport → View → reason → popup → report → PDF in the student's folder.
 * Run: node scripts/run-practice.mjs step0 [asked|nopopup|noreason|other|late]
 *   asked    the site asks for a reason and shows "Reason submitted Successfully" in a popup (as in your photos)
 *   nopopup  the site asks for a reason but shows no popup
 *   noreason the site doesn't ask for a reason at all
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const mode = process.argv[3] || 'asked';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-practice-'));
const filesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-students-'));
const PASS = 'AB1234567';

const PAGE = `<!doctype html><html><head><title>A/c Mini Statement</title></head><body>
<h1>A/c Mini Statement</h1>
<label>Student Id/PassportIC :</label><br><input id="txtid" type="text"> <input type="button" id="view" value="View">
<div id="card"></div><div id="report"></div>
<script>
const MODE = ${JSON.stringify(mode)};
window.Sys = { Application: { getComponents: () => [{ _exportUrlBase: '/Reserved.ReportViewerWebControl.axd?OpType=Export&Format=' }] } };
function showReport() {
  const who = MODE === 'other' ? 'ZZ9999999' : document.getElementById('txtid').value;
  setTimeout(() => { document.getElementById('report').innerHTML = '<div>Mini Statement Of Fees</div>'; }, 1200);
  setTimeout(() => { document.getElementById('report').innerHTML += '<div>Passport/Ic : ' + who + '</div>'; }, MODE === 'late' ? 5000 : 1200);
}
document.getElementById('view').onclick = () => {
  if (MODE === 'noreason') { showReport(); return; }
  document.getElementById('card').innerHTML = '<div><b>Please state your reason for Access:</b><br><textarea id="why"></textarea><br><input type="button" id="sub" value="Submit Reason"></div>';
  document.getElementById('sub').onclick = () => {
    if (!document.getElementById('why').value.trim()) return;
    if (MODE === 'asked' || MODE === 'other' || MODE === 'late') alert('Reason submitted Successfully');
    document.getElementById('card').innerHTML = '';
    showReport();
  };
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname.toLowerCase() === '/mininew/rpt_printministatement.aspx') {
    res.setHeader('content-type', 'text/html');
    return res.end(PAGE);
  }
  if (url.pathname === '/Reserved.ReportViewerWebControl.axd') {
    res.setHeader('content-type', 'application/pdf');
    return res.end('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
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
const s0 = await import('../../server/steps/step0');
settings.filesRoot = filesRoot;
await ensureBrowser();

let failed = '';
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${what}`);
  if (!ok) failed += what + '; ';
};
try {
  const t0 = Date.now();
  await s0.open();
  const v = await s0.view({ passport: PASS });
  check(v.reasonAsked === (mode !== 'noreason'), `View: reason asked = ${v.reasonAsked}`);
  if (v.reasonAsked) {
    const said = await s0.reason({ reason: 'Registration' });
    check(mode !== 'nopopup' && mode !== 'noreason' ? /Reason submitted Successfully/i.test(said) : /Reason submitted/.test(said), `Submit Reason: ${said}`);
  } else {
    check((await s0.reason({ reason: 'Registration' })).includes('did not ask'), 'no reason box: nothing pressed, no stop');
  }
  const f = await s0.pdf({ passport: PASS });
  check(mode === 'other' ? /ZZ9999999/.test(f.warning ?? '') : !f.warning, `warning: ${f.warning ? f.warning : 'none'}`);
  const file = path.join(filesRoot, PASS, f.fileName ?? '');
  check(/^0 Mini statement.*\.pdf$/.test(f.fileName ?? '') && fs.existsSync(file) && fs.readFileSync(file).subarray(0, 4).toString() === '%PDF', `PDF saved in the student folder as "${f.fileName}" (${Date.now() - t0} ms)`);
} catch (e) {
  check(false, `unexpected stop: ${(e as Error).message}`);
}
await closeBrowser();
server.closeAllConnections?.();
server.close();
console.log(failed ? `FAILED: ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
