import { CheckCircle2, ChevronDown, Circle, Clock3, PauseCircle, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { formatDuration, formatElapsed } from '../lib/format';
import { useNow } from '../lib/useNow';
import { useApp } from '../state/store';
import type { Activity, StepId } from '../state/types';
import { Spinner, cx } from './ui';

/** After this long, a running line says the site is slow. */
export const SLOW_AFTER = 8000;

function LineIcon({ state }: { state: Activity['state'] }) {
  switch (state) {
    case 'running':
      return <Spinner className="h-4 w-4 text-blue-600" />;
    case 'retrying':
      return <RefreshCw className="h-4 w-4 text-amber-700" />;
    case 'paused':
      return <PauseCircle className="h-4 w-4 text-amber-700" />;
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'waiting':
      return <Clock3 className="h-4 w-4 text-slate-500" />;
    default:
      return <Circle className="h-4 w-4 text-slate-400" />;
  }
}

export function ActivityLine({ a, now }: { a: Activity; now: number }) {
  const elapsed = a.startedAt ? (a.endedAt ?? now) - a.startedAt : 0;
  const slow = a.state === 'running' && elapsed > SLOW_AFTER;
  let right = '';
  if (a.state === 'running' && a.startedAt) right = formatElapsed(elapsed);
  else if (a.state === 'retrying' && a.retryAt) right = `next try in ${Math.max(0, Math.ceil((a.retryAt - now) / 1000))}s`;
  else if (a.state === 'done' && a.startedAt && a.endedAt && a.endedAt > a.startedAt) right = formatDuration(elapsed);

  return (
    <li className="flex gap-2.5 py-1.5">
      <span className="mt-0.5">
        <LineIcon state={a.state} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cx(
              'min-w-0 break-words text-[13px] leading-snug',
              a.state === 'waiting' ? 'text-slate-600' : 'text-slate-900',
              (a.state === 'running' || a.state === 'retrying' || a.state === 'paused') && 'font-semibold',
              a.state === 'error' && 'font-semibold text-red-700',
            )}
          >
            {a.label}
          </span>
          {right && (
            <span className={cx('shrink-0 text-[11px] tabular-nums', a.state === 'retrying' || slow ? 'font-semibold text-amber-800' : 'text-slate-500')}>
              {right}
            </span>
          )}
        </div>
        {(a.detail || slow) && (
          <p className={cx('mt-0.5 break-words text-xs leading-snug', a.state === 'error' ? 'text-red-700' : a.state === 'retrying' || a.state === 'paused' || slow ? 'text-amber-800' : 'text-slate-600')}>
            {slow ? 'The site is slow. Still waiting; nothing is lost.' : a.detail}
          </p>
        )}
      </div>
    </li>
  );
}

/** "What the tool is doing" for one step. Opens by itself while the tool works or when it stops. */
export function ActivityBox({ step }: { step: StepId }) {
  const st = useApp((s) => s.steps[step]);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const list = st.activities;
  const active = list.filter((a) => a.state === 'running' || a.state === 'retrying' || a.state === 'paused');
  const now = useNow(active.length > 0);
  if (list.length === 0) return null;

  const autoOpen = st.status === 'working' || st.status === 'error';
  const open = userOpen ?? autoOpen;
  const doneCount = list.filter((a) => a.state === 'done').length;
  const waiting = list.filter((a) => a.state === 'waiting');
  const shown = open ? list : active.length > 0 ? active.slice(-2) : waiting.slice(-1);

  let summary: string;
  if (active.length > 0) summary = `${active.length === 1 ? 'Working on 1 thing' : `Working on ${active.length} things`} · ${doneCount} done`;
  else if (st.status === 'error') summary = 'Stopped. See the message above.';
  else summary = `${doneCount} action${doneCount === 1 ? '' : 's'} done${waiting.length ? ` · ${waiting.length} waiting` : ''}`;

  return (
    <div className="rounded-sm border border-slate-300 bg-white">
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        className="flex w-full items-center justify-between gap-3 bg-slate-50 px-3.5 py-2 text-left hover:bg-slate-100"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {active.length > 0 ? <Spinner className="h-3.5 w-3.5 text-blue-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />}
          <span className="text-[13px] font-semibold text-slate-800">What the tool is doing</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
          <span className="hidden sm:inline">{summary}</span>
          <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {shown.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-300 px-3.5" aria-live="polite">
          {shown.map((a) => (
            <ActivityLine key={a.id} a={a} now={now} />
          ))}
          {!open && list.length > shown.length && (
            <li className="py-1.5 text-xs">
              <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => setUserOpen(true)}>
                Show all {list.length} lines
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
