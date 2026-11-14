import { CheckCircle2, Clock3, ExternalLink, FileText, FolderOpen, Printer, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatElapsed } from '../lib/format';
import { printFile } from '../lib/print';
import { useNow } from '../lib/useNow';
import { retry, retryForDoc } from '../state/actions';
import { busyKeyFor } from '../state/runner';
import { DOC_INFO, app, selectStep, showDoc, toast, useApp } from '../state/store';
import { DOC_KEYS, OPTIONAL_DOCS } from '../state/types';
import type { AppState, DocKey, DocState, StepId } from '../state/types';
import { SLOW_AFTER } from './ActivityList';
import { Button, Spinner, cx } from './ui';

/** The step whose work brings each document (the VAL letter comes from step 4's documents tab). */
const PRODUCER: Record<DocKey, StepId> = {
  miniStatement: 0,
  registration: 1,
  english: 2,
  englishResult: 3,
  profile: 4,
  studentType: 4,
  val: 4,
  holding: 5,
  stamp: 6,
};

/** True while the tool is on its way to a document that hasn't started downloading yet. */
const WORKING_FOR: Record<DocKey, (s: AppState) => boolean> = {
  miniStatement: (s) => s.steps[0].status === 'working',
  registration: (s) => s.steps[1].status === 'working',
  english: (s) => !!s.form.lucSaved && s.steps[2].status !== 'error',
  englishResult: () => false,
  profile: (s) => s.steps[4].status === 'working',
  studentType: (s) => s.steps[4].status === 'working',
  val: (s) => !!s.busy[busyKeyFor(s.runId, 'val')],
  holding: (s) => !!s.saves.collection && s.steps[5].status !== 'error',
  stamp: () => false,
};

function TabIcon({ doc }: { doc: DocState }) {
  if (doc.status === 'loading') return <Spinner className="h-3.5 w-3.5 text-blue-600" />;
  if (doc.status === 'ready') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (doc.status === 'error') return <XCircle className="h-3.5 w-3.5 text-red-600" />;
  return <Clock3 className="h-3.5 w-3.5 text-slate-500" />;
}

/** Prints one document through the browser's print window. The button can't be pressed twice. */
export function PrintButton({ docKey, size = 'sm', variant = 'outline' }: { docKey: DocKey; size?: 'sm' | 'md'; variant?: 'outline' | 'primary' }) {
  const doc = useApp((s) => s.docs[docKey]);
  const [busy, setBusy] = useState(false);
  const ready = doc.status === 'ready' && !!doc.url;
  return (
    <Button
      variant={variant}
      size={size}
      icon={<Printer className="h-3.5 w-3.5" />}
      loading={busy}
      loadingText="Opening print…"
      disabled={!ready}
      onClick={async () => {
        if (!doc.url || !doc.kind) return;
        setBusy(true);
        try {
          await printFile(doc.url, doc.kind);
        } catch {
          toast("Couldn't open the print window. Open the file and print it from there.", 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      Print
    </Button>
  );
}

function Viewer({ docKey, doc, page }: { docKey: DocKey; doc: DocState; page: number }) {
  const now = useNow(doc.status === 'loading');
  const retryKey = retryForDoc[docKey];
  const retryBusy = useApp((s) => (retryKey ? !!s.busy[busyKeyFor(s.runId, retryKey)] : false));
  const info = DOC_INFO[docKey];
  const stepWorking = useApp((s) => WORKING_FOR[docKey](s));
  const producer = PRODUCER[docKey];
  const producerStopped = useApp((s) => s.steps[producer].status === 'error');

  if (doc.url && (doc.status === 'ready' || doc.status === 'loading')) {
    return (
      <div className="relative flex h-full flex-col">
        {doc.status === 'loading' && (
          <div className="flex items-center gap-2 border-b border-blue-300 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-900">
            <Spinner className="h-3.5 w-3.5" /> {docKey === 'english' || docKey === 'englishResult' ? "Saving it in the student's folder…" : 'Uploading to the site…'}{' '}
            {doc.startedAt ? formatElapsed(now - doc.startedAt) : ''}
          </div>
        )}
        {doc.kind === 'image' ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-200 p-4">
            <img src={doc.url} alt={info.title} className="max-h-full max-w-full border border-slate-300 bg-white object-contain" />
          </div>
        ) : (
          <iframe
            key={`${doc.url}#${page}`}
            src={`${doc.url}#page=${page}&navpanes=0&view=FitH`}
            title={info.title}
            className="min-h-0 w-full flex-1 bg-white"
          />
        )}
      </div>
    );
  }

  if (doc.status === 'loading') {
    const elapsed = doc.startedAt ? now - doc.startedAt : 0;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Spinner className="h-8 w-8 text-blue-600" />
        <div className="text-sm font-semibold text-slate-800">Downloading from the site…</div>
        <div className="text-xs tabular-nums text-slate-600">{formatElapsed(elapsed)}</div>
        {elapsed > SLOW_AFTER && (
          <p className="max-w-xs text-xs font-semibold text-amber-800">The site is slow. The tool keeps waiting; nothing is lost.</p>
        )}
      </div>
    );
  }

  if (doc.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <XCircle className="h-8 w-8 text-red-600" />
        <div className="text-sm font-semibold text-slate-900">{info.title} didn't arrive</div>
        <p className="max-w-sm text-xs leading-relaxed text-slate-700">{doc.note}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {retryKey && (
            <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={retryBusy} loadingText="Trying…" onClick={() => retry(retryKey)}>
              Try again
            </Button>
          )}
          {docKey === 'english' && (
            <Button size="sm" variant="outline" onClick={() => selectStep(2)}>
              Choose or add it in step 2
            </Button>
          )}
          {docKey === 'englishResult' && (
            <Button size="sm" variant="outline" onClick={() => selectStep(3)}>
              Choose it again in step 3
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (producerStopped && doc.status === 'waiting') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <XCircle className="h-8 w-8 text-red-600" />
        <div className="text-sm font-semibold text-slate-900">Step {producer} stopped before this document</div>
        <p className="max-w-xs text-xs leading-relaxed text-slate-600">See the message in step {producer}. This document comes once it carries on.</p>
        <Button size="sm" variant="outline" onClick={() => selectStep(producer)}>
          Go to step {producer}
        </Button>
      </div>
    );
  }

  if (stepWorking) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Spinner className="h-7 w-7 text-blue-600" />
        <div className="text-sm font-semibold text-slate-800">The tool is on its way to this document…</div>
        <p className="max-w-xs text-xs leading-relaxed text-slate-600">{info.waitingNote}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <FileText className="h-9 w-9 text-slate-400" />
      <div className="text-sm font-semibold text-slate-700">Not here yet</div>
      <p className="max-w-xs text-xs leading-relaxed text-slate-600">{info.waitingNote}</p>
    </div>
  );
}

/** Documents on the left: one tab per file, shown in the browser's own PDF viewer so text can be copied. */
export function DocumentPanel() {
  const docs = useApp((s) => s.docs);
  const active = useApp((s) => s.activeDoc);
  const page = useApp((s) => s.docPage);
  const folder = useApp((s) => s.student?.folder ?? '');
  const doc = docs[active];
  const ready = doc.status === 'ready' && !!doc.url;
  // A document that only some students have (another file for the English result) has a tab only when it's there.
  const keys = DOC_KEYS.filter((k) => !OPTIONAL_DOCS.includes(k) || docs[k].status !== 'waiting' || k === active);
  const readyCount = keys.filter((k) => docs[k].status === 'ready').length;
  const strip = useRef<HTMLDivElement>(null);

  // Keep the open document's tab in sight when the tool switches to it.
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < el.scrollLeft) el.scrollTo({ left: Math.max(0, start - 8), behavior: 'smooth' });
    else if (end > el.scrollLeft + el.clientWidth) el.scrollTo({ left: end - el.clientWidth + 8, behavior: 'smooth' });
  }, [active]);

  return (
    <section className="card flex h-full min-h-[560px] flex-col overflow-hidden" aria-label="Documents">
      <div className="border-b border-slate-300 bg-slate-50 px-4 pt-2.5 sm:px-5">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Documents</h2>
          <span className="shrink-0 text-xs text-slate-600">
            {readyCount} of {keys.length} saved
          </span>
        </div>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-mono" title={folder}>
            {folder}
          </span>
        </p>
        <div ref={strip} className="scroll-thin relative -mx-1 -mb-px mt-1.5 flex overflow-x-auto" role="tablist" aria-label="Documents">
          {keys.map((key) => {
            const d = docs[key];
            const isActive = key === active;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => showDoc(key, 1, false)}
                className={cx(
                  'inline-flex shrink-0 items-center gap-1.5 border-b-[3px] px-2.5 pb-2 pt-1.5 text-[13px] font-semibold transition-colors',
                  isActive ? 'border-blue-600 text-slate-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                )}
              >
                <TabIcon doc={d} />
                <span className="tabular-nums text-slate-500">{DOC_INFO[key].step}</span>
                {DOC_INFO[key].tab}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 px-4 py-2 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{DOC_INFO[active].title}</div>
          <div className="truncate text-xs text-slate-600">
            {ready && doc.fileName ? (
              <>
                Saved as <span className="font-mono text-slate-800">{doc.fileName}</span>
              </>
            ) : doc.status === 'loading' ? (
              'On its way…'
            ) : (
              'Not saved yet'
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {active === 'registration' && ready && (
            <div className="mr-1 flex overflow-hidden rounded-sm border border-slate-400" role="group" aria-label="Page">
              {[1, 2].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => app.set((s) => ({ ...s, docPage: p }))}
                  aria-pressed={page === p}
                  className={cx(
                    'h-[26px] px-2.5 text-xs font-semibold',
                    p > 1 && 'border-l border-slate-400',
                    page === p ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100',
                  )}
                >
                  Page {p}
                </button>
              ))}
            </div>
          )}
          <PrintButton docKey={active} />
          <a
            href={ready ? doc.url : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!ready}
            className={cx(
              'inline-flex h-7 w-7 items-center justify-center rounded-sm border border-slate-400 bg-white text-slate-700',
              ready ? 'hover:bg-slate-100' : 'pointer-events-none opacity-40',
            )}
            title="Open in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-slate-100">
        <Viewer docKey={active} doc={doc} page={page} />
      </div>
    </section>
  );
}
