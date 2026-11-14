import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
// node scripts/run-practice.mjs            -> Final Submit hang test (busy | alert)
// node scripts/run-practice.mjs result ok  -> English result page test (ok | refuse | silent)
// node scripts/run-practice.mjs step0 asked -> Stage 0 mini statement test (asked | nopopup | noreason)
const [first, ...rest] = process.argv.slice(2);
const result = first === 'result';
const step0 = first === 'step0';
const entry = step0 ? 'tests/practice/step0-test.ts' : result ? 'tests/practice/result-test.ts' : 'tests/practice/hang-test.ts';
const args = result || step0 ? [first, ...rest] : first ? [first] : [];
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: '.test-build/practice.mjs', logLevel: 'error', external: ['playwright-core', 'node:*'], banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" } });
process.exit(spawnSync(process.execPath, ['.test-build/practice.mjs', ...args], { stdio: 'inherit' }).status ?? 1);
