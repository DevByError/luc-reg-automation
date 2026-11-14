/**
 * The student folders on this computer: one folder per student, named by the passport number.
 * File names start with the step number, and nothing is ever overwritten.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { DocFile, DocKey, FolderListing } from '../shared/ops';
import { DOC_BASES } from '../shared/ops';
import { savedFileName } from '../src/lib/files';
import { SiteStop } from './errors';
import { log } from './log';
import { readZip } from './zip';

export const settings = {
  filesRoot: process.platform === 'win32' ? 'E:\\Registration system\\students' : path.join(process.cwd(), 'students'),
  accessReason: 'Registration',
};

export function updateSettings(next: { filesRoot?: string; accessReason?: string }) {
  if (next.filesRoot && path.isAbsolute(next.filesRoot)) settings.filesRoot = next.filesRoot;
  if (next.accessReason && next.accessReason.trim()) settings.accessReason = next.accessReason.trim().slice(0, 200);
}

const safePassport = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function studentDir(passport: string): string {
  const p = safePassport(passport);
  if (!p) throw new SiteStop('No passport', 'The tool needs the passport number to know which folder to use.');
  return path.join(settings.filesRoot, p);
}

export function fileUrl(passport: string, name: string): string {
  return `/api/file?passport=${encodeURIComponent(safePassport(passport))}&name=${encodeURIComponent(name)}`;
}

/** What a file really is, from its first bytes (not its name). */
export function sniff(bytes: Buffer): 'pdf' | 'png' | 'jpg' | 'gif' | 'zip' | 'html' | 'other' {
  const head = bytes.subarray(0, 8);
  if (head.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG') return 'png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpg';
  if (head.subarray(0, 3).toString('latin1') === 'GIF') return 'gif';
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  const start = bytes.subarray(0, 512).toString('latin1').toLowerCase();
  if (/<(!doctype|html|head|body|script)/.test(start)) return 'html';
  return 'other';
}

/** Writes bytes into the student's folder under a name that starts with `base`, never over an existing file. Returns the name. */
function writeDoc(passport: string, base: string, ext: string, bytes: Buffer): string {
  const dir = studentDir(passport);
  fs.mkdirSync(dir, { recursive: true });
  const taken = fs.readdirSync(dir);
  const first = savedFileName(base, ext, taken);
  let name = first;
  // Never over an existing file. Two files in the same second (or a name differing only in capitals,
  // which Windows counts as the same) get the next free number.
  for (let n = 2; ; n += 1) {
    try {
      fs.writeFileSync(path.join(dir, name), bytes, { flag: 'wx' });
      return name;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || n > 99) throw e;
      name = first.replace(/(\.[A-Za-z0-9]+)$/, ` (${n})$1`);
    }
  }
}

const shown = (bytes: Buffer): DocFile['kind'] => (sniff(bytes) === 'pdf' ? 'pdf' : 'image');

/**
 * A ZIP the site sent (students sometimes upload a folder of files): the PDFs and pictures inside are taken out.
 * One file inside: saved like any document. Several: all are saved, the first (a PDF first) is the one shown and used,
 * and the staff is told, so the right one can be chosen.
 */
function saveFromZip(passport: string, key: DocKey, bytes: Buffer): DocFile {
  const entries = readZip(bytes);
  if (entries.some((e) => e.name === '[Content_Types].xml')) {
    throw new SiteStop(
      "The file didn't come through",
      'The site sent an Office file (Word, Excel) instead of a PDF or picture. Nothing was saved. Open it from the site and save a PDF or picture by hand.',
    );
  }
  const usable = entries
    .filter((e) => !/(^|\/)(__MACOSX\/|\.|Thumbs\.db$)/i.test(e.name) && ['pdf', 'png', 'jpg'].includes(sniff(e.data)))
    .sort((a, b) => Number(sniff(b.data) === 'pdf') - Number(sniff(a.data) === 'pdf') || a.name.localeCompare(b.name));
  if (usable.length === 0) {
    const names = entries.slice(0, 5).map((e) => e.name.split('/').pop());
    throw new SiteStop(
      'The ZIP has no PDF or picture',
      `The ZIP the site sent holds ${entries.length ? names.join(', ') + (entries.length > 5 ? ' and more' : '') : 'nothing'}, and no PDF, JPG or PNG. Nothing was saved. Open it from the site and save the right file by hand.`,
    );
  }
  const base = DOC_BASES[key];
  if (usable.length === 1) {
    const only = usable[0];
    const ext = sniff(only.data);
    const name = writeDoc(passport, base, ext, only.data);
    log(`saved: step ${base.slice(0, 1)} document, taken out of a ZIP (${ext}, ${Math.round(only.data.length / 1024)} KB)`);
    return { url: fileUrl(passport, name), kind: shown(only.data), fileName: name };
  }
  const saved = usable.map((e, i) => {
    const ext = sniff(e.data);
    const label = (e.name.split('/').pop() ?? '').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9 ._-]/g, '').trim().slice(0, 40);
    const name = writeDoc(passport, `${base} - ${i + 1} of ${usable.length}${label ? ` ${label}` : ''}`, ext, e.data);
    return { name, bytes: e.data };
  });
  log(`saved: step ${base.slice(0, 1)} documents, ${saved.length} files taken out of a ZIP`);
  const first = saved[0];
  return {
    url: fileUrl(passport, first.name),
    kind: shown(first.bytes),
    fileName: first.name,
    warning: `The site sent a ZIP with ${saved.length} files. All of them are saved in the student's folder (${saved.map((f) => `"${f.name}"`).join(', ')}). The first one is shown and used. If the right one is another, add it yourself from the student's folder.`,
  };
}

/** Saves a document into the student's folder and returns how the portal shows it. A ZIP is opened (see saveFromZip). */
export function saveDoc(passport: string, key: DocKey, bytes: Buffer): DocFile {
  const type = sniff(bytes);
  if (type === 'zip') return saveFromZip(passport, key, bytes);
  if (type === 'html' || type === 'other') {
    throw new SiteStop(
      "The file didn't come through",
      'The site sent something that is not a PDF or a picture. Nothing was saved. Try again, or download it by hand from the site.',
    );
  }
  const ext = type;
  const name = writeDoc(passport, DOC_BASES[key], ext, bytes);
  log(`saved: step ${DOC_BASES[key].slice(0, 1)} document (${ext}, ${Math.round(bytes.length / 1024)} KB)`);
  return { url: fileUrl(passport, name), kind: type === 'pdf' ? 'pdf' : 'image', fileName: name };
}

export function docPath(passport: string, name: string): string {
  const base = path.basename(name);
  if (!base || base !== name) throw new SiteStop('Wrong file name', 'The file name is not allowed.');
  const full = path.join(studentDir(passport), base);
  if (!fs.existsSync(full)) throw new SiteStop('File missing', `"${base}" is not in the student's folder any more. Add it again.`);
  return full;
}

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

/** A file from a student's folder, for the portal's viewer. Only files inside the students folder. */
export function readForViewer(passport: string, name: string): { body: Buffer; type: string } | null {
  try {
    const full = docPath(passport, name);
    const root = path.resolve(settings.filesRoot) + path.sep;
    if (!path.resolve(full).startsWith(root)) return null;
    const ext = path.extname(full).slice(1).toLowerCase();
    return { body: fs.readFileSync(full), type: TYPES[ext] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}

/** Every student folder whose passport contains `query`, with its files. */
export function listFolders(query: string): FolderListing {
  const q = safePassport(query);
  const root = settings.filesRoot;
  const out: FolderListing = { root, folders: [] };
  if (!q || !fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.toUpperCase().includes(q)) continue;
    const dir = path.join(root, entry.name);
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => {
        const ext = path.extname(f.name).slice(1).toLowerCase();
        const stat = fs.statSync(path.join(dir, f.name));
        const kind: 'pdf' | 'image' | 'other' = ext === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg', 'gif'].includes(ext) ? 'image' : 'other';
        return { name: f.name, step: Number(f.name.match(/^(\d)\s/)?.[1] ?? 0), savedAt: stat.mtimeMs, kind, url: fileUrl(entry.name, f.name) };
      })
      .sort((a, b) => a.step - b.step || a.name.localeCompare(b.name));
    out.folders.push({ passport: entry.name, folder: dir, files });
    if (out.folders.length >= 50) break;
  }
  return out;
}

/** Opens a student's folder in File Explorer. */
export function openFolder(passport: string): string {
  const dir = studentDir(passport);
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
  }
  return dir;
}

/** The staff's own file (the stamp scan, or the English certificate), saved before it goes to the site. */
export function saveUpload(passport: string, key: DocKey, bytes: Buffer): DocFile {
  if (bytes.length === 0) throw new SiteStop('The file is empty', 'The file has nothing in it. Choose the scan again.');
  if (bytes.length > 10 * 1024 * 1024) throw new SiteStop('The file is too big', 'The site takes files up to 10 MB.');
  const type = sniff(bytes);
  if (!['pdf', 'png', 'jpg'].includes(type)) throw new SiteStop('Not a PDF, JPG or PNG', 'The site takes PDF, JPG or PNG files only.');
  return saveDoc(passport, key, bytes);
}
