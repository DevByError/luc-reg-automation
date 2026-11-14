import { pad2 } from './format';

/** Joins a Windows folder and a name with one backslash. */
export function joinPath(folder: string, name: string): string {
  return `${folder.replace(/[\\/]+$/, '')}\\${name}`;
}

/** Folder for one student: <files folder>\<PASSPORT>. */
export function studentFolder(root: string, passport: string): string {
  return joinPath(root, passport.replace(/[<>:"/\\|?*]/g, ''));
}

/**
 * Name for a saved file. Starts with the step number, never overwrites:
 * a second copy gets the date and time added, e.g. "5 VAL letter (2026-10-31 14-05-09).pdf".
 */
export function savedFileName(base: string, ext: string, taken: string[], now = new Date()): string {
  const plain = `${base}.${ext}`;
  if (!taken.includes(plain)) return plain;
  const stamp =
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ` +
    `${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
  return `${base} (${stamp}).${ext}`;
}

export function extensionOf(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}
