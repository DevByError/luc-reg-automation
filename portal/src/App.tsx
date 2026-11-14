import { CheckCircle2, FileStack, ListChecks, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Banners, Toaster } from './components/Banners';
import { DemoPanel } from './components/DemoPanel';
import { DocumentPanel } from './components/DocumentPanel';
import { FilesModal } from './components/FilesModal';
import { Header, SampleStrip } from './components/Header';
import { ConfirmFinalModal, ConfirmNewStudentModal, PopupModal, SessionModal, WatchModal } from './components/Modals';
import { SettingsModal } from './components/SettingsModal';
import { StartCard, StudentCard } from './components/StartCard';
import { StepTracker } from './components/StepTracker';
import { Step0 } from './components/steps/Step0';
import { Step1 } from './components/steps/Step1';
import { Step2 } from './components/steps/Step2';
import { Step3 } from './components/steps/Step3';
import { Step4 } from './components/steps/Step4';
import { Step5 } from './components/steps/Step5';
import { Step6 } from './components/steps/Step6';
import { Button, Card, PanelHeader, cx } from './components/ui';
import { allDone, clearStudent } from './state/actions';
import { connectTool } from './state/siteWindow';
import { STEP_INFO, setUi, useApp } from './state/store';
import { STEP_IDS } from './state/types';

const PANELS = { 0: Step0, 1: Step1, 2: Step2, 3: Step3, 4: Step4, 5: Step5, 6: Step6 };

function HowItWorks() {
  return (
    <Card>
      <PanelHeader icon={<ListChecks className="h-3.5 w-3.5" />} title="How it works" subtitle="Step 0 (a document to read) and six steps on online.lincoln.edu.my, one student at a time" />
      <ol className="grid gap-px bg-slate-200 sm:grid-cols-2">
        {STEP_IDS.map((id) => (
          <li key={id} className="flex gap-3 bg-white px-4 py-2.5 sm:px-5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-slate-200 text-xs font-bold text-slate-700">{id}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-slate-900">{STEP_INFO[id].title}</span>
              <span className="block text-xs leading-relaxed text-slate-600">{STEP_INFO[id].subtitle}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 border-t border-slate-300 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700 sm:grid-cols-3 sm:px-5">
        <p className="flex gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" />
          Every value is read back from the site before a save. Anything that doesn't match stops the tool.
        </p>
        <p className="flex gap-2">
          <FileStack className="h-4 w-4 shrink-0 text-slate-500" />
          Every document is saved in one folder per student, named by the passport number.
        </p>
        <p className="flex gap-2">
          <UserPlus className="h-4 w-4 shrink-0 text-slate-500" />
          You log in to the site yourself. You press every main save; the tool never prints and never presses Complete.
        </p>
      </div>
    </Card>
  );
}

function Completed() {
  const passport = useApp((s) => s.student?.passport ?? '');
  const folder = useApp((s) => s.student?.folder ?? '');
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-l-4 border-emerald-300 border-l-emerald-600 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center">
      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" />
      <div className="min-w-0 flex-1 text-sm text-slate-900">
        <div className="font-semibold">All six steps are done for {passport}.</div>
        <div className="mt-0.5 truncate text-slate-700">
          The files are in <span className="font-mono text-[13px]">{folder}</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={() => setUi({ filesOpen: true, filesQuery: passport })}>
          See the files
        </Button>
        <Button variant="success" icon={<UserPlus className="h-4 w-4" />} onClick={clearStudent}>
          Next student
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const student = useApp((s) => s.student);
  const activeStep = useApp((s) => s.activeStep);
  const mobileView = useApp((s) => s.ui.mobileView);
  const docsReady = useApp((s) => Object.values(s.docs).filter((d) => d.status === 'ready').length);
  const done = useApp(allDone);
  const [sessionMinimized, setSessionMinimized] = useState(false);
  const siteOk = useApp((s) => s.site.status === 'signed-in');
  const sample = useApp((s) => s.settings.mode === 'sample');
  if (siteOk && sessionMinimized) setSessionMinimized(false);

  // Live mode: find the tool on this computer and open the site window.
  useEffect(() => {
    void connectTool();
  }, []);

  const Panel = PANELS[activeStep];

  return (
    <div className="min-h-screen">
      <Header />
      <SampleStrip />
      <Banners sessionMinimized={sessionMinimized} />
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 sm:px-6 sm:py-5">
        {!student ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <StartCard />
            <HowItWorks />
          </div>
        ) : (
          <>
            <StudentCard />
            {done && <Completed />}
            <StepTracker />
            <div className="flex overflow-hidden rounded-sm border border-slate-400 bg-white lg:hidden" role="tablist" aria-label="View">
              {(
                [
                  ['fields', 'Step fields'],
                  ['docs', `Documents (${docsReady})`],
                ] as const
              ).map(([v, label], i) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={mobileView === v}
                  onClick={() => setUi({ mobileView: v })}
                  className={cx(
                    'h-9 flex-1 text-sm font-semibold transition-colors',
                    i > 0 && 'border-l border-slate-400',
                    mobileView === v ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <div
                className={cx(
                  'h-[78vh] lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-80px)]',
                  mobileView === 'docs' ? 'block' : 'hidden',
                )}
              >
                <DocumentPanel />
              </div>
              <div className={cx('min-w-0 lg:block', mobileView === 'fields' ? 'block' : 'hidden')}>
                <Panel />
              </div>
            </div>
          </>
        )}
      </main>
      <footer className="mx-auto max-w-[1600px] px-4 pb-8 pt-2 text-center text-xs text-slate-500 sm:px-6">
        Student data stays on this computer. The portal only talks to online.lincoln.edu.my.
      </footer>

      <SessionModal minimized={sessionMinimized} onMinimize={() => setSessionMinimized(true)} />
      <PopupModal />
      <WatchModal />
      <ConfirmFinalModal />
      <ConfirmNewStudentModal />
      <FilesModal />
      <SettingsModal />
      {sample && <DemoPanel />}
      <Toaster />
    </div>
  );
}
