/**
 * Practice-site test for the "keeps loading after Final Submit" bug. Run: node scripts/run-practice.mjs
 * A local page behaves like LOS: Payment Plan with a Final Submit button; after it, the page shows many sections in
 * frames, one of them never goes quiet (a request that keeps being renewed), and one is "Verify / Upload English Result".
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const mode = process.argv[2] || 'busy';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-practice-'));
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  const html = (b: string) => { res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><html><body>${b}</body></html>`); };
  if (url.pathname === '/admin_stf/stdnew.aspx') {
    return html(`<ul class="nav-tabs"><li class="active"><a>Payment Plan</a></li></ul>
      <input type="submit" value="Final Submit" onclick="${mode === 'alert' ? "alert('Please fill Country 12345'); return false;" : ''} document.body.innerHTML = document.getElementById('after').innerHTML; return false;">
      <template id="after">
        <h2>Receive 1</h2><iframe src="/sec/receive" width="900" height="200"></iframe>
        <h2>Other</h2><iframe src="${mode === 'alert' ? '/sec/busy' : '/sec/busy'}" width="900" height="200"></iframe>
        ${mode === 'alert' ? '' : '<iframe src="/sec/english" width="900" height="400"></iframe>'}</template>`);
  }
  if (url.pathname.toLowerCase() === '/admin_stf/verify_eng_res.aspx') {
    return html('<h1>Verify / Upload English Result</h1><label>Student ID:</label><input id="txtsid" type="text"><input type="button" value="View">');
  }
  if (url.pathname === '/sec/receive') return html('<h3>Receive 1</h3><label>Passport / Student ID:</label> <input id="txtid"><input type="submit" value="Submit">');
  if (url.pathname === '/sec/busy') {
    // Never quiet: a request goes out every 20 seconds and a "Loading" box stays on screen.
    return html(`<div>Loading</div><script>(function r(){ fetch('/slow?'+Date.now()).finally(()=>setTimeout(r,100)); })();</script>`);
  }
  if (url.pathname === '/slow') { setTimeout(() => res.end('x'), 20000); return; }
  if (url.pathname === '/sec/english') {
    return html(`<h3>Verify / Upload English Result</h3><a>Upload Student English Result</a><br>
      <label for="txtsid">Student ID</label> <input id="txtsid" type="text"> <input type="button" value="View">`);
  }
  res.statusCode = 404; res.end();
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as any).port;
process.env.PORTAL_SITE_URL = `http://127.0.0.1:${port}`;
process.env.PORTAL_BROWSER_PROFILE = profile;
process.env.PORTAL_HEADLESS = '1';
if (process.env.PORTAL_BROWSER_PATH === undefined) delete process.env.PORTAL_BROWSER_PATH;

const { lanePage, closeBrowser } = await import('../../server/browser');
const s3 = await import('../../server/steps/step3');
const page = await lanePage('step2');
await page.goto(`http://127.0.0.1:${port}/admin_stf/stdnew.aspx`);
const t0 = Date.now();
let outcome = '';
try {
  const r = await s3.finalSubmit();
  outcome = `finalSubmit returned ${JSON.stringify(r)} after ${Date.now() - t0} ms`;
} catch (e) {
  outcome = `finalSubmit threw "${(e as Error).message}" after ${Date.now() - t0} ms`;
}
console.log(outcome);
if (mode !== 'alert') {
  const sr = await import('../../server/steps/result');
  const t1 = Date.now();
  const v = await sr.find({ passport: 'AB1234567' });
  console.log(`English result page opened by its address while the Admission Form never goes quiet: state=${v.state} in ${Date.now() - t1} ms`);
  if (v.state !== 'empty') process.exitCode = 1;
}
// Control: the old way (wait for the whole page to go quiet) on the same page.
{
  const { settle } = await import('../../server/browser');
  await page.goto(`http://127.0.0.1:${port}/admin_stf/stdnew.aspx`);
  await page.evaluate(() => (document.querySelector('input[type=submit]') as HTMLElement).click());
  try { await settle(page, 8000); console.log('control: old wait finished (no reproduction)'); } catch (e) { console.log(`control: old wait fails as in your screenshot -> "${(e as Error).message}"`); }
}
await closeBrowser();
server.closeAllConnections?.();
server.close();
process.exit(outcome.startsWith('finalSubmit returned') || mode === 'alert' && Date.now() - t0 < 30000 ? 0 : 1);
