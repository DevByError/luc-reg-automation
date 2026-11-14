import fs from 'node:fs';
import path from 'node:path';

/**
 * A short local log of what the tool did, for fixing problems. It records operation names,
 * timings and errors only: never values typed into the site, never documents.
 */
let dir = '';

export function setLogDir(root: string) {
  dir = path.join(root, 'logs');
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
}

export function log(line: string) {
  const { day, time } = stamp();
  const text = `${time} ${line}`;
  console.log(`[portal] ${text}`);
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${day}.log`), text + '\n');
  } catch {
    // Logging must never stop the work.
  }
}
