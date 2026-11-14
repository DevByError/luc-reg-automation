import { useState } from 'react';
import type { SiteNeeds } from '../../shared/ops';
import { fillSiteNeeds } from '../state/actions';
import { busyKeyFor } from '../state/runner';
import { useApp } from '../state/store';
import type { StepId } from '../state/types';
import { Button, Field, Input, RadioGroup, Select } from './ui';

/** Saves the tool presses itself after the fields are filled; the others the staff presses. */
const TOOL_PRESSES = ['address', 'whatsapp', 'wechat', 'education'];

/** A choice the site lists more than once, as the tool names it: "Pakistan (2nd of 2 on the site)". */
const TWICE = / \(\d+(st|nd|rd|th) of \d+ on the site\)$/;

/**
 * The fields the site asked for when it refused a save, which the portal doesn't fill itself (an empty Country,
 * for example). The staff fills them here from the student's documents; the tool puts them on the site.
 */
export function SiteNeedsForm({ step, needs }: { step: StepId; needs: SiteNeeds }) {
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'siteNeeds')]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(needs.fields.map((f) => [f.key, f.value])));
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: string, v: string) => {
    setProblem(null);
    setValues((x) => ({ ...x, [key]: v }));
  };
  const one = needs.fields.length === 1;
  const button = needs.save === 'final' ? 'Final Submit' : 'Continue To Next';
  const then = TOOL_PRESSES.includes(needs.save) ? `then the tool presses ${button} again` : `then you press ${button} again`;
  const ready = needs.fields.every((f) => (values[f.key] ?? '').trim() !== '');

  return (
    <div data-site-needs className="mt-3 space-y-3 rounded-sm border border-red-200 bg-white p-3 text-slate-800">
      <p className="text-xs leading-relaxed text-slate-700">
        Fill {one ? 'it' : 'them'} here from the student's documents. The tool puts {one ? 'it' : 'them'} on {needs.tab} and reads{' '}
        {one ? 'it' : 'them'} back, {then}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {needs.fields.map((f, i) => {
          const id = `need-${step}-${i}`;
          const value = values[f.key] ?? '';
          // With one field the message above already gives the site's words.
          const words = /[a-z0-9]/i.test(f.said) ? f.said : '';
          // The site lists some choices twice; the portal shows each copy with its place on the site's list.
          const twice = f.kind === 'select' && f.options.some((o) => TWICE.test(o));
          const help = twice
            ? "The site lists some choices more than once. Each copy shows its place on the site's list: pick the one you would pick on the site."
            : !one && words
              ? `The site said: "${words}"`
              : f.value
                ? `The site shows "${f.value}" now.`
                : undefined;
          return (
            <Field key={f.key} label={f.label} required htmlFor={id} help={help}>
              {f.kind === 'select' ? (
                <Select id={id} options={f.options} placeholder={`Pick the ${f.label.toLowerCase()}`} value={value} onChange={(e) => set(f.key, e.target.value)} disabled={busy} />
              ) : f.kind === 'radio' ? (
                <RadioGroup name={id} label={f.label} options={f.options} value={value} onChange={(v) => set(f.key, v)} disabled={busy} />
              ) : f.kind === 'checkbox' ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    className="h-4 w-4 accent-blue-700"
                    checked={value === 'checked'}
                    onChange={(e) => set(f.key, e.target.checked ? 'checked' : '')}
                    disabled={busy}
                  />
                  Tick it
                </label>
              ) : (
                <Input id={id} type={f.kind === 'date' ? 'date' : 'text'} value={value} onChange={(e) => set(f.key, e.target.value)} disabled={busy} autoComplete="off" />
              )}
            </Field>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {problem && <span className="text-xs font-semibold text-red-700">{problem}</span>}
        <Button size="sm" disabled={!ready} loading={busy} loadingText="Filling on the site…" onClick={() => setProblem(fillSiteNeeds(step, values))}>
          Fill on the site
        </Button>
      </div>
    </div>
  );
}
