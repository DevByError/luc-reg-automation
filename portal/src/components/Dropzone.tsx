import { CheckCircle2, FileImage, FileText, RefreshCw, Upload, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { fileSize } from '../lib/format';
import { Button, Spinner, cx } from './ui';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** The words in the box, for what is being added. */
export interface DropzoneTexts {
  /** "Click to choose a file or drag … here" */
  what: string;
  /** Shown when more than one file is dropped. */
  oneOnly: string;
  /** The line under it: types, size, what happens next. */
  note: string;
  label: string;
}

const VISA_TEXTS: DropzoneTexts = {
  what: 'the visa page',
  oneOnly: 'Drop one file only: the scan of the visa page.',
  note: 'PDF, JPG or PNG · up to 10 MB · the file uploads immediately in the background',
  label: 'Add the scan of the visa page',
};

/** The Upload Visa Page box, as on Admission Assistance. Checks type and size before anything goes up. */
export function Dropzone({
  onFile,
  file,
  uploading,
  uploaded,
  failed,
  disabled,
  locked,
  texts = VISA_TEXTS,
}: {
  onFile: (f: File) => string | null;
  file?: { name: string; size: number; type: string };
  uploading: boolean;
  uploaded: boolean;
  failed: boolean;
  disabled?: boolean;
  locked?: boolean;
  texts?: DropzoneTexts;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setError(texts.oneOnly);
      return;
    }
    setError(onFile(files[0]));
  };

  const choose = () => {
    if (disabled || uploading || locked) return;
    input.current?.click();
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      className="hidden"
      aria-label={texts.label}
      onChange={(e) => {
        take(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    return (
      <div>
        {picker}
        <div
          className={cx(
            'flex flex-col gap-3 rounded-sm border px-3.5 py-2.5 sm:flex-row sm:items-center',
            failed ? 'border-red-300 bg-red-50' : uploaded ? 'border-emerald-300 bg-emerald-50' : 'border-blue-300 bg-blue-50',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600">
              {isPdf ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-600">{fileSize(file.size)}</span>
                <span className="text-slate-400">·</span>
                {uploading ? (
                  <span className="flex items-center gap-1 font-semibold text-blue-800">
                    <Spinner className="h-3 w-3" /> Uploading to the site…
                  </span>
                ) : failed ? (
                  <span className="flex items-center gap-1 font-semibold text-red-700">
                    <XCircle className="h-3.5 w-3.5" /> Didn't finish
                  </span>
                ) : uploaded ? (
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded. It shows on the left.
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {!locked && (
            <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={choose} disabled={uploading || disabled}>
              {failed ? 'Choose again' : 'Replace'}
            </Button>
          )}
        </div>
        {error && <p className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {picker}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={choose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) take(e.dataTransfer.files);
        }}
        className={cx(
          'flex min-h-[120px] flex-col items-center justify-center rounded-sm border-2 border-dashed px-4 py-6 text-center transition-colors',
          disabled
            ? 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400'
            : drag
              ? 'cursor-copy border-blue-600 bg-blue-50'
              : 'cursor-pointer border-slate-400 bg-slate-50 hover:border-blue-600 hover:bg-blue-50',
        )}
      >
        <Upload className={cx('h-6 w-6', disabled ? 'text-slate-400' : 'text-slate-600')} />
        <p className="mt-2 text-sm text-slate-800">
          <span className={cx('font-semibold underline underline-offset-2', disabled ? 'text-slate-400' : 'text-blue-700')}>Click to choose a file</span> or
          drag {texts.what} here
        </p>
        <p className="mt-1 text-xs text-slate-600">{texts.note}</p>
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
