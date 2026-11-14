import { AlertTriangle, Check, Clock3, Pause } from 'lucide-react';
import { STEP_INFO, selectStep, useApp } from '../state/store';
import { STEP_IDS } from '../state/types';
import type { StepId, StepState, StepStatus } from '../state/types';
import { Spinner, cx } from './ui';

type Shown = StepStatus | 'paused';

/** A step paused by a logout or an unknown popup shows Paused until it carries on. */
function shownStatus(st: StepState): Shown {
  if (st.activities.some((a) => a.state === 'paused')) return 'paused';
  return st.status;
}

const NOTE: Record<Shown, string> = {
  idle: 'Not started',
  waiting: 'Waits for step 2',
  working: 'Working…',
  'needs-staff': 'Needs you',
  done: 'Done',
  error: 'Stopped',
  paused: 'Paused',
};

/** The solid square in front of each step: its number, or what state it is in. */
function StepBox({ id, status }: { id: StepId; status: Shown }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-xs font-bold';
  switch (status) {
    case 'done':
      return (
        <span className={cx(base, 'bg-emerald-600 text-white')}>
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      );
    case 'working':
      return (
        <span className={cx(base, 'border-2 border-blue-600 bg-white text-blue-600')}>
          <Spinner className="h-3.5 w-3.5" />
        </span>
      );
    case 'needs-staff':
      return <span className={cx(base, 'bg-blue-600 text-white')}>{id}</span>;
    case 'error':
      return (
        <span className={cx(base, 'bg-red-600 text-white')}>
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      );
    case 'paused':
      return (
        <span className={cx(base, 'bg-amber-400 text-amber-950')}>
          <Pause className="h-3.5 w-3.5" fill="currentColor" />
        </span>
      );
    case 'waiting':
      return (
        <span className={cx(base, 'bg-slate-200 text-slate-600')}>
          <Clock3 className="h-3.5 w-3.5" />
        </span>
      );
    default:
      return <span className={cx(base, 'bg-slate-200 text-slate-700')}>{id}</span>;
  }
}

/** The steps in one bar (step 0 is only for reading). Each shows its own state; several can work at once. */
export function StepTracker() {
  const steps = useApp((s) => s.steps);
  const active = useApp((s) => s.activeStep);

  return (
    <nav aria-label="Steps" className="card overflow-hidden">
      <ol className="scroll-thin flex snap-x overflow-x-auto lg:grid lg:grid-cols-7 lg:overflow-visible">
        {STEP_IDS.map((id) => {
          const status = shownStatus(steps[id]);
          const isActive = id === active;
          return (
            <li key={id} className="min-w-[176px] flex-1 snap-start border-r border-slate-200 last:border-r-0 lg:min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  selectStep(id);
                  e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                }}
                aria-current={isActive ? 'step' : undefined}
                className={cx(
                  'relative flex h-full w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                  isActive ? 'bg-blue-50' : 'bg-white hover:bg-slate-50',
                )}
              >
                <StepBox id={id} status={status} />
                <span className="min-w-0">
                  <span className={cx('block text-[13px] font-semibold leading-tight', isActive ? 'text-blue-800' : 'text-slate-900')}>
                    {STEP_INFO[id].short}
                  </span>
                  <span
                    className={cx(
                      'mt-0.5 block truncate text-xs',
                      status === 'needs-staff' && 'font-semibold text-blue-700',
                      status === 'done' && 'text-emerald-700',
                      status === 'error' && 'font-semibold text-red-700',
                      status === 'paused' && 'font-semibold text-amber-800',
                      (status === 'working' || status === 'waiting' || status === 'idle') && 'text-slate-600',
                    )}
                  >
                    {id === 3 && status === 'waiting' ? NOTE.waiting : NOTE[status]}
                  </span>
                </span>
                {isActive && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-blue-600" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
