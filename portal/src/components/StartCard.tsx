import { AppWindow, Check, CheckCircle2, FolderOpen, LogIn, RefreshCw, Search, ServerCrash, UserPlus, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { isoToDmy } from '../lib/format';
import { openStudentFolder, requestNewStudent, startStudent } from '../state/actions';
import { showSiteWindow } from '../state/siteWindow';
import { useApp } from '../state/store';
import { Badge, Button, Card, PanelHeader, Skeleton, Spinner, cx } from './ui';

function WindowLine({ tone, icon, children, action }: { tone: 'green' | 'amber' | 'red' | 'slate'; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={cx(
        'flex flex-col gap-2.5 border-b px-4 py-3 text-[13px] leading-snug sm:flex-row sm:items-center sm:px-5',
        tone === 'green' && 'border-emerald-300 bg-emerald-50 text-slate-900',
        tone === 'amber' && 'border-amber-300 bg-amber-50 text-slate-900',
        tone === 'red' && 'border-red-300 bg-red-50 text-slate-900',
        tone === 'slate' && 'border-slate-300 bg-slate-50 text-slate-800',
      )}
      role="status"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className="mt-px shrink-0">{icon}</span>
        <span className="min-w-0">{children}</span>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Live mode: the site window must be open and logged in before a student starts. The staff logs in there. */
function SiteWindowLine() {
  const w = useApp((s) => s.siteWindow);
  const open = (label: string, variant: 'primary' | 'outline' = 'outline') => (
    <Button size="sm" variant={variant} icon={<AppWindow className="h-3.5 w-3.5" />} onClick={() => void showSiteWindow()}>
      {label}
    </Button>
  );
  if (w.tool === 'connecting') {
    return (
      <WindowLine tone="slate" icon={<Spinner className="h-4 w-4 text-blue-600" />}>
        Connecting to the portal's tool on this computer…
      </WindowLine>
    );
  }
  if (w.tool === 'down') {
    return (
      <WindowLine tone="red" icon={<ServerCrash className="h-4 w-4 text-red-700" />}>
        <b>The portal's tool on this computer isn't answering.</b> Start the portal with start-portal.bat and keep its window open. This
        page checks again by itself.
      </WindowLine>
    );
  }
  if (w.browser === 'starting') {
    return (
      <WindowLine tone="slate" icon={<Spinner className="h-4 w-4 text-blue-600" />}>
        Opening the site window (Microsoft Edge)…
      </WindowLine>
    );
  }
  if (w.browser === 'error') {
    return (
      <WindowLine tone="red" icon={<XCircle className="h-4 w-4 text-red-700" />} action={<Button size="sm" variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void showSiteWindow()}>Try again</Button>}>
        <b>The site window couldn't open.</b> {w.error}
      </WindowLine>
    );
  }
  if (w.browser !== 'open') {
    return (
      <WindowLine tone="amber" icon={<AppWindow className="h-4 w-4 text-amber-700" />} action={open('Open the site window', 'primary')}>
        <b>First, open the site window and log in.</b> It's a separate Microsoft Edge window that the tool works in.
      </WindowLine>
    );
  }
  if (w.login === 'in') {
    return (
      <WindowLine tone="green" icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />} action={open('Show the site window')}>
        Logged in to online.lincoln.edu.my in the site window.
      </WindowLine>
    );
  }
  return (
    <WindowLine tone="amber" icon={<LogIn className="h-4 w-4 text-amber-700" />} action={open('Show the site window')}>
      <b>Log in to online.lincoln.edu.my in the site window,</b> as you always do. The portal notices by itself. It never asks for your password.
    </WindowLine>
  );
}

/** "Find the student". The passport typed here starts steps 1, 2, 4, 5 and 6. */
export function StartCard() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const live = useApp((s) => s.settings.mode === 'live');
  const ready = useApp((s) => s.settings.mode !== 'live' || (s.siteWindow.tool === 'ok' && s.siteWindow.browser === 'open' && s.siteWindow.login === 'in'));

  const submit = () => {
    const problem = startStudent(value);
    setError(problem);
    if (!problem) setValue('');
  };

  return (
    <Card>
      <PanelHeader icon={<Search className="h-3.5 w-3.5" />} title="Find the student" subtitle="By passport number" />
      {live && <SiteWindowLine />}
      <form
        className="p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="passport" className="mb-1 block text-[13px] font-semibold text-slate-800">
          Passport number<span className="ml-0.5 text-red-600">*</span>
        </label>
        <div className="flex">
          <input
            id="passport"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="Type the passport number"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            aria-invalid={!!error || undefined}
            className={cx(
              'input h-10 min-w-0 flex-1 rounded-r-none text-[15px] font-semibold tracking-wide placeholder:font-normal placeholder:tracking-normal',
              error && 'input-invalid',
            )}
          />
          <Button type="submit" size="lg" className="-ml-px rounded-l-none px-6" disabled={!ready} title={ready ? undefined : 'Log in to the site in the site window first'}>
            Start
          </Button>
        </div>
        {error ? (
          <p className="mt-1.5 text-xs font-semibold text-red-700">{error}</p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-600">
            Type it exactly as printed in the passport. Steps 1, 2, 4, 5 and 6 start at once.
          </p>
        )}
      </form>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-white px-4 py-2.5 sm:px-5">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

/** The student's record: name and programme, the key numbers, and the student's folder. */
export function StudentCard() {
  const student = useApp((s) => s.student);
  const reg = useApp((s) => s.siteData.regRow);
  const card = useApp((s) => s.siteData.card);
  const odl = useApp((s) => s.siteData.odl);
  const luc = useApp((s) => s.form.lucSaved);
  const step1 = useApp((s) => s.steps[1]);
  if (!student) return null;

  const name = card?.name ?? reg?.name;
  const program = card?.program ?? reg?.course;
  const searching = !name && step1.status !== 'error';

  return (
    <Card label="Student">
      <div className="flex flex-col gap-3 border-b border-slate-300 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {name ? (
              <h2 className="text-lg font-semibold leading-7 text-slate-900">{name}</h2>
            ) : searching ? (
              <Skeleton className="h-6 w-56" />
            ) : (
              <h2 className="text-lg font-semibold leading-7 text-slate-500">Not found yet</h2>
            )}
            {name ? (
              <Badge tone="green" icon={<Check className="h-3 w-3" strokeWidth={3} />}>
                Student found
              </Badge>
            ) : searching ? (
              <Badge tone="blue" icon={<Spinner className="h-3 w-3" />}>
                Searching the site
              </Badge>
            ) : null}
            {step1.status === 'error' && <Badge tone="red">Step 1 stopped</Badge>}
            {odl && <Badge tone="navy">ODL student</Badge>}
          </div>
          {program ? (
            <div className="mt-0.5 text-sm text-slate-700">{program}</div>
          ) : searching ? (
            <Skeleton className="mt-1.5 h-4 w-80 max-w-full" />
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => void openStudentFolder(student.passport)}>
            Open folder
          </Button>
          <Button variant="secondary" size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={requestNewStudent}>
            New student
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
        <Fact label="Admission ID">{luc || <span className="font-normal text-slate-400">Not saved yet</span>}</Fact>
        <Fact label="Passport No">{student.passport}</Fact>
        <Fact label="Nationality">{card ? card.nationality : <Skeleton className="mt-1 h-4 w-24" />}</Fact>
        <Fact label="Applied">{reg ? isoToDmy(reg.applyDate) : searching ? <Skeleton className="mt-1 h-4 w-24" /> : '—'}</Fact>
      </dl>
      <div className="flex min-w-0 items-center gap-2 border-t border-slate-300 bg-slate-50 px-4 py-2 text-[13px] sm:px-5">
        <FolderOpen className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="shrink-0 font-semibold text-slate-700">Files</span>
        <span className="truncate font-mono text-[12px] text-slate-700" title={student.folder}>
          {student.folder}
        </span>
      </div>
    </Card>
  );
}
