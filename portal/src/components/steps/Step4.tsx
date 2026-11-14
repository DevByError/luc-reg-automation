import { CheckCircle2, Clock3, Eye, XCircle } from 'lucide-react';
import { DOC_INFO, setUi, showDoc, useApp } from '../../state/store';
import type { DocKey } from '../../state/types';
import { PrintButton } from '../DocumentPanel';
import { Button, DetailTable, Spinner } from '../ui';
import { FieldsLoading, StepShell, SubHeading } from './StepShell';

function DocRow({ docKey, row }: { docKey: DocKey; row: string }) {
  const doc = useApp((s) => s.docs[docKey]);
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
      : doc.status === 'loading'
        ? 'Downloading…'
        : doc.status === 'error'
          ? (doc.note ?? "Didn't arrive")
          : 'Waits for the documents tab';
  return (
    <li className="flex flex-col gap-3 px-3.5 py-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-px shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">{DOC_INFO[docKey].title}</div>
          <div className="text-xs text-slate-600">
            Section 1, row {row} · <span className={doc.status === 'error' ? 'font-semibold text-red-700' : undefined}>{text}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button variant="outline" size="sm" icon={<Eye className="h-3.5 w-3.5" />} disabled={doc.status !== 'ready'} onClick={() => showDoc(docKey)}>
          View
        </Button>
        <PrintButton docKey={docKey} />
      </div>
    </li>
  );
}

export function Step4() {
  const row = useApp((s) => s.siteData.fileRow);
  const reason = useApp((s) => s.settings.accessReason);
  const status = useApp((s) => s.steps[4].status);

  return (
    <StepShell step={4}>
      {row ? (
        <div className="space-y-3">
          <SubHeading title="Student Files result" note="Exactly one student matched the passport." />
          <DetailTable
            rows={[
              ['Student ID', row.studentId || '—'],
              ['Name', row.name],
              ['Course name', row.course],
            ]}
          />
        </div>
      ) : (
        status !== 'error' && <FieldsLoading label="Opening the student's file…" rows={1} />
      )}

      <div className="space-y-3">
        <SubHeading title="Documents to print" note="Found by their whole, exact names, never by row number." />
        <ul className="divide-y divide-slate-200 rounded-sm border border-slate-300">
          <DocRow docKey="profile" row="1" />
          <DocRow docKey="studentType" row="10" />
        </ul>
        <p className="text-xs text-slate-600">
          Row 11, “Student Type Document English Pre”, is left alone. The access reason typed on the site is “{reason}”;{' '}
          <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => setUi({ settingsOpen: true })}>
            change it in Settings
          </button>
          .
        </p>
      </div>
    </StepShell>
  );
}
