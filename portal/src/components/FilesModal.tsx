import { ExternalLink, FileImage, FileText, FolderOpen, FolderSearch, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FolderListing } from '../../shared/ops';
import { joinPath, studentFolder } from '../lib/files';
import { clockTime, normalizePassport } from '../lib/format';
import { printFile } from '../lib/print';
import { listFolders } from '../site/live';
import { openStudentFolder } from '../state/actions';
import { setUi, useApp } from '../state/store';
import { Modal } from './Modals';
import { Button } from './ui';

interface ShownFile {
  name: string;
  url: string;
  kind: 'pdf' | 'image' | 'other';
  step: number;
  savedAt: number;
}

interface ShownFolder {
  passport: string;
  folder: string;
  files: ShownFile[];
}

function FileRow({ folder, file }: { folder: string; file: ShownFile }) {
  const [printing, setPrinting] = useState(false);
  const printable = file.kind === 'pdf' || file.kind === 'image';
  return (
    <li className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-slate-50 text-slate-600">
          {file.kind === 'image' ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
          <div className="truncate text-xs text-slate-600" title={joinPath(folder, file.name)}>
            {file.step ? `Step ${file.step} · ` : ''}saved at {clockTime(file.savedAt)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {printable && (
          <Button
            variant="outline"
            size="sm"
            loading={printing}
            loadingText="Opening…"
            onClick={async () => {
              setPrinting(true);
              await printFile(file.url, file.kind === 'image' ? 'image' : 'pdf');
              setPrinting(false);
            }}
          >
            Print
          </Button>
        )}
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-slate-400 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
      </div>
    </li>
  );
}

/** Find every file used for a student by searching the passport folders. */
export function FilesModal() {
  const open = useApp((s) => s.ui.filesOpen);
  const initial = useApp((s) => s.ui.filesQuery);
  const savedFiles = useApp((s) => s.savedFiles);
  const settingsRoot = useApp((s) => s.settings.filesRoot);
  const live = useApp((s) => s.settings.mode === 'live');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState('');

  const run = (q: string) => {
    const p = normalizePassport(q);
    if (!p) return;
    setSearching(true);
    setError('');
    if (live) {
      // The real folders on this computer, read by the tool.
      listFolders(p)
        .then((l) => {
          setListing(l);
          setSearched(p);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't read the folders."))
        .finally(() => setSearching(false));
      return;
    }
    window.setTimeout(() => {
      setSearched(p);
      setSearching(false);
    }, 450);
  };

  useEffect(() => {
    if (open) {
      setQuery(initial);
      setSearched(null);
      setListing(null);
      setError('');
      if (initial) run(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => setUi({ filesOpen: false, filesQuery: '' });
  const root = live && listing ? listing.root : settingsRoot;

  const folders: ShownFolder[] = !searched
    ? []
    : live
      ? (listing?.folders ?? [])
      : Object.keys(savedFiles)
          .filter((p) => p.includes(searched))
          .map((passport) => ({
            passport,
            folder: studentFolder(settingsRoot, passport),
            files: [...savedFiles[passport]].sort((a, b) => a.step - b.step || a.name.localeCompare(b.name)),
          }));

  return (
    <Modal open={open} onClose={close} title="Student files" icon={<FolderSearch className="h-5 w-5" />} wide>
      <p>Every document is saved in one folder per student, named by the passport number. Search by passport to find them.</p>
      <form
        className="mt-4 flex"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder="Passport number, or part of it"
          aria-label="Passport number"
          className="input min-w-0 flex-1 rounded-r-none font-semibold placeholder:font-normal"
        />
        <Button type="submit" className="-ml-px rounded-l-none" icon={<Search className="h-4 w-4" />} loading={searching} loadingText="Searching…" disabled={!query.trim()}>
          Search
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-slate-600">
        Folder: <span className="font-mono">{root}</span>
      </p>
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

      {searched && !searching && (
        <div className="mt-4 space-y-4">
          {folders.length === 0 && (
            <div className="rounded-sm border border-dashed border-slate-400 px-4 py-6 text-center text-sm text-slate-600">
              No folder for <b className="text-slate-900">{searched}</b> yet.
            </div>
          )}
          {folders.map((f) => (
            <div key={f.passport} className="overflow-hidden rounded-sm border border-slate-300">
              <div className="flex items-center gap-2 border-b border-slate-300 bg-slate-50 px-3.5 py-2">
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-600" />
                <span className="min-w-0 truncate font-mono text-xs font-semibold text-slate-800" title={f.folder}>
                  {f.folder}
                </span>
                <span className="ml-auto shrink-0 text-xs text-slate-600">
                  {f.files.length} file{f.files.length === 1 ? '' : 's'}
                </span>
                {live && (
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => void openStudentFolder(f.passport)}>
                    Open folder
                  </Button>
                )}
              </div>
              {f.files.length > 0 ? (
                <ul className="divide-y divide-slate-200">
                  {f.files.map((file) => (
                    <FileRow key={file.name} folder={f.folder} file={file} />
                  ))}
                </ul>
              ) : (
                <p className="px-3.5 py-3 text-xs text-slate-600">The folder is empty.</p>
              )}
            </div>
          ))}
          {!live && <p className="text-xs text-slate-600">In sample mode this lists the files from this session only.</p>}
        </div>
      )}
    </Modal>
  );
}
