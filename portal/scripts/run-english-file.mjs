import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/tools/english-file-check.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-build/english-file.mjs', logLevel: 'error', external: ['playwright-core', 'node:*'], banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" } });
process.exit(spawnSync(process.execPath, ['.test-build/english-file.mjs'], { stdio: 'inherit' }).status ?? 1);
