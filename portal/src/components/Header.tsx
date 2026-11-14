import { FlaskConical, FolderSearch, Settings } from 'lucide-react';
import { setUi, useApp } from '../state/store';
import { versionText } from '../version';
import { Spinner, cx } from './ui';

function Dot({ tone }: { tone: 'green' | 'amber' | 'slate' | 'red' }) {
  return (
    <span
      className={cx(
        'h-2 w-2 shrink-0 rounded-full',
        tone === 'green' && 'bg-emerald-400',
        tone === 'amber' && 'bg-amber-400',
        tone === 'slate' && 'bg-slate-400',
        tone === 'red' && 'bg-red-500',
      )}
    />
  );
}

function Plain({ tone, short, long, title }: { tone: 'green' | 'amber' | 'slate' | 'red'; short: string; long: string; title?: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-blue-100" title={title}>
      <Dot tone={tone} />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </span>
  );
}

/**
 * The login has no fixed length, so there is no timer here. The tool learns it was logged out
 * only when the site says so, and then pauses and tells the staff.
 */
function SiteStatus() {
  const status = useApp((s) => s.site.status);
  const live = useApp((s) => s.settings.mode === 'live');
  const w = useApp((s) => s.siteWindow);
  if (status === 'checking') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-blue-100">
        <Spinner className="h-3.5 w-3.5" /> Checking the login…
      </span>
    );
  }
  if (status === 'logged-out') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-sm bg-red-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
        Logged out
      </span>
    );
  }
  if (live) {
    if (w.tool === 'down') return <Plain tone="red" short="Tool not answering" long="The portal's tool isn't answering" />;
    if (w.tool === 'connecting') return <Plain tone="slate" short="Connecting…" long="Connecting to the tool…" />;
    if (w.browser === 'starting') return <Plain tone="slate" short="Opening…" long="Opening the site window…" />;
    if (w.browser === 'error') return <Plain tone="red" short="Window error" long="The site window couldn't open" />;
    if (w.browser !== 'open') return <Plain tone="slate" short="Window closed" long="Site window closed" />;
    if (w.login === 'out') return <Plain tone="amber" short="Not logged in" long="Not logged in to the site" />;
    if (w.login === 'unknown') return <Plain tone="slate" short="Checking…" long="Checking the login…" />;
  }
  return (
    <Plain
      tone="green"
      short="Logged in"
      long="Logged in to the site"
      title="If the site logs you out, the tool pauses, keeps its place and tells you."
    />
  );
}

const headerButton =
  'inline-flex h-8 items-center gap-2 rounded-sm px-2.5 text-[13px] font-semibold text-blue-50 hover:bg-blue-900 active:bg-blue-800';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-blue-900 bg-blue-950 text-white">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[15px] font-semibold">Registration Portal</span>
              <span className="hidden shrink-0 text-[11px] font-semibold text-blue-200 sm:inline" title="When this copy of the portal was made. Every computer should show the same.">
                Version {versionText()}
              </span>
            </div>
            <div className="hidden truncate text-[11px] text-blue-200 sm:block">Runs on this computer · fills online.lincoln.edu.my</div>
            <div className="truncate text-[11px] font-semibold text-blue-200 sm:hidden">Version {versionText()}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5">
          <SiteStatus />
          <span className="mx-1.5 hidden h-5 w-px bg-blue-800 sm:block" />
          <button type="button" onClick={() => setUi({ filesOpen: true })} className={headerButton} title="Find a student's files by passport">
            <FolderSearch className="h-4 w-4" />
            <span className="hidden lg:inline">Student files</span>
          </button>
          <button type="button" onClick={() => setUi({ settingsOpen: true })} className={cx(headerButton, 'w-8 justify-center px-0')} aria-label="Settings" title="Settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Sample mode only: says plainly that this is test data, with the test controls one click away. */
export function SampleStrip() {
  const sample = useApp((s) => s.settings.mode === 'sample');
  if (!sample) return null;
  return (
    <div className="border-b border-amber-500 bg-amber-300 text-amber-950">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-1 text-[13px] sm:px-6">
        <p className="min-w-0 truncate">
          <b className="font-bold uppercase tracking-wide">Sample mode</b>
          <span className="hidden sm:inline"> · No real site is connected. Every name and document here is made-up test data.</span>
          <span className="sm:hidden"> · test data only</span>
        </p>
        <button
          type="button"
          onClick={() => setUi({ demoOpen: true })}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-amber-700 bg-amber-50 px-2.5 text-xs font-semibold text-amber-950 hover:bg-white"
          title="Open the test controls"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Test controls
        </button>
      </div>
    </div>
  );
}
