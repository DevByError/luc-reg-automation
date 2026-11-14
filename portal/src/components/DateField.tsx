import { CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { isoToDmy, isoToWords, parseDmy, parseIso } from '../lib/format';
import { Field, cx } from './ui';

/**
 * Date box written the way the site's own box is written: yyyy-mm-dd (Passport Collection)
 * or dd/mm/yyyy (Admission Assistance). It can also be picked from the calendar, and it always
 * shows the date in words, so a swapped day and month is easy to spot.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  warning,
  siteFormat,
  extraHelp,
  tag,
  sentAs,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  warning?: ReactNode;
  siteFormat: 'iso' | 'dmy';
  extraHelp?: ReactNode;
  tag?: ReactNode;
  /** How the site's box writes the date, when it isn't written the way it is typed here. */
  sentAs?: (iso: string) => string;
}) {
  const iso = siteFormat === 'iso';
  const show = (v: string) => (iso ? v : isoToDmy(v));
  const parse = (t: string) => (iso ? parseIso(t) : parseDmy(t));
  const pattern = iso ? 'yyyy-mm-dd' : 'dd/mm/yyyy';
  const example = iso ? '2026-11-01' : '01/11/2026';

  const [text, setText] = useState(value ? show(value) : '');
  const [touched, setTouched] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // Follow changes made elsewhere (for example a date the site already had, or step 5's date filling step 6).
  useEffect(() => {
    if ((parse(text) ?? '') !== value) setText(value ? show(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handle = (t: string) => {
    setText(t);
    onChange(parse(t) ?? '');
  };

  const typedBad = touched && text.trim() !== '' && !parse(text);
  const shownError = typedBad ? `Type the date as ${pattern}, for example ${example}.` : value ? error : undefined;

  const help = value ? (
    <>
      Reads as <b className="font-semibold text-slate-900">{isoToWords(value)}</b>
      {(!iso || sentAs) && (
        <>
          {' '}
          · goes to the site as <b className="font-mono font-semibold text-slate-900">{sentAs ? sentAs(value) : isoToDmy(value)}</b>
        </>
      )}
      {extraHelp && <> · {extraHelp}</>}
    </>
  ) : (
    <>
      Format <b className="font-semibold text-slate-900">{pattern}</b>, as the site writes it, e.g. {example} – or use the calendar.
      {extraHelp && <> {extraHelp}</>}
    </>
  );

  const openPicker = () => {
    const el = picker.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.click();
    } catch {
      el.focus();
    }
  };

  return (
    <Field label={label} required={required} htmlFor={id} tag={tag} help={help} error={shownError} warning={shownError ? undefined : warning}>
      <div className="relative flex">
        <input
          id={id}
          className={cx('input rounded-r-none', iso && 'font-mono', shownError && 'input-invalid')}
          placeholder={pattern}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          disabled={disabled}
          aria-invalid={!!shownError || undefined}
          onChange={(e) => handle(e.target.value)}
          onBlur={() => {
            setTouched(true);
            const v = parse(text);
            if (v) setText(show(v));
          }}
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-sm border border-l-0 border-slate-400 bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
          aria-label={`Pick ${label} from a calendar`}
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
          value={value}
          onChange={(e) => {
            setTouched(true);
            handle(e.target.value ? show(e.target.value) : '');
          }}
        />
      </div>
    </Field>
  );
}
