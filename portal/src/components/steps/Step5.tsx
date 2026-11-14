import { CheckCircle2, Clock3, ExternalLink, Eye, FileSearch, ListChecks, Lock, RefreshCw, Send, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { StageRows } from '../../../shared/ops';
import { isoToDmy, tidySpaces } from '../../lib/format';
import {
  PASSPORT_TYPE_DEFAULT,
  REMARKS_DEFAULT,
  STAGE_REMARK,
  closeStagePage,
  pickStageRow,
  revealStagePage,
  setExpiryDate,
  setIssueDate,
  showStagePage,
  stageDoneByStaff,
  stageRowHas,
  stageRowId,
  submitAgain,
  submitCollection,
  updateStageRowFromPage,
} from '../../state/actions';
import { busyKeyFor } from '../../state/runner';
import { app, setForm, showDoc, useApp, useAppList } from '../../state/store';
import type { RetryKey } from '../../state/types';
import {
  collectionMissing,
  expiryDateError,
  expiryWarning,
  issueDateError,
} from '../../state/validation';
import { PrintButton } from '../DocumentPanel';
import { DateField } from '../DateField';
import { Alert, Badge, Button, Field, Input, MissingList, ReadValue, Select, Spinner } from '../ui';
import { FieldsLoading, StepShell, SubHeading } from './StepShell';

/**
 * Where a value comes from: the site already had it ("From the site"), the portal's default ("Default"),
 * or the staff changed it ("Changed"). Nothing for a value the staff typed into an empty field.
 */
function SiteTag({ value, site, def }: { value: string; site?: string; def?: string }) {
  if (!value) return null;
  if (site) return value === site ? <Badge tone="slate">From the site</Badge> : <Badge tone="amber">Changed</Badge>;
  if (def !== undefined) return value === def ? <Badge tone="slate">Default</Badge> : <Badge tone="amber">Changed</Badge>;
  return null;
}

function ValStatus() {
  const doc = useApp((s) => s.docs.val);
  if (doc.status === 'ready')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> VAL letter ready on the left
      </span>
    );
  if (doc.status === 'loading')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-blue-800">
        <Spinner className="h-3 w-3" /> Getting the VAL letter…
      </span>
    );
  if (doc.status === 'error')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5" /> The VAL letter didn't arrive
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-slate-600">
      <Clock3 className="h-3.5 w-3.5" /> VAL letter waits for step 4's documents tab
    </span>
  );
}

/** Columns worth showing from the stage list: not the row number, the tick box or the history link, and not empty ones. */
function stageColumns(list: StageRows): number[] {
  return list.headers
    .map((_, i) => i)
    .filter((i) => !/^(s\.?\s*no\.?|sl\.?\s*no\.?|no\.?|#|select|update history)$/i.test(list.headers[i].trim()))
    .filter((i) => list.rows.some((r) => (r.cells[i] ?? '').trim() !== ''));
}

/**
 * A student with more than one LUC ID (an earlier foundation or diploma) has a row for each on the stage.
 * The staff presses the row for this registration; the tool does the rest as for one row.
 */
function StageRowPicker({ list }: { list: StageRows }) {
  const pick = useApp((s) => s.siteData.stagePick);
  const busy = useApp((s) => ['afterSubmit', 'resubmit', 'stageView'].some((k) => s.busy[busyKeyFor(s.runId, k as RetryKey)]));
  const luc = useApp((s) => s.form.lucSaved);
  const studentId = useApp((s) => s.siteData.fileRow?.studentId);
  const [error, setError] = useState<string | null>(null);
  const cols = stageColumns(list);
  return (
    <div className="space-y-1.5 px-3.5 py-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
        <ListChecks className="h-4 w-4 text-blue-700" /> Choose the student's row
      </div>
      <p className="text-xs leading-relaxed text-slate-600">
        The student has a row for each LUC ID, for example an earlier foundation or diploma. Press <b>Use this row</b> on this registration's
        row: the tool writes <span className="font-mono text-slate-900">{STAGE_REMARK}</span> in its Remark box, ticks Select on that row only,
        and presses Update.
      </p>
      <div className="overflow-x-auto rounded-sm border border-slate-300">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-300 bg-slate-100 text-slate-700">
            <tr>
              {cols.map((i) => (
                <th key={i} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                  {list.headers[i]}
                </th>
              ))}
              <th className="px-2.5 py-1.5">
                <span className="sr-only">Use</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {list.rows.map((r, n) => {
              const id = stageRowId(r.details);
              const chosen = !!pick && pick === r.details;
              const sameLuc = stageRowHas(r.details, luc);
              const sameId = !sameLuc && stageRowHas(r.details, studentId);
              return (
                <tr key={n} className={chosen ? 'bg-blue-50' : undefined}>
                  {cols.map((i) => (
                    <td key={i} className="whitespace-pre-line px-2.5 py-1.5 align-top">
                      {r.cells[i] ?? ''}
                    </td>
                  ))}
                  <td className="px-2.5 py-1.5 text-right align-top">
                    <div className="flex flex-col items-end gap-1.5">
                      <Button
                        size="sm"
                        variant={chosen ? 'primary' : 'outline'}
                        disabled={busy}
                        aria-label={id ? `Use the row with Student ID ${id}` : `Use row ${n + 1}`}
                        onClick={() => setError(pickStageRow(n))}
                      >
                        Use this row
                      </Button>
                      {chosen && <Badge tone="blue">You chose it</Badge>}
                      {sameLuc && <Badge tone="green">Same LUC number as step 1</Badge>}
                      {sameId && <Badge tone="green">Same Student ID as step 4</Badge>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

const STAGE_NAME = 'Passport Received From Student';

/**
 * Passport Movement Stages as the site shows it, inside the portal: for when the tool couldn't update the stage, even
 * after Submit again. The staff can look at any stage, and update the student's row on "Passport Received From Student".
 */
function StagePage() {
  const open = useApp((s) => !!s.siteData.stagePageOpen);
  const view = useApp((s) => s.siteData.stageView);
  const error = useApp((s) => s.siteData.stageViewError);
  const loading = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'stageView')]);
  const working = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'afterSubmit')] || !!s.busy[busyKeyFor(s.runId, 'resubmit')]);
  const again = useApp((s) => !!s.saves.collectionAgain);
  const updated = useApp((s) => !!s.saves[s.saves.collectionAgain ? 'stageAgain' : 'stage']);
  const confirmed = useApp((s) => !!s.siteData.stageConfirmed);
  const passport = useApp((s) => s.student?.passport ?? '');
  const live = useApp((s) => s.settings.mode === 'live');
  const [msg, setMsg] = useState<string | null>(null);
  if (!open || confirmed) return null;
  const off = loading || working;
  const onStudentStage = view?.stage === STAGE_NAME;
  const list: StageRows | null = view && view.rows.length ? { headers: view.headers, rows: view.rows, picked: false, empty: '' } : null;
  const cols = list ? stageColumns(list) : [];
  return (
    <section id="stage-page" aria-label="The stage page" className="scroll-mt-20 rounded-sm border border-blue-300">
      <div className="flex items-start justify-between gap-2 border-b border-blue-200 bg-blue-50 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">The stage page, as the site shows it</div>
          <p className="text-xs leading-relaxed text-slate-600">
            Passport Movement Stages, with {passport || "the student"}'s rows only. Nothing changes on the site until you press a button below that says so.
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => closeStagePage()} className="shrink-0">
          Close
        </Button>
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Stage" htmlFor="stagePageStage" className="min-w-[240px] flex-1">
            <Select
              id="stagePageStage"
              options={view?.stages ?? []}
              placeholder={view ? undefined : 'Reading the site…'}
              value={view?.stage ?? ''}
              disabled={off || !view}
              onChange={(e) => {
                setMsg(null);
                void showStagePage(e.target.value);
              }}
            />
          </Field>
          <Button
            variant="outline"
            icon={<RefreshCw className="h-4 w-4" />}
            loading={loading}
            loadingText="Reading…"
            disabled={working}
            onClick={() => {
              setMsg(null);
              void showStagePage(view?.stage, true);
            }}
            title="Chooses another stage and comes back, as you would on the site, so the site shows the list again. Nothing is done on the other stage."
          >
            Refresh
          </Button>
        </div>
        {loading && !view ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Spinner className="h-3.5 w-3.5 text-blue-600" /> Reading the stage from the site…
          </div>
        ) : error ? (
          <Alert tone="error" title="Couldn't read the stage page">
            {error} Press Refresh to read it again.
          </Alert>
        ) : !view ? null : view.empty ? (
          <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-slate-800">
            <b className="font-semibold">"{view.stage}"</b> on the site says: <span className="italic">{view.empty}</span>
          </div>
        ) : !list ? (
          <p className="text-xs text-slate-700">
            No row for <b className="font-mono font-semibold">{passport}</b> under <b className="font-semibold">"{view.stage}"</b>.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-slate-300">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-300 bg-slate-100 text-slate-700">
                <tr>
                  {cols.map((i) => (
                    <th key={i} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                      {list.headers[i]}
                    </th>
                  ))}
                  {onStudentStage && (
                    <th className="px-2.5 py-1.5">
                      <span className="sr-only">Update</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {list.rows.map((r, n) => {
                  const id = stageRowId(r.details);
                  return (
                    <tr key={n}>
                      {cols.map((i) => (
                        <td key={i} className="whitespace-pre-line px-2.5 py-1.5 align-top">
                          {r.cells[i] ?? ''}
                        </td>
                      ))}
                      {onStudentStage && (
                        <td className="px-2.5 py-1.5 text-right align-top">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={off || updated}
                            aria-label={id ? `Update the row with Student ID ${id}` : `Update row ${n + 1}`}
                            title={`Writes "${STAGE_REMARK}" in this row's Remark box, ticks Select on this row only, and presses Update.`}
                            onClick={() => setMsg(updateStageRowFromPage(r.details))}
                          >
                            Update this row
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {onStudentStage && list && (
          <p className="text-xs leading-relaxed text-slate-600">
            <b className="font-semibold text-slate-900">Update this row</b> writes <span className="font-mono text-slate-900">{STAGE_REMARK}</span> in that row's
            Remark box, ticks Select on that row only, and presses Update.
          </p>
        )}
        {msg && <p className="text-xs font-semibold text-red-700">{msg}</p>}
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          {!again && (
            <Button
              size="sm"
              variant="outline"
              icon={<Send className="h-3.5 w-3.5" />}
              disabled={off}
              onClick={() => setMsg(submitAgain())}
              title='Back to the Passport Collection tab and Submit there, then "Passport Received by INSO (For Processing)" and back, then the usual stage steps.'
            >
              Submit again on Passport Collection
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            disabled={off}
            onClick={() => setMsg(stageDoneByStaff())}
            title="Only if the site shows the stage is right. The tool then presses nothing more on the stage."
          >
            It's done on the site
          </Button>
          {live && (
            <Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => revealStagePage()}>
              Show it in the site window
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function AfterSubmit() {
  const saved = useApp((s) => !!s.saves.collection);
  const holding = useApp((s) => s.docs.holding);
  const again = useApp((s) => !!s.saves.collectionAgain);
  const stageSaved = useApp((s) => !!s.saves[s.saves.collectionAgain ? 'stageAgain' : 'stage']);
  const confirmed = useApp((s) => !!s.siteData.stageConfirmed);
  const byStaff = useApp((s) => !!s.siteData.stageByStaff);
  const rows = useApp((s) => s.siteData.stageRows);
  const pick = useApp((s) => s.siteData.stagePick);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'afterSubmit')] || !!s.busy[busyKeyFor(s.runId, 'resubmit')]);
  const resubmitting = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'resubmit')] && !s.saves.collectionAgain);
  const stopped = useApp((s) => s.steps[5].status === 'error');
  if (!saved) return null;
  const pickedId = pick ? stageRowId(pick) : '';
  const choosing = !!rows && !stageSaved && !busy;
  return (
    <div className="space-y-3">
      <SubHeading title="After Submit" note="Done by the tool, one after the other." />
      <ul className="divide-y divide-slate-200 rounded-sm border border-slate-300">
        <li className="flex flex-col gap-3 px-3.5 py-2.5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-px shrink-0">
              {holding.status === 'ready' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              ) : holding.status === 'error' ? (
                <XCircle className="h-5 w-5 text-red-600" />
              ) : (
                <Spinner className="h-5 w-5 text-blue-600" />
              )}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-900">Student Passport Holding Letter</div>
              <div className="text-xs text-slate-600">
                {holding.status === 'ready' ? `Saved as ${holding.fileName}. Print it for the student.` : 'Waiting for it below the form on the site…'}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button variant="outline" size="sm" icon={<Eye className="h-3.5 w-3.5" />} disabled={holding.status !== 'ready'} onClick={() => showDoc('holding')}>
              View
            </Button>
            <PrintButton docKey="holding" variant="primary" />
          </div>
        </li>
        {(again || resubmitting) && (
          <li className="flex items-start gap-3 px-3.5 py-2.5">
            <span className="mt-px shrink-0">{again ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <Spinner className="h-5 w-5 text-blue-600" />}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-900">Passport Collection: Submit again</div>
              <div className="text-xs text-slate-600">
                {again
                  ? 'Submitted again. Then "Passport Received by INSO (For Processing)" and back, with nothing done on INSO.'
                  : 'Back on the Passport Collection tab, submitting again…'}
              </div>
            </div>
          </li>
        )}
        <li className="flex items-start gap-3 px-3.5 py-2.5">
          <span className="mt-px shrink-0">
            {confirmed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            ) : choosing ? (
              <Clock3 className="h-5 w-5 text-amber-600" />
            ) : busy ? (
              <Spinner className="h-5 w-5 text-blue-600" />
            ) : stopped && holding.status === 'ready' ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : (
              <Clock3 className="h-5 w-5 text-slate-500" />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900">Movement stage: {STAGE_NAME}</div>
            <div className="text-xs text-slate-600">
              Remark <span className="font-mono text-slate-900">{STAGE_REMARK}</span>
              {pick && rows ? ` · on the row you chose${pickedId ? ` (Student ID ${pickedId})` : ''}` : ''}
              {confirmed
                ? byStaff
                  ? ' · done: you checked it on the site'
                  : ' · updated and checked'
                : choosing && !pick
                  ? " · choose the student's row below"
                  : busy
                    ? stageSaved
                      ? ' · Update pressed, checking…'
                      : ' · working on it…'
                    : stopped && holding.status === 'ready'
                      ? ' · stopped: see the message at the top of this step'
                      : ' · after the holding letter'}
            </div>
          </div>
        </li>
        {choosing && rows && (
          <li>
            <StageRowPicker list={rows} />
          </li>
        )}
      </ul>
      <StagePage />
    </div>
  );
}

export function Step5() {
  const f = useApp((s) => s.form);
  const fields = useApp((s) => s.siteData.collection);
  const passportTypes = useApp((s) => s.siteData.passportTypeOptions) ?? [];
  const saved = useApp((s) => !!s.saves.collection);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'collection')]);
  const status = useApp((s) => s.steps[5].status);
  const visaSent = useApp((s) => s.siteData.visaSent);
  const had = useApp((s) => s.siteData.collectionShown);
  const missing = useAppList(collectionMissing);
  const locked = saved || busy;
  const step6Differs = visaSent && (visaSent.issue !== f.issueDate || visaSent.expiry !== f.expiryDate);

  const footer = !saved && (
    <>
      <div className="flex-1">
        <MissingList items={missing} />
        {missing.length === 0 && !busy && (
          <p className="text-xs text-slate-600">The tool fills the form, reads it back, ticks Confirm Transaction, then clicks Submit.</p>
        )}
      </div>
      <Button size="lg" onClick={() => void submitCollection()} loading={busy} loadingText="Submitting…" disabled={!fields || missing.length > 0} className="sm:min-w-[160px]">
        Submit
      </Button>
    </>
  );

  return (
    <StepShell step={5} footer={footer}>
      {!fields ? (
        status !== 'error' && <FieldsLoading label="Loading the Passport Collection form…" rows={3} />
      ) : (
        <>
          <div className="space-y-4">
            <SubHeading title="Passport Collection" note="Have the student's passport in hand." />
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                label="Passport Type"
                required
                htmlFor="passportType"
                tag={<SiteTag value={f.passportType} site={had?.passportType} def={PASSPORT_TYPE_DEFAULT} />}
              >
                <Select
                  id="passportType"
                  options={passportTypes}
                  placeholder="Pick the passport type"
                  value={f.passportType}
                  onChange={(e) => setForm({ passportType: e.target.value })}
                  disabled={locked}
                />
              </Field>
              <Field
                label="Remarks"
                required
                htmlFor="remarks"
                tag={<SiteTag value={tidySpaces(f.remarks)} site={had?.remarks} def={REMARKS_DEFAULT} />}
              >
                <Input
                  id="remarks"
                  value={f.remarks}
                  onChange={(e) => setForm({ remarks: e.target.value })}
                  onBlur={() => setForm({ remarks: tidySpaces(f.remarks) })}
                  autoComplete="off"
                  disabled={locked}
                />
              </Field>
              <Field
                label="Last Visa Reference No"
                required
                htmlFor="lastVisaRef"
                tag={<SiteTag value={tidySpaces(f.lastVisaRef)} site={had?.lastVisaRef} />}
                help={
                  <span className="flex flex-col gap-1">
                    {had?.lastVisaRef && tidySpaces(f.lastVisaRef) === had.lastVisaRef ? (
                      <span>
                        The site already has this one. Check it against <b className="font-semibold text-slate-900">Our Ref.</b> on the VAL letter, and
                        change it if the letter shows another.
                      </span>
                    ) : (
                      <span>
                        Copy <b className="font-semibold text-slate-900">Our Ref.</b> from the top of the VAL letter. Stray spaces are trimmed.
                      </span>
                    )}
                    <ValStatus />
                  </span>
                }
              >
                <div className="flex">
                  <Input
                    id="lastVisaRef"
                    value={f.lastVisaRef}
                    onChange={(e) => setForm({ lastVisaRef: e.target.value })}
                    onBlur={() => setForm({ lastVisaRef: tidySpaces(f.lastVisaRef) })}
                    onFocus={() => app.get().activeDoc !== 'val' && showDoc('val', 1, false)}
                    placeholder="Our Ref."
                    autoComplete="off"
                    spellCheck={false}
                    className="rounded-r-none font-mono"
                    disabled={locked}
                  />
                  <Button variant="outline" className="-ml-px w-9 shrink-0 rounded-l-none px-0" onClick={() => showDoc('val')} aria-label="Show the VAL letter" title="Show the VAL letter">
                    <FileSearch className="h-4 w-4" />
                  </Button>
                </div>
              </Field>
              <DateField
                id="issueDate"
                label="Date of Issue Last Visa"
                required
                value={f.issueDate}
                onChange={setIssueDate}
                error={issueDateError(f.issueDate)}
                siteFormat="iso"
                extraHelp="also used for Date of Last Entry"
                tag={<SiteTag value={f.issueDate} site={had?.issueDate} />}
                disabled={locked}
              />
              <Field
                label="Date of Last Entry"
                tag={<Badge tone="slate">Same date</Badge>}
                help={
                  had?.lastEntryDate && had.lastEntryDate !== f.issueDate ? (
                    <>
                      The site has <b className="font-mono font-semibold text-slate-900">{had.lastEntryDate}</b> now. The tool puts the same date as Date
                      of Issue Last Visa.
                    </>
                  ) : undefined
                }
              >
                <ReadValue value={f.issueDate} mono empty="Follows Date of Issue Last Visa" />
              </Field>
              <DateField
                id="expiryDate"
                label="Date of Expiry Active Visa"
                required
                value={f.expiryDate}
                onChange={setExpiryDate}
                error={expiryDateError(f.issueDate, f.expiryDate)}
                warning={expiryWarning(f.expiryDate)}
                siteFormat="iso"
                tag={<SiteTag value={f.expiryDate} site={had?.expiryDate} />}
                disabled={locked}
              />
            </div>
            {step6Differs && visaSent && (
              <Alert tone="warning" title="Step 6 was already submitted with other dates">
                Step 6 went to the site with {isoToDmy(visaSent.issue)} and {isoToDmy(visaSent.expiry)}. If these dates are right, change step 6 on
                the site by hand.
              </Alert>
            )}
          </div>

          <div className="space-y-4">
            <SubHeading title="Filled by the site" note="Shown as the site has them. An empty one must be filled before Submit." />
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              {fields.map((field) =>
                field.value ? (
                  <Field key={field.key} label={field.label} tag={field.key === 'passportNumber' ? <Badge tone="green">Matches</Badge> : undefined}>
                    <ReadValue value={field.value} mono={/date|number/i.test(field.key)} />
                  </Field>
                ) : field.locked ? (
                  <Field
                    key={field.key}
                    label={field.label}
                    tag={
                      <Badge tone="slate" icon={<Lock className="h-3 w-3" />}>
                        Locked on the site
                      </Badge>
                    }
                    help="Empty on the site, and the site doesn't let anyone fill it here. The tool leaves it as it is."
                  >
                    <ReadValue value="" />
                  </Field>
                ) : field.options ? (
                  <Field key={field.key} label={field.label} required htmlFor={`site-${field.key}`} warning="Empty on the site. Pick it from the passport.">
                    <Select
                      id={`site-${field.key}`}
                      options={field.options}
                      placeholder="Pick one"
                      value={f.siteFill[field.key] ?? ''}
                      onChange={(e) => setForm({ siteFill: { ...f.siteFill, [field.key]: e.target.value } })}
                      className="border-amber-500 bg-amber-50"
                      disabled={locked}
                    />
                  </Field>
                ) : (
                  <Field key={field.key} label={field.label} required htmlFor={`site-${field.key}`} warning="Empty on the site. Fill it from the passport.">
                    <Input
                      id={`site-${field.key}`}
                      value={f.siteFill[field.key] ?? ''}
                      onChange={(e) => setForm({ siteFill: { ...f.siteFill, [field.key]: e.target.value } })}
                      className="border-amber-500 bg-amber-50"
                      disabled={locked}
                    />
                  </Field>
                ),
              )}
            </div>
            <p className="text-xs text-slate-600">
              <b className="font-semibold text-slate-900">Confirm Transaction</b> is ticked by the tool, only after every value checks out.
            </p>
          </div>
          <AfterSubmit />
        </>
      )}
    </StepShell>
  );
}
