import { ArrowUp, Check, CheckCircle2, Eye, RefreshCw } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { SiteNeeds } from '../../../shared/ops';
import { confirmSavedByStaff, confirmStampByStaff, retry, showStagePage } from '../../state/actions';
import { busyKeyFor } from '../../state/runner';
import { STEP_INFO, useApp } from '../../state/store';
import type { StepId, StepStatus } from '../../state/types';
import { ActivityBox } from '../ActivityList';
import { SiteNeedsForm } from '../SiteNeedsForm';
import { Alert, Badge, Button, Card, PanelHeader, Spinner } from '../ui';

function StatusBadge({ status }: { status: StepStatus }) {
  switch (status) {
    case 'done':
      return (
        <Badge tone="green" icon={<Check className="h-3 w-3" strokeWidth={3} />}>
          Done
        </Badge>
      );
    case 'working':
      return (
        <Badge tone="blue" icon={<Spinner className="h-3 w-3" />}>
          Working
        </Badge>
      );
    case 'needs-staff':
      return <Badge tone="blue">Needs you</Badge>;
    case 'error':
      return <Badge tone="red">Stopped</Badge>;
    case 'waiting':
      return <Badge tone="slate">Waiting</Badge>;
    default:
      return null;
  }
}

/** Brings the red box with the fields the site asked for into view, and puts the cursor in the first one. */
function showNeeds(box: HTMLElement | null) {
  if (!box) return;
  window.requestAnimationFrame(() => {
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.querySelector<HTMLElement>('[data-site-needs] select, [data-site-needs] input')?.focus({ preventScroll: true });
  });
}

/** Brings the stage page in step 5 into view, once it is drawn. */
function showStagePageBox() {
  window.setTimeout(() => document.getElementById('stage-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

const listOf = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * Next to the step's buttons, where the staff pressed Continue To Next: what the site asked for and where to fill it.
 * The red box with the fields is at the top of the step, above the tool's activity.
 */
function NeedsPointer({ needs, onShow }: { needs: SiteNeeds; onShow: () => void }) {
  const one = needs.fields.length === 1;
  const button = needs.save === 'final' ? 'Final Submit' : 'Continue To Next';
  const then = ['address', 'whatsapp', 'wechat', 'education'].includes(needs.save) ? ' The tool then carries on by itself.' : ` Then press ${button} again.`;
  return (
    <div role="note" className="flex flex-col gap-2 rounded-sm border border-l-4 border-red-300 border-l-red-600 bg-red-50 px-3.5 py-2.5 text-[13px] text-slate-800 sm:flex-row sm:items-center sm:justify-between">
      <p className="leading-relaxed">
        <span className="font-semibold text-red-800">The site asks for {listOf(needs.fields.map((f) => f.label))}.</span> Fill {one ? 'it' : 'them'} in the red box at the top of
        this step.{then}
      </p>
      <Button size="sm" variant="outline" icon={<ArrowUp className="h-3.5 w-3.5" />} onClick={onShow} className="self-start sm:self-auto">
        Go to {one ? 'the box' : 'the boxes'}
      </Button>
    </div>
  );
}

/** The card around each step: numbered title, any stop message, the tool's activity, the fields and the buttons. */
export function StepShell({ step, children, footer }: { step: StepId; children?: ReactNode; footer?: ReactNode }) {
  const st = useApp((s) => s.steps[step]);
  const retryBusy = useApp((s) => (st.error?.retry ? !!s.busy[busyKeyFor(s.runId, st.error.retry)] : false));
  const err = st.error;
  const stopRef = useRef<HTMLDivElement>(null);
  const needs = err?.needs;
  // The site refused a save and asked for fields: the staff is usually down by the buttons, so the box comes to them.
  useEffect(() => {
    if (needs) showNeeds(stopRef.current);
  }, [needs]);

  return (
    <Card>
      <PanelHeader number={step} title={STEP_INFO[step].title} subtitle={STEP_INFO[step].subtitle} right={<StatusBadge status={st.status} />} />
      <div className="space-y-5 p-4 sm:p-5">
        {err && (
          <div ref={stopRef} className="scroll-mt-20">
            <Alert
              tone="error"
              title={err.title}
              actions={
                err.retry || err.confirmSaved || err.confirmStamp || err.stagePage ? (
                  <span className="flex flex-wrap gap-2">
                    {err.stagePage && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Eye className="h-3.5 w-3.5" />}
                        onClick={() => {
                          void showStagePage();
                          showStagePageBox();
                        }}
                        title="Shows Passport Movement Stages as the site has it, with this student's rows. Nothing changes on the site."
                      >
                        Show the stage page here
                      </Button>
                    )}
                    {err.confirmStamp && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={() => confirmStampByStaff()}
                        title="Only if the site window shows the scan under Upload Visa Page."
                      >
                        The site shows the scan
                      </Button>
                    )}
                    {err.confirmSaved && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={() => err.confirmSaved && confirmSavedByStaff(err.confirmSaved)}
                        title="Only if the site window shows it saved. The tool then carries on and never presses it again."
                      >
                        It saved on the site
                      </Button>
                    )}
                    {err.retry && (
                      <Button size="sm" variant="danger" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={retryBusy} loadingText="Trying again…" onClick={() => err.retry && retry(err.retry)}>
                        {err.retryLabel ?? 'Try again'}
                      </Button>
                    )}
                  </span>
                ) : undefined
              }
            >
              <p>{err.message}</p>
              {err.hint && <p className="mt-1.5 font-semibold">{err.hint}</p>}
              {err.rows && err.rows.length > 0 && (
                <div className="mt-2.5 overflow-x-auto rounded-sm border border-red-300 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-red-300 bg-red-100 text-red-950">
                      <tr>
                        <th className="px-3 py-1.5 font-semibold">Field</th>
                        <th className="px-3 py-1.5 font-semibold">Expected</th>
                        <th className="px-3 py-1.5 font-semibold">The site shows</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100 text-slate-800">
                      {err.rows.map((r) => (
                        <tr key={r.field}>
                          <td className="px-3 py-1.5 font-semibold">{r.field}</td>
                          <td className="px-3 py-1.5 font-mono">{r.expected}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold text-red-700">{r.actual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {err.needs && <SiteNeedsForm key={`${err.needs.save}:${err.needs.fields.map((f) => f.key).join('|')}`} step={step} needs={err.needs} />}
            </Alert>
          </div>
        )}
        <ActivityBox step={step} />
        {children}
        {needs && <NeedsPointer needs={needs} onShow={() => showNeeds(stopRef.current)} />}
      </div>
      {footer && (
        <div className="flex flex-col gap-3 border-t border-slate-300 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">{footer}</div>
      )}
    </Card>
  );
}

/** A small heading inside a step, for a group of fields. */
export function SubHeading({ title, note, right }: { title: string; note?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-300 pb-1.5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {note && <p className="text-xs text-slate-600">{note}</p>}
      </div>
      {right}
    </div>
  );
}

/** Placeholder fields while the site's form is still loading. */
export function FieldsLoading({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <Spinner className="h-3.5 w-3.5 text-blue-600" />
        {label}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-9 w-full" />
          </div>
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
