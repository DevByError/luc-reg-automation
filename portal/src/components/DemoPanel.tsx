import { Check, FlaskConical, ImagePlus, RotateCcw, Sparkles, WifiOff, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNow } from '../lib/useNow';
import { addEnglishFile, addStampFile, fillSampleValues, resetDemo } from '../state/actions';
import { setUi, toast, useApp } from '../state/store';
import { SAMPLE_FILES, demo } from '../mock/site';
import type { DemoState } from '../mock/site';
import { useStore } from '../lib/store';
import { Button, cx } from './ui';

const setDemo = (p: Partial<DemoState>) => demo.set((s) => ({ ...s, ...p }));

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-slate-400">
      {options.map(([v, label], i) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cx(
            'h-8 flex-1 px-2 text-xs font-semibold transition-colors',
            i > 0 && 'border-l border-slate-400',
            value === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Group({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
        {help && <p className="text-xs leading-relaxed text-slate-600">{help}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-sm border px-3 py-2 text-left text-[13px] transition-colors',
        on ? 'border-blue-600 bg-blue-50 text-slate-900' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
      )}
      aria-pressed={on}
    >
      <span
        className={cx(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
          on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-500 bg-white',
        )}
      >
        {on && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** Test controls for sample mode: make the pretend site slow, drop the network, log the staff out, and so on. */
export function DemoPanel() {
  const open = useApp((s) => s.ui.demoOpen);
  const hasStudent = useApp((s) => !!s.student);
  const d = useStore(demo, (s) => s);
  const now = useNow(open && d.offlineUntil > Date.now());
  const offlineLeft = Math.max(0, Math.ceil((d.offlineUntil - now) / 1000));
  const [loadingStamp, setLoadingStamp] = useState(false);
  const [loadingEnglish, setLoadingEnglish] = useState(false);

  if (!open) return null;
  const close = () => setUi({ demoOpen: false });

  const useSampleStamp = async () => {
    setLoadingStamp(true);
    try {
      const res = await fetch(SAMPLE_FILES.stamp);
      const blob = await res.blob();
      const problem = addStampFile(new File([blob], 'sample-stamp-scan.png', { type: 'image/png' }));
      if (problem) toast(problem, 'warning');
    } catch {
      toast("Couldn't load the sample scan.", 'error');
    } finally {
      setLoadingStamp(false);
    }
  };

  const useSampleEnglish = async () => {
    setLoadingEnglish(true);
    try {
      const res = await fetch(SAMPLE_FILES.english);
      const blob = await res.blob();
      const problem = addEnglishFile(new File([blob], 'sample-english-certificate.pdf', { type: 'application/pdf' }));
      if (problem) toast(problem, 'warning');
    } catch {
      toast("Couldn't load the sample certificate.", 'error');
    } finally {
      setLoadingEnglish(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={close} role="presentation">
      <aside
        className="flex h-full w-full max-w-[380px] animate-slide-in flex-col border-l border-slate-400 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        aria-label="Sample mode controls"
      >
        <div className="flex items-start gap-2.5 border-b border-slate-300 border-t-4 border-t-amber-400 bg-slate-50 px-5 py-3">
          <FlaskConical className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-slate-900">Test controls</h2>
            <p className="text-xs leading-relaxed text-slate-600">
              No real site is connected. These controls make the pretend site misbehave, so every waiting and error screen can be checked.
            </p>
          </div>
          <button type="button" onClick={close} className="rounded-sm p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <Group title="Site speed">
            <Segmented
              value={d.speed}
              options={[
                ['normal', 'Normal'],
                ['slow', 'Slow'],
                ['very-slow', 'Very slow'],
              ]}
              onChange={(speed) => setDemo({ speed })}
            />
          </Group>

          <Group title="Network" help="Reading retries by itself. A save that loses its answer is checked, never repeated blindly.">
            <Button
              variant="outline"
              className="w-full"
              icon={<WifiOff className="h-4 w-4" />}
              onClick={() => setDemo({ offlineUntil: Date.now() + 20_000 })}
              disabled={offlineLeft > 0}
            >
              {offlineLeft > 0 ? `Network is down: back in ${offlineLeft}s` : 'Drop the network for 20 seconds'}
            </Button>
            <Toggle on={d.failNext} label="Next site request gets no answer" onClick={() => setDemo({ failNext: !d.failNext })} />
            <div className="pt-1 text-xs font-semibold text-slate-700">Next save</div>
            <Segmented
              value={d.nextSave}
              options={[
                ['normal', 'Saves normally'],
                ['lost-before', 'Lost, not saved'],
                ['lost-after', 'Saved, answer lost'],
              ]}
              onChange={(nextSave) => setDemo({ nextSave })}
            />
          </Group>

          <Group title="Site behaviour">
            <Toggle on={d.loggedOut} label="Site logs you out (noticed on the next request)" onClick={() => setDemo({ loggedOut: !d.loggedOut })} />
            <Toggle on={d.popupNext} label="Unknown popup after the next save" onClick={() => setDemo({ popupNext: !d.popupNext })} />
            <Toggle on={d.mismatchNext} label="Next read-back shows a different value" onClick={() => setDemo({ mismatchNext: !d.mismatchNext })} />
            <Toggle
              on={d.englishMissing}
              label="No English certificate on the site (step 2 asks you to add it)"
              onClick={() => setDemo({ englishMissing: !d.englishMissing })}
            />
            <Toggle
              on={d.multiLuc}
              label="Student has more than one LUC ID (step 5 asks which row)"
              onClick={() => setDemo({ multiLuc: !d.multiLuc })}
            />
            <Toggle
              on={d.needsCountry}
              label="Student left Country empty (step 2 asks you to fill it)"
              onClick={() => setDemo({ needsCountry: !d.needsCountry })}
            />
          </Group>

          <Group title="Stage in step 5" help={'When the stage shows "No data found", step 5 asks you to press Submit again.'}>
            <Segmented
              value={d.stageNoData}
              options={[
                ['off', 'Moves normally'],
                ['before', 'No data found'],
                ['after', 'Empty after Update'],
              ]}
              onChange={(stageNoData) => setDemo({ stageNoData })}
            />
          </Group>

          <Group
            title="English result in step 3"
            help={'After Final Submit. "ID not found" and "Upload refused" happen once, so the next try works.'}
          >
            <Segmented
              value={d.englishResult}
              options={[
                ['normal', 'Works'],
                ['notfound', 'ID not found'],
                ['tab', 'Own tab'],
                ['refuse', 'Upload refused'],
              ]}
              onChange={(englishResult) => setDemo({ englishResult })}
            />
          </Group>

          <Group title="Next student" help="Applies when you press Start.">
            <Segmented
              value={d.searchResult}
              options={[
                ['one', 'Found'],
                ['none', 'Not found'],
                ['two', 'Two rows'],
              ]}
              onChange={(searchResult) => setDemo({ searchResult })}
            />
            <Toggle on={d.odl} label="Student is ODL (extra popups in step 2)" onClick={() => setDemo({ odl: !d.odl })} />
          </Group>

          <Group title="Shortcuts">
            <Button variant="outline" className="w-full" icon={<Sparkles className="h-4 w-4" />} onClick={fillSampleValues} disabled={!hasStudent}>
              Fill the staff fields with sample values
            </Button>
            <Button
              variant="outline"
              className="w-full"
              icon={<ImagePlus className="h-4 w-4" />}
              loading={loadingStamp}
              loadingText="Loading the sample scan…"
              onClick={() => void useSampleStamp()}
              disabled={!hasStudent}
            >
              Use the sample stamp scan in step 6
            </Button>
            <Button
              variant="outline"
              className="w-full"
              icon={<ImagePlus className="h-4 w-4" />}
              loading={loadingEnglish}
              loadingText="Loading the sample certificate…"
              onClick={() => void useSampleEnglish()}
              disabled={!hasStudent}
            >
              Add the sample English certificate in step 2
            </Button>
          </Group>
        </div>

        <div className="border-t border-slate-300 bg-slate-50 px-5 py-3">
          <Button variant="secondary" className="w-full" icon={<RotateCcw className="h-4 w-4" />} onClick={resetDemo}>
            Reset sample mode
          </Button>
        </div>
      </aside>
    </div>
  );
}
