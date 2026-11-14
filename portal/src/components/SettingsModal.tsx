import { Check, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { connectTool, sendSettingsToTool, stopToolWatch } from '../state/siteWindow';
import { patch, setUi, storeSettings, toast, useApp } from '../state/store';
import type { Mode } from '../state/types';
import { Modal } from './Modals';
import { Button, Field, Input, cx } from './ui';

function Choice({ on, title, text, onClick, disabled }: { on: boolean; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cx(
        'flex w-full items-start gap-2.5 rounded-sm border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        on ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-white hover:bg-slate-50',
      )}
    >
      <span
        className={cx(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
          on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-500 bg-white',
        )}
      >
        {on && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">{title}</span>
        <span className="block text-xs leading-relaxed text-slate-600">{text}</span>
      </span>
    </button>
  );
}

export function SettingsModal() {
  const open = useApp((s) => s.ui.settingsOpen);
  const settings = useApp((s) => s.settings);
  const hasStudent = useApp((s) => !!s.student);
  const [root, setRoot] = useState(settings.filesRoot);
  const [reason, setReason] = useState(settings.accessReason);
  const [mode, setMode] = useState<Mode>(settings.mode);
  const [watchMode, setWatchMode] = useState(settings.watchMode);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRoot(settings.filesRoot);
      setReason(settings.accessReason);
      setMode(settings.mode);
      setWatchMode(settings.watchMode);
    }
  }, [open, settings]);

  const rootError = !root.trim()
    ? 'Type a folder.'
    : !/^[a-zA-Z]:\\/.test(root.trim()) && !root.trim().startsWith('\\\\')
      ? 'Use a full Windows folder, for example E:\\Registration system\\students.'
      : undefined;
  const reasonError = reason.trim() ? undefined : 'Type a reason. Any text works on the site.';
  const close = () => setUi({ settingsOpen: false });

  const save = async () => {
    if (rootError || reasonError) return;
    setSaving(true);
    const before = settings.mode;
    const next = { filesRoot: root.trim(), accessReason: reason.trim(), mode: hasStudent ? before : mode, watchMode };
    storeSettings(next);
    patch({ settings: next });
    if (next.mode === 'live') await sendSettingsToTool();
    if (next.mode !== before) {
      if (next.mode === 'live') void connectTool();
      else stopToolWatch();
    }
    setSaving(false);
    close();
    toast(next.mode !== before ? (next.mode === 'live' ? 'Live mode: the portal works on online.lincoln.edu.my.' : 'Sample mode: made-up data only.') : 'Settings saved.', 'success');
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : close}
      title="Settings"
      icon={<Settings className="h-5 w-5" />}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button size="lg" onClick={() => void save()} loading={saving} loadingText="Saving…" disabled={!!rootError || !!reasonError}>
            Save settings
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-1">
        <Field
          label="Students folder"
          required
          htmlFor="files-root"
          error={rootError}
          help="Each student gets a folder inside it, named by the passport number. Applies from the next file saved."
        >
          <Input id="files-root" value={root} onChange={(e) => setRoot(e.target.value)} className="font-mono" spellCheck={false} />
        </Field>
        <Field
          label="Access reason (step 4)"
          required
          htmlFor="access-reason"
          error={reasonError}
          help="Typed into the Student Files reason box. Any text works there; a real word keeps the site's access log readable."
        >
          <Input id="access-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-slate-800">Watch mode</div>
          <Choice
            on={watchMode}
            title="Show me each press first"
            text="Before the tool presses a button that saves on the site, it outlines that button in red, shows you a picture of the site page here in the portal, and waits for your OK. Keep it on for the first students."
            onClick={() => setWatchMode(!watchMode)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-slate-800">Mode</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice
              on={mode === 'live'}
              title="Live"
              text="Works on online.lincoln.edu.my in the site window."
              onClick={() => setMode('live')}
              disabled={hasStudent}
            />
            <Choice
              on={mode === 'sample'}
              title="Sample (practice)"
              text="Made-up data only. Nothing goes to the site."
              onClick={() => setMode('sample')}
              disabled={hasStudent}
            />
          </div>
          {hasStudent && <p className="text-xs text-slate-600">Finish or close the current student to switch the mode.</p>}
        </div>

        <p className="text-xs text-slate-600">
          Settings are kept in this browser on this computer. No student data is kept here; it lives only in the student folders.
        </p>
      </div>
    </Modal>
  );
}
