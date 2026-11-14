import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/step3.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-build/step3.test.mjs', logLevel: 'error', external: ['node:*'] });
process.exit(spawnSync(process.execPath, ['--test', '.test-build/step3.test.mjs'], { stdio: 'inherit' }).status ?? 1);
