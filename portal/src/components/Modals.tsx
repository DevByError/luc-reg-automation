import { AlertTriangle, AppWindow, Eye, LogIn, MessageSquareWarning, Send, UserPlus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FEE_KEYS } from '../../shared/ops';
import { FEE_LABELS, clearStudent, finalSubmit } from '../state/actions';
import { PRESS, answerPopup, answerWatch, resumeAfterLogin, revealWatch } from '../state/runner';
import { showSiteWindow } from '../state/siteWindow';
import { STEP_INFO, setUi, useApp } from '../state/store';
import { Button, cx } from './ui';

export function Modal({
  open,
  onClose,
  title,
  icon,
  tone = 'blue',
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose?: () => void;
  title: string;
  icon?: ReactNode;
  tone?: 'blue' | 'red' | 'amber';
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean | 'xl';
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'flex max-h-[92vh] w-full animate-pop-in flex-col overflow-hidden rounded-t-sm border-t-4 bg-white shadow-2xl sm:rounded',
          tone === 'blue' && 'border-t-blue-600',
          tone === 'red' && 'border-t-red-600',
          tone === 'amber' && 'border-t-amber-500',
          wide === 'xl' ? 'sm:max-w-5xl' : wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-300 bg-slate-50 px-5 py-3">
          {icon && (
            <span className={cx('shrink-0', tone === 'blue' && 'text-blue-700', tone === 'red' && 'text-red-700', tone === 'amber' && 'text-amber-700')}>
              {icon}
            </span>
          )}
          <h2 className="min-w-0 flex-1 text-base font-semibold text-slate-900">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-sm p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-700">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-300 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** The site logged the staff out: everything pauses and keeps its place until the staff logs in again. */
export function SessionModal({ minimized, onMinimize }: { minimized: boolean; onMinimize: () => void }) {
  const site = useApp((s) => s.site);
  const live = useApp((s) => s.settings.mode === 'live');
  const open = site.status !== 'signed-in' && !minimized;
  return (
    <Modal
      open={open}
      onClose={site.status === 'checking' ? undefined : onMinimize}
      title="The site logged you out"
      icon={<LogIn className="h-5 w-5" />}
      tone="red"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onMinimize} disabled={site.status === 'checking'}>
            Later
          </Button>
          {live && (
            <Button variant="outline" size="lg" icon={<AppWindow className="h-4 w-4" />} onClick={() => void showSiteWindow()}>
              Show the site window
            </Button>
          )}
          <Button size="lg" onClick={() => void resumeAfterLogin()} loading={site.status === 'checking'} loadingText="Checking your login…">
            I've logged in, resume
          </Button>
        </>
      }
    >
      <p>
        The tool has <b className="text-slate-900">paused and kept its place</b>. Nothing is lost, and anything already saved on the site
        will not be saved twice.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5">
        <li>Log in to online.lincoln.edu.my in the site window, as you always do.</li>
        <li>
          {live
            ? "The portal notices by itself and carries on. You can also press “I've logged in, resume”."
            : "Come back here and press “I've logged in, resume”."}
        </li>
      </ol>
      <p className="mt-3 text-xs text-slate-600">You can keep typing in the portal while you wait. The tool never asks for your password.</p>
    </Modal>
  );
}

/** A popup the tool doesn't know. Nothing more is clicked until the staff decides. */
export function PopupModal() {
  const popup = useApp((s) => s.popups[0]);
  return (
    <Modal
      open={!!popup}
      title="The site showed a message the tool doesn't know"
      icon={<MessageSquareWarning className="h-5 w-5" />}
      tone="amber"
      footer={
        popup && (
          <>
            <Button variant="secondary" size="lg" onClick={() => answerPopup(popup.id, 'stop')}>
              {popup.held ? 'Press Cancel and stop' : 'Stop here'}
            </Button>
            <Button size="lg" onClick={() => answerPopup(popup.id, 'continue')}>
              {popup.held ? 'Press OK and check' : 'Check whether it saved'}
            </Button>
          </>
        )
      }
    >
      {popup && (
        <>
          <p>
            In step {popup.step} ({STEP_INFO[popup.step].title}), after “{popup.action}”, the site said:
          </p>
          <blockquote className="mt-3 rounded-sm border border-l-4 border-amber-300 border-l-amber-500 bg-amber-50 px-3.5 py-2.5 font-semibold text-slate-900">{popup.text}</blockquote>
          <p className="mt-3">
            {popup.held
              ? 'The site is waiting for OK or Cancel, and the tool has paused. If you press OK, it checks on the site whether the save went through before it carries on. If you stop, the tool presses Cancel and the step waits for you.'
              : 'The message is already closed on the site, and the tool has paused. It can check on the site whether the save went through before it carries on, or stop here and wait for you.'}
          </p>
        </>
      )}
    </Modal>
  );
}

/**
 * Watch mode: the tool outlines the button on the site page and shows a picture of that page here, so the staff
 * can check it without leaving the portal. It presses only after the staff says so.
 */
export function WatchModal() {
  const watch = useApp((s) => s.watch);
  const press = watch ? PRESS[watch.key] : null;
  return (
    <Modal
      open={!!watch}
      title={press ? `Press “${press.button}” on the site?` : ''}
      icon={<Eye className="h-5 w-5" />}
      wide={watch?.picture ? 'xl' : undefined}
      footer={
        watch && (
          <>
            <Button variant="secondary" size="lg" onClick={() => answerWatch(watch.id, false)}>
              Stop, don't press
            </Button>
            <Button variant="outline" size="lg" icon={<AppWindow className="h-4 w-4" />} onClick={revealWatch}>
              Show it in the site window
            </Button>
            <Button size="lg" onClick={() => answerWatch(watch.id, true)}>
              Press it
            </Button>
          </>
        )
      }
    >
      {watch && press && (
        <>
          <p>
            In step {watch.step} ({STEP_INFO[watch.step].title}), the tool is about to press <b className="text-slate-900">{press.button}</b> on {press.where}.
          </p>
          {watch.picture ? (
            <>
              <p className="mt-2">
                This is the site page now
                {watch.outlined && (
                  <>
                    , with that button in a <b className="text-red-700">red outline</b>
                  </>
                )}
                . If anything on it looks wrong, press Stop. Nothing has been pressed yet.
              </p>
              {!watch.outlined && (
                <p className="mt-2 font-semibold text-amber-800">The tool couldn't find the button to outline it. Press Stop if this isn't the page you expect.</p>
              )}
              <SitePicture key={watch.id} src={watch.picture} spot={watch.spot} />
            </>
          ) : (
            <p className="mt-2">
              The tool couldn't take a picture of the site page. Press <b className="text-slate-900">Show it in the site window</b> to look at it: that
              button has a <b className="text-red-700">red outline</b>. If anything on that page looks wrong, press Stop. Nothing has been pressed yet.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-600">Watch mode is on. You can turn it off in Settings once you trust the tool.</p>
        </>
      )}
    </Modal>
  );
}

/**
 * The picture of the site page. It opens full size at the button, so the button and the boxes around it can be
 * read; clicked, it shows the whole page at once.
 */
function SitePicture({ src, spot }: { src: string; spot?: { x: number; y: number } }) {
  const [whole, setWhole] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const b = box.current;
    const i = img.current;
    if (!b || !i) return;
    const place = () => {
      if (whole) {
        b.scrollTo({ top: 0, left: 0 });
        return;
      }
      const x = spot ? spot.x : i.naturalWidth / 2;
      const y = spot ? spot.y : i.naturalHeight / 2;
      b.scrollTo({ left: Math.max(0, x - b.clientWidth / 2), top: Math.max(0, y - b.clientHeight / 2) });
    };
    if (i.complete) place();
    else i.addEventListener('load', place, { once: true });
    return () => i.removeEventListener('load', place);
  }, [whole, spot]);
  return (
    <div className="mt-3">
      <div ref={box} className="scroll-thin max-h-[56vh] overflow-auto rounded-sm border border-slate-300 bg-slate-100">
        <button
          type="button"
          onClick={() => setWhole(!whole)}
          className={cx('block', whole ? 'mx-auto cursor-zoom-in' : 'cursor-zoom-out')}
          aria-label={whole ? 'Show the picture full size, at the button' : 'Show the whole page'}
        >
          <img
            ref={img}
            src={src}
            alt="The site page now, with the button the tool will press outlined in red"
            className={cx('block', whole ? 'h-auto max-h-[calc(56vh-2px)] w-auto max-w-full' : 'max-w-none')}
          />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {whole ? 'The whole page. Click the picture to go back to the button.' : 'Shown full size at the button. Scroll the picture to see more, or click it to see the whole page.'}
      </p>
    </div>
  );
}

/** Final Submit is the last save of the Admission Form, so the staff sees the values once more. */
export function ConfirmFinalModal() {
  const open = useApp((s) => s.ui.confirm === 'final');
  const form = useApp((s) => s.form);
  const pay = useApp((s) => s.siteData.payment);
  const was = (now: string, site: string | undefined) => (site !== undefined && now !== site ? `Changed from ${site || 'empty'}` : '');
  const rows: [string, string, string][] = [
    ['Financer', form.financer, was(form.financer, pay?.financer)],
    ...FEE_KEYS.map((k): [string, string, string] => [FEE_LABELS[k], form[k].trim(), pay?.fees[k].editable ? was(form[k].trim(), pay.fees[k].value) : '']),
  ];
  const typesFees = rows.slice(1).some(([, , note]) => note);
  return (
    <Modal
      open={open}
      onClose={() => setUi({ confirm: null })}
      title="Press Final Submit on the site?"
      icon={<Send className="h-5 w-5" />}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={() => setUi({ confirm: null })}>
            Go back
          </Button>
          <Button size="lg" onClick={() => void finalSubmit()}>
            Yes, Final Submit
          </Button>
        </>
      }
    >
      <p>
        This saves the whole Admission Form. The tool sets the Financer{typesFees ? ' and the fees you changed' : ''}, reads Payment Plan again, and presses
        Final Submit only if it shows these values.
      </p>
      <dl className="mt-4 divide-y divide-slate-200 rounded-sm border border-slate-300">
        {rows.map(([k, v, note]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-3.5 py-2">
            <dt className="text-slate-600">{k}</dt>
            <dd className="text-right">
              <span className={cx('font-semibold', v ? 'text-slate-900' : 'font-normal italic text-slate-500')}>{v || 'Empty on the site'}</span>
              {note && <span className="block text-xs text-amber-800">{note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-600">
        {typesFees ? 'The other fees stay as the site has them.' : 'The fees stay as the site has them; the tool does not change them.'} The tool never types a 0
        for you.
      </p>
    </Modal>
  );
}

export function ConfirmNewStudentModal() {
  const open = useApp((s) => s.ui.confirm === 'newStudent');
  const passport = useApp((s) => s.student?.passport ?? '');
  return (
    <Modal
      open={open}
      onClose={() => setUi({ confirm: null })}
      title={`Leave ${passport} and start a new student?`}
      icon={<AlertTriangle className="h-5 w-5" />}
      tone="amber"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={() => setUi({ confirm: null })}>
            Stay
          </Button>
          <Button size="lg" icon={<UserPlus className="h-4 w-4" />} onClick={clearStudent}>
            Start a new student
          </Button>
        </>
      }
    >
      <p>Not every step is done for this student. Anything already saved on the site stays saved, and the files stay in the student's folder.</p>
      <p className="mt-2">The steps that aren't done will have to be finished later, on the site or by starting this passport again.</p>
    </Modal>
  );
}
