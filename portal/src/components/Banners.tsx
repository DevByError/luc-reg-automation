import { AppWindow, CheckCircle2, Hourglass, Info, LogIn, RefreshCw, ServerCrash, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNow } from '../lib/useNow';
import { resumeAfterLogin, retryAllNow } from '../state/runner';
import { showSiteWindow } from '../state/siteWindow';
import { dismissToast, useApp } from '../state/store';
import { STEP_IDS } from '../state/types';
import type { Activity } from '../state/types';
import { SLOW_AFTER } from './ActivityList';
import { Button, cx } from './ui';

function useBrowserOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function Strip({ tone, icon, children, action }: { tone: 'red' | 'amber' | 'blue'; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        'border-b',
        tone === 'red' && 'border-red-800 bg-red-600 text-white',
        tone === 'amber' && 'border-amber-400 bg-amber-100 text-amber-950',
        tone === 'blue' && 'border-blue-300 bg-blue-50 text-slate-900',
      )}
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-[13px] sm:px-6">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 leading-snug">{children}</span>
        {action}
      </div>
    </div>
  );
}

/** Network, slow-site and login messages, shown under the header for every step at once. */
export function Banners({ sessionMinimized }: { sessionMinimized: boolean }) {
  const online = useBrowserOnline();
  const steps = useApp((s) => s.steps);
  const site = useApp((s) => s.site);
  const live = useApp((s) => s.settings.mode === 'live');
  const hasStudent = useApp((s) => !!s.student);
  const w = useApp((s) => s.siteWindow);
  const all: Activity[] = STEP_IDS.flatMap((id) => steps[id].activities);
  const retrying = all.filter((a) => a.state === 'retrying');
  const running = all.filter((a) => a.state === 'running');
  const now = useNow(retrying.length > 0 || running.length > 0);
  const slow = running.some((a) => a.startedAt && now - a.startedAt > SLOW_AFTER);
  const nextTry = retrying.reduce((min, a) => Math.min(min, a.retryAt ?? Infinity), Infinity);
  const secs = Number.isFinite(nextTry) ? Math.max(0, Math.ceil((nextTry - now) / 1000)) : 0;

  return (
    <div className="sticky top-12 z-20">
      {!online && (
        <Strip tone="red" icon={<WifiOff className="h-4 w-4" />}>
          <b>This computer is offline.</b> The tool waits and carries on by itself when the network is back. Nothing you typed is lost.
        </Strip>
      )}
      {live && hasStudent && w.tool === 'down' && (
        <Strip tone="red" icon={<ServerCrash className="h-4 w-4" />}>
          <b>The portal's tool on this computer isn't answering.</b> Keep the window that start-portal.bat opened running. The tool waits and
          carries on when it answers again.
        </Strip>
      )}
      {live && hasStudent && w.tool === 'ok' && (w.browser === 'closed' || w.browser === 'error') && site.status === 'signed-in' && (
        <Strip
          tone="amber"
          icon={<AppWindow className="h-4 w-4 text-amber-700" />}
          action={
            <Button size="sm" variant="outline" onClick={() => void showSiteWindow()}>
              Open the site window
            </Button>
          }
        >
          <b>The site window is closed.</b> The tool needs it for the steps that aren't done. It opens it again by itself when needed.
        </Strip>
      )}
      {site.status !== 'signed-in' && sessionMinimized && (
        <Strip
          tone="red"
          icon={<LogIn className="h-4 w-4" />}
          action={
            <span className="flex gap-2">
              {live && (
                <Button size="sm" variant="secondary" onClick={() => void showSiteWindow()}>
                  Show the site window
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => void resumeAfterLogin()} loading={site.status === 'checking'} loadingText="Checking…">
                I've logged in, resume
              </Button>
            </span>
          }
        >
          <b>The site logged you out.</b> The tool paused and kept its place. Log in again in the site window
          {live ? '; the portal notices by itself.' : ', then resume.'}
        </Strip>
      )}
      {retrying.length > 0 && site.status === 'signed-in' && (
        <Strip
          tone="amber"
          icon={<RefreshCw className="h-4 w-4 text-amber-700" />}
          action={
            <Button size="sm" variant="outline" onClick={retryAllNow} icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Retry now
            </Button>
          }
        >
          <b>Can't reach online.lincoln.edu.my right now.</b> The tool tries again by itself{secs > 0 ? ` in ${secs}s` : ''}. Saves are never repeated
          blindly, and nothing is lost.
        </Strip>
      )}
      {slow && retrying.length === 0 && site.status === 'signed-in' && (
        <Strip tone="blue" icon={<Hourglass className="h-4 w-4 text-blue-700" />}>
          <b>The site is slow right now.</b> The tool keeps waiting for it. Please don't refresh the page or press buttons twice.
        </Strip>
      )}
    </div>
  );
}

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex flex-col items-center gap-2 sm:left-auto sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-2.5 rounded-sm border-l-4 bg-slate-800 px-3.5 py-3 text-[13px] text-white shadow-lg',
            t.tone === 'success' && 'border-l-emerald-400',
            t.tone === 'error' && 'border-l-red-400',
            t.tone === 'warning' && 'border-l-amber-400',
            t.tone === 'info' && 'border-l-blue-400',
          )}
        >
          {t.tone === 'success' ? (
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Info className={cx('mt-px h-4 w-4 shrink-0', t.tone === 'error' ? 'text-red-400' : t.tone === 'warning' ? 'text-amber-400' : 'text-blue-300')} />
          )}
          <span className="min-w-0 flex-1 leading-snug">{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
