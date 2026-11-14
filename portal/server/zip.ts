/**
 * A small ZIP reader (no extra package, so nothing more to install on the office computers).
 * Reads stored and deflated files. Passwords, ZIP64 and the like are refused with a plain message.
 */
import zlib from 'node:zlib';
import { SiteStop } from './errors';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const MAX_FILES = 300;
const MAX_TOTAL = 80 * 1024 * 1024;

export function readZip(buf: Buffer): ZipEntry[] {
  // The end-of-archive record is within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SiteStop("The ZIP can't be read", "The file starts like a ZIP but its list of files is missing, so the tool can't open it. Open it from the site and save the right file by hand.");
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || pos === 0xffffffff) throw new SiteStop('The ZIP is too big for the tool', 'Open it from the site and save the right file by hand.');
  if (count > MAX_FILES) throw new SiteStop('The ZIP has too many files', `The ZIP holds ${count} files. Open it from the site and save the right file by hand.`);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new SiteStop("The ZIP can't be read", "The ZIP's list of files is damaged. Open it from the site and save the right file by hand.");
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const comp = buf.readUInt32LE(pos + 20);
    const size = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const local = buf.readUInt32LE(pos + 42);
    const utf8 = (flags & 0x800) !== 0;
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString(utf8 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    pos += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // a folder
    if (flags & 1) throw new SiteStop('The ZIP has a password', 'The tool cannot open a ZIP that needs a password. Open it from the site and save the right file by hand.');
    total += size;
    if (total > MAX_TOTAL) throw new SiteStop('The ZIP is too big', 'The files inside are very large. Open it from the site and save the right file by hand.');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new SiteStop("The ZIP can't be read", 'A file inside the ZIP is damaged. Open it from the site and save the right file by hand.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + comp);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) + 1024 });
      } catch {
        throw new SiteStop("The ZIP can't be read", 'A file inside the ZIP is damaged. Open it from the site and save the right file by hand.');
      }
    } else throw new SiteStop("The ZIP can't be read", 'The ZIP uses a packing the tool does not know. Open it from the site and save the right file by hand.');
    out.push({ name, data });
  }
  return out;
}
