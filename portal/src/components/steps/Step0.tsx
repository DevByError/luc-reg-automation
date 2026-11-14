import { CheckCircle2, Clock3, Eye, XCircle } from 'lucide-react';
import { retry } from '../../state/actions';
import { DOC_INFO, setUi, showDoc, useApp } from '../../state/store';
import { PrintButton } from '../DocumentPanel';
import { Button, Spinner } from '../ui';
import { StepShell, SubHeading } from './StepShell';

/** Stage 0: the A/c Mini Statement. Only a document to read: there is nothing to fill in, and no other step uses it. */
export function Step0() {
  const doc = useApp((s) => s.docs.miniStatement);
  const reason = useApp((s) => s.settings.accessReason);
  const icon =
    doc.status === 'ready' ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-700" />
    ) : doc.status === 'loading' ? (
      <Spinner className="h-5 w-5 text-blue-600" />
    ) : doc.status === 'error' ? (
      <XCircle className="h-5 w-5 text-red-600" />
    ) : (
      <Clock3 className="h-5 w-5 text-slate-500" />
    );
  const text =
    doc.status === 'ready'
      ? `Saved as ${doc.fileName}`
      : doc.status === 'error'
        ? (doc.note ?? "Didn't arrive")
        : 'The tool is getting it from the site…';

  return (
    <StepShell step={0}>
      <div className="space-y-3">
        <SubHeading title="A/c Mini Statement" note="The tool types the passport, presses View, gives the access reason, and saves the report as a PDF. It only brings the document." />
        <ul className="divide-y divide-slate-200 rounded-sm border border-slate-300">
          <li className="flex flex-col gap-3 px-3.5 py-2.5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-px shrink-0">{icon}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{DOC_INFO.miniStatement.title}</div>
                <div className="text-xs text-slate-600">
                  <span className={doc.status === 'error' ? 'font-semibold text-red-700' : undefined}>{text}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="sm" icon={<Eye className="h-3.5 w-3.5" />} disabled={doc.status !== 'ready'} onClick={() => showDoc('miniStatement')}>
                View
              </Button>
              <PrintButton docKey="miniStatement" />
              {doc.status === 'error' && (
                <Button variant="danger" size="sm" onClick={() => retry('step0')}>
                  Try again
                </Button>
              )}
            </div>
          </li>
        </ul>
        <p className="text-xs text-slate-600">
          The access reason typed on the site is “{reason}”;{' '}
          <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => setUi({ settingsOpen: true })}>
            change it in Settings
          </button>
          . Nothing here is needed by the other steps.
        </p>
      </div>
    </StepShell>
  );
}
