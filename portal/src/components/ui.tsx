import { AlertTriangle, CheckCircle2, ChevronDown, Info, XCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { forwardRef } from 'react';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ spinner */

export function Spinner({ className = 'h-4 w-4', label }: { className?: string; label?: string }) {
  return (
    <svg className={cx('shrink-0 animate-spin', className)} viewBox="0 0 24 24" fill="none" role={label ? 'status' : undefined} aria-label={label}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------- button */

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

/** Each variant's normal look, and its look when it can't be pressed. A busy button keeps its normal colour. */
const VARIANTS: Record<Variant, { base: string; off: string }> = {
  primary: {
    base: 'border-blue-700 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
    off: 'disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500',
  },
  secondary: {
    base: 'border-slate-400 bg-white text-slate-800 hover:bg-slate-100 active:bg-slate-200',
    off: 'disabled:border-slate-300 disabled:bg-white disabled:text-slate-400',
  },
  outline: {
    base: 'border-slate-400 bg-white text-slate-800 hover:bg-slate-100 active:bg-slate-200',
    off: 'disabled:border-slate-300 disabled:bg-white disabled:text-slate-400',
  },
  ghost: {
    base: 'border-transparent text-blue-700 hover:bg-blue-50 active:bg-blue-100',
    off: 'disabled:bg-transparent disabled:text-slate-400',
  },
  danger: {
    base: 'border-red-700 bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
    off: 'disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500',
  },
  success: {
    base: 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
    off: 'disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500',
  },
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-10 gap-2 px-5 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
}

/** While `loading`, the button shows a spinner and can't be pressed again. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, loadingText, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm border font-semibold transition-colors',
        VARIANTS[variant].base,
        loading ? 'cursor-wait' : cx('disabled:cursor-not-allowed', VARIANTS[variant].off),
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
});

/* ------------------------------------------------------------------- panels */

export function Card({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <section className={cx('card', className)} aria-label={label}>
      {children}
    </section>
  );
}

/** The grey title bar of a panel, with the step number in a solid box. */
export function PanelHeader({
  number,
  icon,
  title,
  subtitle,
  right,
}: {
  number?: number | string;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {(number !== undefined || icon) && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-blue-950 text-xs font-bold text-white">{icon ?? number}</span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6 text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0 pt-[3px]">{right}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- fields */

export function Field({
  label,
  required,
  optional,
  tag,
  help,
  error,
  warning,
  htmlFor,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  tag?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  warning?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-semibold text-slate-800">
        <span>
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
        {optional && <span className="text-xs font-normal text-slate-500">(optional)</span>}
        {tag}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-700">
          <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : warning ? (
        <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{warning}</span>
        </p>
      ) : help ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{help}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cx('input', invalid && 'input-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export function Select({
  options,
  placeholder,
  invalid,
  className,
  value,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: string[]; placeholder?: string; invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cx('input appearance-none pr-8', !value && 'text-slate-500', invalid && 'input-invalid', className)}
        value={value}
        {...rest}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o, i) => (
          <option key={`${i}:${o}`} value={o} className="text-slate-900">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
    </div>
  );
}

/** A tick-one list, as the site shows it: each choice with a round tick box. */
export function RadioGroup({
  name,
  label,
  options,
  value,
  onChange,
  onFocus,
  disabled,
}: {
  name: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-sm border border-slate-400 bg-white px-2.5 py-1.5',
        disabled && 'border-slate-300 bg-slate-100',
      )}
    >
      {options.map((o, i) => (
        <label key={`${i}:${o}`} className={cx('inline-flex items-center gap-1.5 text-sm text-slate-900', disabled ? 'cursor-not-allowed text-slate-600' : 'cursor-pointer')}>
          <input
            id={i === 0 ? name : undefined}
            type="radio"
            name={name}
            value={o}
            checked={value === o}
            onChange={() => onChange(o)}
            onFocus={onFocus}
            disabled={disabled}
            className="h-4 w-4 shrink-0 accent-blue-700"
          />
          <span>{o}</span>
        </label>
      ))}
      {options.length === 0 && <span className="text-sm text-slate-500">The site offered no choices</span>}
    </div>
  );
}

/** A value read from the site that the staff can't change here. */
export function ReadValue({ value, mono, empty = 'Empty on the site' }: { value?: string; mono?: boolean; empty?: string }) {
  return (
    <div
      className={cx(
        'flex min-h-9 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-sm',
        value ? 'text-slate-900' : 'italic text-slate-500',
        mono && 'font-mono',
      )}
    >
      <span className="min-w-0 break-words">{value || empty}</span>
    </div>
  );
}

/** Label and value pairs as a two-column table, like the details of a record. */
export function DetailTable({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('divide-y divide-slate-200 rounded-sm border border-slate-300 text-sm', className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(112px,32%)_minmax(0,1fr)]">
          <dt className="border-r border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">{k}</dt>
          <dd className="min-w-0 break-words px-3 py-2 font-semibold text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------------- small bits */

type Tone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'navy';

/** Solid status labels. */
const BADGE: Record<Tone, string> = {
  green: 'bg-emerald-600 text-white',
  blue: 'bg-blue-600 text-white',
  amber: 'bg-amber-300 text-amber-950',
  red: 'bg-red-600 text-white',
  slate: 'bg-slate-200 text-slate-700',
  navy: 'bg-blue-950 text-white',
};

export function Badge({ tone = 'slate', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-[3px] text-[11px] font-bold uppercase leading-none tracking-[0.02em]',
        BADGE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const ALERT: Record<'info' | 'success' | 'warning' | 'error', { box: string; icon: ReactNode }> = {
  info: { box: 'border-blue-300 border-l-blue-600 bg-blue-50', icon: <Info className="h-4 w-4 text-blue-700" /> },
  success: { box: 'border-emerald-300 border-l-emerald-600 bg-emerald-50', icon: <CheckCircle2 className="h-4 w-4 text-emerald-700" /> },
  warning: { box: 'border-amber-300 border-l-amber-500 bg-amber-50', icon: <AlertTriangle className="h-4 w-4 text-amber-700" /> },
  error: { box: 'border-red-300 border-l-red-600 bg-red-50', icon: <XCircle className="h-4 w-4 text-red-700" /> },
};

/** A message bar: tinted, with a solid edge on the left. */
export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  icon,
  className,
}: {
  tone?: keyof typeof ALERT;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cx('flex gap-2.5 rounded-sm border border-l-4 px-3.5 py-2.5', ALERT[tone].box, className)}>
      <div className="mt-0.5 shrink-0">{icon ?? ALERT[tone].icon}</div>
      <div className="min-w-0 flex-1 text-[13px]">
        {title && <div className="font-semibold text-slate-900">{title}</div>}
        {children && <div className={cx('leading-relaxed text-slate-700', !!title && 'mt-0.5')}>{children}</div>}
        {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

/** Lists what is still missing before a staff button can be pressed. */
export function MissingList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-xs leading-relaxed text-slate-600">
      <span className="font-semibold text-slate-800">Still needed: </span>
      {items.join(' · ')}
    </p>
  );
}
