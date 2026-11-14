import { CheckCircle2, FileSearch, ListChecks, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { RegRow } from '../../../shared/ops';
import { isoToDmy, removeSpaces } from '../../lib/format';
import { changeLuc, chooseRegRowAgain, pickRegRow, regRowNumber, saveLuc } from '../../state/actions';
import { busyKeyFor } from '../../state/runner';
import { setForm, showDoc, useApp } from '../../state/store';
import { Badge, Button, DetailTable, Field, Input } from '../ui';
import { FieldsLoading, StepShell, SubHeading } from './StepShell';

/** The row's photo as the list shows it, small, or a plain box when the row has none. */
function RowPhoto({ row, n }: { row: RegRow; n: number }) {
  const sl = regRowNumber(row) || String(n + 1);
  if (row.photo) return <img src={row.photo} alt={`Photo in row ${sl}`} className="h-16 w-12 rounded-sm border border-slate-300 bg-white object-cover" />;
  return (
    <span className="inline-flex h-16 w-12 items-center justify-center rounded-sm border border-dashed border-slate-400 bg-slate-50 px-1 text-center text-[10px] leading-tight text-slate-600">
      No photo
    </span>
  );
}

/**
 * More than one row of the Registration Forms list matches the passport (the same registration can be on it twice).
 * The staff presses Use this row on the right one; the tool prints only that row and carries on as usual.
 */
function RegRowPicker({ rows }: { rows: RegRow[] }) {
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'step1')]);
  const inUse = useApp((s) => s.siteData.regRow?.id);
  const pdfReady = useApp((s) => s.docs.registration.status === 'ready');
  const [error, setError] = useState<string | null>(null);
  const headers = rows[0].shown.map(([h]) => h);
  return (
    <div className="space-y-2">
      <SubHeading
        title="Choose the student's row"
        note={`${rows.length} rows on the Registration Forms list match the passport. They can look the same: compare Sl No and the photo.`}
        right={
          inUse && pdfReady ? (
            <Button variant="ghost" size="sm" onClick={() => chooseRegRowAgain(false)} disabled={busy}>
              Keep the row in use
            </Button>
          ) : undefined
        }
      />
      <div className="overflow-x-auto rounded-sm border border-slate-300">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-300 bg-slate-100 text-slate-700">
            <tr>
              <th className="px-2.5 py-1.5">
                <span className="sr-only">Use</span>
              </th>
              <th className="whitespace-nowrap px-2.5 py-1.5 font-semibold">Photo</th>
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {rows.map((r, n) => {
              const sl = regRowNumber(r);
              const used = inUse === r.id;
              return (
                <tr key={`${r.id}-${n}`} className={used ? 'bg-blue-50' : undefined}>
                  {/* The button comes first, so it shows without scrolling the table sideways. */}
                  <td className="px-2.5 py-1.5 align-top">
                    <div className="flex flex-col items-start gap-1.5">
                      <Button
                        size="sm"
                        variant={used ? 'primary' : 'outline'}
                        disabled={busy || used}
                        aria-label={sl ? `Use the row with Sl No ${sl}` : `Use row ${n + 1}`}
                        onClick={() => setError(pickRegRow(n))}
                        className="whitespace-nowrap"
                      >
                        Use this row
                      </Button>
                      {used && <Badge tone="blue">In use now</Badge>}
                    </div>
                  </td>
                  <td className="px-2.5 py-1.5 align-top">
                    <RowPhoto row={r} n={n} />
                  </td>
                  {headers.map((h) => (
                    <td key={h} className="px-2.5 py-1.5 align-top">
                      {r.shown.find(([x]) => x === h)?.[1] ?? ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-slate-600">
        <ListChecks className="mt-px h-3.5 w-3.5 shrink-0 text-blue-700" />
        The tool opens Print for the row you choose only, saves its registration form, and carries on as usual.
        {inUse && pdfReady && " The form saved from the row in use stays in the student's folder; the new one is saved next to it."}
      </p>
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function Step1() {
  const reg = useApp((s) => s.siteData.regRow);
  const regRows = useApp((s) => s.siteData.regRows);
  const choosing = useApp((s) => !!s.siteData.regChoosing);
  const step1Busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'step1')]);
  const status = useApp((s) => s.steps[1].status);
  const luc = useApp((s) => s.form.luc);
  const lucSaved = useApp((s) => s.form.lucSaved);
  const profileSaved = useApp((s) => !!s.saves.profile);
  const englishBusy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'english')]);
  const pdfReady = useApp((s) => s.docs.registration.status === 'ready');

  const cleaned = removeSpaces(luc);
  const warning = cleaned && !/^LUC\d+$/i.test(cleaned) ? 'LUC numbers usually look like LUC0000123. Check what you pasted.' : undefined;

  return (
    <StepShell step={1}>
      <div className="space-y-3">
        <SubHeading
          title="Your part: copy the LUC number"
          note="Used to find the English certificate (step 2) and checked on Admission Assistance (step 6)."
          right={
            <Button variant="ghost" size="sm" icon={<FileSearch className="h-3.5 w-3.5" />} onClick={() => showDoc('registration', 1)}>
              Show page 1
            </Button>
          }
        />
        {lucSaved ? (
          <div className="flex flex-col gap-3 rounded-sm border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <div className="text-xs font-semibold text-emerald-800">LUC Application number saved</div>
                <div className="text-lg font-semibold tracking-wide text-slate-900">{lucSaved}</div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={changeLuc}
              disabled={profileSaved || englishBusy}
              title={profileSaved ? 'Step 2 is already saved with this number.' : englishBusy ? 'Wait until the certificate search ends.' : undefined}
            >
              Change
            </Button>
          </div>
        ) : (
          <Field
            label="LUC Application number"
            required
            htmlFor="luc"
            warning={warning}
            help={
              <>
                Copy it from the <b className="font-semibold text-slate-900">For official use only</b> box on page 1 of the PDF. Stray spaces
                are removed. {!pdfReady && 'The PDF is still on its way.'}
              </>
            }
          >
            <form
              className="flex"
              onSubmit={(e) => {
                e.preventDefault();
                if (cleaned) saveLuc();
              }}
            >
              <Input
                id="luc"
                value={luc}
                onChange={(e) => setForm({ luc: e.target.value })}
                placeholder="LUC0000000"
                autoComplete="off"
                spellCheck={false}
                className="rounded-r-none font-semibold tracking-wide"
                onFocus={() => showDoc('registration', 1, false)}
              />
              <Button type="submit" className="-ml-px rounded-l-none px-5" disabled={!cleaned}>
                Save
              </Button>
            </form>
          </Field>
        )}
        <p className="text-xs text-slate-600">
          The same box shows the <b className="font-semibold text-slate-900">EMGS Approval Type</b>, which you need for Student Type in step 2.
        </p>
      </div>
      {regRows && regRows.length > 1 && (choosing || !reg) ? (
        <RegRowPicker rows={regRows} />
      ) : reg ? (
        <div className="space-y-3">
          <SubHeading
            title="Found on the Registration Forms list"
            note={
              regRows && regRows.length > 1
                ? `You chose this row from the ${regRows.length} that match the passport.`
                : "Exactly one row matched the passport. Check it's the right student."
            }
            right={
              regRows && regRows.length > 1 && !lucSaved ? (
                <Button variant="ghost" size="sm" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={() => chooseRegRowAgain()} disabled={step1Busy}>
                  Choose a different row
                </Button>
              ) : undefined
            }
          />
          <DetailTable
            rows={[
              ...(regRows && regRows.length > 1 && regRowNumber(reg) ? ([['Sl No', regRowNumber(reg)]] as [string, string][]) : []),
              ['Name', reg.name],
              ['Application ID', reg.applicationId],
              ['Course name', reg.course],
              ['Apply date', isoToDmy(reg.applyDate)],
            ]}
          />
        </div>
      ) : status !== 'error' ? (
        <FieldsLoading label="Searching the Registration Forms list…" rows={1} />
      ) : null}

    </StepShell>
  );
}
