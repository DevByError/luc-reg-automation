/**
 * Test page (console) for the English result FILE BOX. Opens LOS's Verify / Upload English Result page, does View,
 * picks a Test Name, then lists every file box on the page and checks that the tool finds the one it uses.
 * Nothing is uploaded. Run: test-english-file.bat
 */
import readline from 'node:readline/promises';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBrowser, showLoginTab, closeBrowser, checkLogin, existingPage } from '../../server/browser';
import { setLogDir } from '../../server/log';
import { findField } from '../../server/find';
import * as sr from '../../server/steps/result';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => rl.question(q).then((a) => a.trim());
const lines: string[] = [];
const say = (t = '') => { console.log(t); lines.push(t); };
setLogDir(process.cwd());

try {
  await ensureBrowser();
  await showLoginTab();
  console.log('\nThe site window is open. Log in to LOS there (if not already), then come back here.');
  await ask('Press Enter when you are logged in... ');
  if (!(await checkLogin(true).catch(() => false))) say('WARNING: the site still looks logged out. Going on anyway.');
  const passport = await ask('Passport of the student: ');
  const studentId = await ask('Student ID of the student (from step 4): ');
  say(`\n=== English file box check: passport "${passport}", Student ID "${studentId}" ===`);
  await sr.find({ passport });
  const v = await sr.view({ passport, studentId });
  say(`Test Name list: ${v.testNames.join(', ') || '(EMPTY)'}`);
  const rowPassport = v.rows[0]?.[0] || passport;
  const pickTest = async (name: string) => {
    if (!v.testNames.includes(name)) return;
    await sr.test({ passport: rowPassport, testName: name });
    await dump(name);
  };
  const dump = async (when: string) => {
    const page = existingPage('reupload');
    if (!page) { say('The tool\'s tab is gone.'); return; }
    say(`\n--- File boxes ${when} ---`);
    for (const f of page.frames()) {
      const list = await f.evaluate(() =>
        Array.from(document.querySelectorAll('input[type=file]')).map((e) => {
          const el = e as HTMLInputElement;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const near = (el.closest('div,td,tr,p')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
          return `id="${el.id}" name="${el.name}" accept="${el.accept}" size=${Math.round(r.width)}x${Math.round(r.height)} display=${cs.display} visibility=${cs.visibility} opacity=${cs.opacity} disabled=${el.disabled} near="${near}"`;
        }),
      ).catch(() => []);
      say(`Frame ${f.url()}: ${list.length ? '' : 'no file boxes'}`);
      list.forEach((l) => say('  ' + l));
    }
    for (const [label, opts] of [
      ['by id "*" (what the tool uses now)', { ids: ['*'], hiddenFile: true }],
      ['by the words "English Result" (old way)', {}],
    ] as [string, { ids?: string[]; hiddenFile?: boolean }][]) {
      try {
        const mark = await findField(page, 'English Result', { where: 'Verify / Upload English Result', kinds: ['file'], timeout: 3000, ...opts });
        say(`Tool finds the file box ${label}: YES (${mark})`);
      } catch (e) {
        say(`Tool finds the file box ${label}: NO - ${(e as Error).message}`);
      }
    }
  };
  await dump('after View (no Test Name chosen)');
  await pickTest('IELTS');
  await pickTest('MOI');
  const shot = path.join(process.cwd(), 'logs', `english-file-${Date.now()}.png`);
  const pg = existingPage('reupload');
  if (pg) await pg.screenshot({ path: shot, fullPage: true }).then(() => say(`\nScreenshot: ${shot}`), () => undefined);
  say('\nNothing was uploaded.');
} catch (e) {
  say(`\nSTOPPED: ${(e as Error).message}`);
}
const out = path.join(process.cwd(), 'logs', `english-file-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`);
try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, lines.join('\n')); console.log(`\nThis report is saved in ${out}`); } catch { /* ignore */ }
await ask('\nPress Enter to close the site window... ');
rl.close();
await closeBrowser();
process.exit(0);
