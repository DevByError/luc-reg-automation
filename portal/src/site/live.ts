/**
 * Live mode: the portal asks the tool running on this computer (server/) to work on
 * online.lincoln.edu.my in the site window. Only this computer's portal page can reach it.
 */
import type { DocFile, FolderListing, OpArgs, OpError, OpName, OpResponse, OpResult, StatusResponse } from '../../shared/ops';
import { Cancelled, StopError } from '../state/errors';
import { LoggedOutError, NetworkError } from './errors';

/** Actions that belong to no student. */
const FREE = new Set<OpName>(['session.start', 'login.check', 'popup.answer']);

/** Each page load counts its students from a new number, so the tool never mixes one up with an older one. */
const PAGE_BASE = Math.floor(Date.now() / 1000) * 1000;
const toolRun = (run: number) => PAGE_BASE + run;

const HEADERS = { 'x-portal': '1', 'Content-Type': 'application/json' };

/** The tool says this action did not run, because it is set up for another student. */
class NotThisStudent extends Error {}

function toError(err: OpError): Error {
  switch (err.kind) {
    case 'logged-out':
      return new LoggedOutError();
    case 'network':
      return new NetworkError(err.message);
    case 'stop':
      return new StopError(err.title, err.message, { ...(err.rows?.length ? { rows: err.rows } : {}), ...(err.needs ? { needs: err.needs } : {}) });
    case 'cancelled':
      return new NotThisStudent();
    default:
      return new Error(err.message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, cache: 'no-store' });
  } catch {
    throw new NetworkError("The portal's tool on this computer isn't answering");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new NetworkError("The portal's tool on this computer gave an answer it couldn't read");
  }
  const r = body as { ok?: boolean; error?: OpError };
  if (r && r.ok === false && r.error) throw toError(r.error);
  if (!res.ok) throw new Error(`The portal's tool answered ${res.status}.`);
  return body as T;
}

const get = <T,>(path: string) => request<T>(path, { headers: { 'x-portal': '1' } });
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });

async function op<K extends OpName>(name: K, args: OpArgs<K>, run: number): Promise<OpResult<K>> {
  const r = await post<OpResponse>('/api/op', { op: name, args, run: toolRun(run) });
  return (r as { ok: true; result: unknown }).result as OpResult<K>;
}

/* ------------------------------------------------------------------ student */

let session: { run: number; ready: Promise<void> } | null = null;

/** Tells the tool which student is open before that student's first action. Closes the old student's tabs. */
export function ensureSession(run: number, passport: string): Promise<void> {
  if (session?.run === run) return session.ready;
  const ready = op('session.start', { passport }, run).then(() => undefined);
  const mine = { run, ready };
  session = mine;
  ready.catch(() => {
    if (session === mine) session = null;
  });
  return ready;
}

/**
 * One action on the site for one student. "Did not run" from the tool is safe to ask again, so when
 * the portal is still on that student (the tool was restarted, say), it starts the student again there once.
 */
export async function liveCall<K extends OpName>(run: number, passport: string, name: K, args: OpArgs<K>, stillOpen: () => boolean): Promise<OpResult<K>> {
  for (let attempt = 0; ; attempt++) {
    if (!FREE.has(name)) await ensureSession(run, passport);
    try {
      return await op(name, args, run);
    } catch (e) {
      if (!(e instanceof NotThisStudent)) throw e;
      if (!stillOpen()) throw new Cancelled();
      if (attempt > 0) {
        throw new StopError(
          'The tool lost its place',
          "The portal's tool on this computer was restarted, or another portal window started a student. This action did not run. Press Try again.",
        );
      }
      if (session?.run === run) session = null;
    }
  }
}

/* --------------------------------------------------------- the site window */

/** probe: also ask the site whether the staff is logged in (one light request). */
export const fetchStatus = (probe = true) => get<StatusResponse>(probe ? '/api/status' : '/api/status?probe=0');

/** Opens the site window (Microsoft Edge), or brings it to the front. */
export const openSiteWindow = () => post<StatusResponse>('/api/browser/open', {});

export const sendSettings = (s: { filesRoot: string; accessReason: string }) => post<{ ok: true; filesRoot: string }>('/api/settings', s);

/* ------------------------------------------------------------------- files */

export const listFolders = (query: string) => get<FolderListing>(`/api/folders?q=${encodeURIComponent(query)}`);

/** Opens the student's folder in File Explorer. */
export const openFolder = (passport: string) => post<{ ok: true; folder: string }>('/api/folder/open', { passport }).then((r) => r.folder);

/** Saves a file the staff added (the stamp scan, or an English certificate) in the student's folder, before it goes to the site. */
export async function uploadFile(passport: string, key: 'stamp' | 'english' | 'englishResult', file: File): Promise<DocFile> {
  const r = await request<{ ok: true; result: DocFile }>(`/api/upload?passport=${encodeURIComponent(passport)}&key=${key}`, {
    method: 'POST',
    headers: { 'x-portal': '1', 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  return r.result;
}
