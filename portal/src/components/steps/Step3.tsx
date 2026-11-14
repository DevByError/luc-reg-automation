import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileSearch, FolderOpen, RefreshCw, Search, Upload, XCircle } from 'lucide-react';
import { RESULT_SECTION } from '../../../shared/ops';
import type { FeeKey, ResultField, ResultView } from '../../../shared/ops';
import { tidySpaces } from '../../lib/format';
import {
  addEnglishResultFile,
  askFinalSubmit,
  chooseResultFile,
  continueParents,
  openStudentFolder,
  pickResultTest,
  resultCell,
  resultDateShown,
  setResultStudentId,
  setResultValue,
  uploadEnglishResult,
  useStep2Certificate,
  viewEnglishResult,
} from '../../state/actions';
import { busyKeyFor } from '../../state/runner';
import { selectStep, setForm, showDoc, useApp, useAppList } from '../../state/store';
import { finalMissing, isFee, isSemesters, parentsMissing, resultFieldError, resultFields, resultMissing } from '../../state/validation';
import { DateField } from '../DateField';
import { Dropzone } from '../Dropzone';
import type { DropzoneTexts } from '../Dropzone';
import { Alert, Badge, Button, Field, Input, MissingList, ReadValue, Select, Spinner, cx } from '../ui';
import { FieldsLoading, StepShell, SubHeading } from './StepShell';

function ParentsDetails() {
  const parents = useApp((s) => s.siteData.parents);
  const contact = useApp((s) => s.form.parentContact);
  const saved = useApp((s) => !!s.saves.parents);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'parents')]);
  if (!parents) return null;
  const changed = tidySpaces(contact) !== parents.contactNo;
  if (saved) {
    return (
      <div className="flex items-start gap-3 rounded-sm border border-emerald-300 bg-emerald-50 px-3.5 py-2.5">
        <CheckCircle2 className="mt-px h-5 w-5 shrink-0 text-emerald-700" />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-slate-900">Parents Details saved</div>
          <div className="text-xs text-slate-700">
            {parents.relationship}: {parents.name} · Contact No <span className="font-mono">{tidySpaces(contact)}</span>
          </div>
        </div>
      </div>
    );
  }
  const fields: [string, string][] = [
    ['Relationship', parents.relationship],
    ['Name', parents.name],
    ['Occupation', parents.occupation],
    ['Address', parents.address],
    ['City/Town/village', parents.city],
    ['State/province', parents.state],
    ['Postal/ZIP Code', parents.zip],
    ['Country', parents.country],
    ['Email', parents.email],
  ];
  return (
    <div className="space-y-4">
      <SubHeading
        title="Parents Details"
        note="Only the Contact No can be changed. The rest is for reference."
        right={
          <Button variant="ghost" size="sm" icon={<FileSearch className="h-3.5 w-3.5" />} onClick={() => showDoc('registration', 2)}>
            Show page 2
          </Button>
        }
      />
      <Field
        label="Contact No"
        required
        htmlFor="parentContact"
        tag={saved ? <Badge tone="green">Saved</Badge> : changed ? <Badge tone="amber">Changed</Badge> : undefined}
        help={
          changed ? (
            <>
              The site has <span className="font-mono">{parents.contactNo}</span>. Yours goes in instead and is read back before Continue To Next.
            </>
          ) : (
            <>
              Check it against page 2 of the PDF, section <b className="font-semibold text-slate-900">1.2 Emergency contact details in home country</b>.
            </>
          )
        }
      >
        <Input
          id="parentContact"
          value={contact}
          onChange={(e) => setForm({ parentContact: e.target.value })}
          onFocus={() => showDoc('registration', 2, false)}
          disabled={saved || busy}
          className="max-w-sm"
        />
      </Field>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">
        {fields.map(([label, value]) => (
          <Field key={label} label={label}>
            <ReadValue value={value} />
          </Field>
        ))}
      </div>
    </div>
  );
}

const RESULT_TEXTS: DropzoneTexts = {
  what: 'the English result',
  oneOnly: 'Drop one file only: the English result.',
  note: "PDF, JPG or PNG · up to 10 MB · saved in the student's folder; it goes on the site when you press Upload",
  label: 'Choose another file for the English result',
};

/** Words without capitals, spaces or marks, to compare two names of the same programme. */
const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The student's row on the site after View, as the site shows it. */
function ResultRow({ view, passport }: { view: ResultView; passport: string }) {
  const course = useApp((s) => s.siteData.fileRow?.course ?? '');
  const ok = view.rows.length === 1 && view.samePassport;
  const programme = resultCell(view, 'Programme');
  const otherCourse = ok && !!course && !!programme && !plain(programme).includes(plain(course)) && !plain(course).includes(plain(programme));
  return (
    <div className="space-y-1.5">
      <div className={cx('overflow-x-auto rounded-sm border', ok ? 'border-slate-300' : 'border-red-400')}>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-300 bg-slate-100 text-slate-700">
            <tr>
              {view.headers.map((h, i) => (
                <th key={i} className="whitespace-nowrap px-3 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {view.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-1.5">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ok ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" /> IC/Passport is {passport}: this student.
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-red-700">
          <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {view.rows.length === 1 ? `This isn't ${passport}. Check the Student ID, then press View again.` : 'More than one row. Check the Student ID, then press View again.'}
        </p>
      )}
      {otherCourse && (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          The Programme here isn't the one step 4 found ({course}). Check it's the right registration before Upload.
        </p>
      )}
    </div>
  );
}

/** The certificate that goes up: step 2's, unless the staff chooses another file here. */
function ResultCertificate({ locked }: { locked: boolean }) {
  const own = useApp((s) => s.docs.englishResult);
  const step2 = useApp((s) => s.docs.english);
  const byStaff = useApp((s) => s.siteData.resultFileByStaff);
  const choosing = useApp((s) => !!s.siteData.resultChoosing);
  const fileBusy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'resultFile')]);
  const mine = own.status !== 'waiting';

  let icon = <CheckCircle2 className="h-5 w-5 text-emerald-700" />;
  let text = '';
  let bad = false;
  if (mine) {
    if (own.status === 'loading') {
      icon = <Spinner className="h-5 w-5 text-blue-600" />;
      text = `Saving ${byStaff?.name ?? 'your file'} in the student's folder…`;
    } else if (own.status === 'error') {
      bad = true;
      text = `${byStaff?.name ?? 'Your file'} wasn't saved. Choose it again, or go back to step 2's certificate.`;
    } else {
      text = `${own.fileName}, chosen by you${byStaff ? ` (${byStaff.name})` : ''}. It shows on the left.`;
    }
  } else if (step2.status === 'ready' && step2.fileName) {
    text = `${step2.fileName}, the certificate from step 2. It shows on the left.`;
  } else {
    bad = true;
    text = "Step 2's certificate isn't in the student's folder. Choose the file below.";
  }
  if (bad) icon = <XCircle className="h-5 w-5 text-red-600" />;
  const open = !locked && !fileBusy;
  const showChooser = open && (choosing || (mine && own.status === 'error') || (!mine && step2.status !== 'ready'));

  return (
    <div className={cx('rounded-sm border bg-white px-3.5 py-2.5', bad ? 'border-red-300' : 'border-slate-300')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-px shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900">
              English Result<span className="ml-0.5 text-red-600">*</span>
            </div>
            <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-600">{text}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {open && !showChooser && (
            <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => chooseResultFile(true)}>
              Use another file
            </Button>
          )}
          {open && mine && step2.status === 'ready' && (
            <Button variant="outline" size="sm" onClick={() => useStep2Certificate()}>
              Use step 2's certificate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={<Eye className="h-3.5 w-3.5" />}
            disabled={mine ? own.status === 'waiting' : step2.status !== 'ready'}
            onClick={() => showDoc(mine ? 'englishResult' : 'english')}
          >
            View
          </Button>
        </div>
      </div>
      {showChooser && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <p className="text-xs leading-relaxed text-slate-600">
            Use another file when step 2's certificate isn't the right one for LOS. The tool saves it in the student's folder as "3 English result", shows it on
            the left, and attaches it on the site when you press Upload.
          </p>
          <Dropzone onFile={addEnglishResultFile} uploading={false} uploaded={false} failed={false} texts={RESULT_TEXTS} />
          {choosing && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => chooseResultFile(false)}>
                Keep {mine ? own.fileName : step2.fileName}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The site's own limits on a box, in words. */
function limitsOf(f: ResultField): string {
  const bits: string[] = [];
  if (f.kind === 'number') {
    if (f.min && f.max) bits.push(`From ${f.min} to ${f.max}`);
    else if (f.min) bits.push(`${f.min} or more`);
    else if (f.max) bits.push(`${f.max} or less`);
    if ((f.step ?? '').toLowerCase() === 'any') bits.push('decimals allowed');
    else if (f.step && Number(f.step) !== 1) bits.push(`in steps of ${f.step}`);
    else bits.push('whole numbers');
  }
  if (f.maxLength && f.kind === 'text') bits.push(`up to ${f.maxLength} characters`);
  const text = bits.join(', ');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}, as the site takes it.` : '';
}

/** One box the site shows for the chosen Test Name, filled here the way the site's box is written. */
function ResultBox({ field: f, locked }: { field: ResultField; locked: boolean }) {
  const value = useApp((s) => s.form.resultValues[f.key] ?? '');
  const id = `result-${f.key}`;
  const error = resultFieldError(f, value);
  if (f.locked) {
    return (
      <Field label={f.label} tag={<Badge tone="slate">From the site</Badge>} help="The site doesn't let anyone change it.">
        <ReadValue value={f.kind === 'date' && f.value ? resultDateShown(f, f.value) : f.value} mono={f.kind !== 'select'} />
      </Field>
    );
  }
  if (f.kind === 'other') {
    return (
      <Field label={f.label} error="The portal can't fill this kind of box. Look at the site window.">
        <ReadValue value={f.value} />
      </Field>
    );
  }
  if (f.kind === 'date') {
    return (
      <DateField
        id={id}
        label={f.label}
        value={value}
        onChange={(iso) => setResultValue(f.key, iso)}
        required
        disabled={locked}
        error={error}
        siteFormat={f.format && f.format !== 'iso' && f.format.startsWith('yyyy') ? 'iso' : 'dmy'}
        sentAs={(iso) => resultDateShown(f, iso)}
        extraHelp="as on the certificate."
      />
    );
  }
  if (f.kind === 'select') {
    return (
      <Field label={f.label} required htmlFor={id} error={value ? error : undefined}>
        <Select id={id} options={f.options ?? []} placeholder="Pick one" value={value} onChange={(e) => setResultValue(f.key, e.target.value)} disabled={locked} />
      </Field>
    );
  }
  const limits = limitsOf(f);
  return (
    <Field label={f.label} required htmlFor={id} error={value.trim() ? error : undefined} help={limits ? `${limits} Type it as on the certificate.` : 'Type it as on the certificate.'}>
      <Input
        id={id}
        value={value}
        inputMode={f.kind === 'number' ? 'decimal' : undefined}
        placeholder={f.placeholder}
        autoComplete="off"
        onChange={(e) => setResultValue(f.key, e.target.value)}
        invalid={!!value.trim() && !!error}
        disabled={locked}
        className={cx('max-w-xs', f.kind === 'number' && 'tabular-nums')}
      />
    </Field>
  );
}

/**
 * After Final Submit: Verify / Upload English Result, as LOS shows it. The tool types the Student ID and presses View,
 * the staff picks the Test Name and fills its boxes here, and presses Upload here.
 */
function EnglishResult() {
  const finalSaved = useApp((s) => !!s.saves.final);
  const done = useApp((s) => !!s.saves.englishReupload);
  const view = useApp((s) => s.siteData.result);
  const viewed = useApp((s) => s.siteData.resultViewed);
  const work = useApp((s) => s.siteData.resultWork);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'result')]);
  const id = useApp((s) => s.form.resultStudentId);
  const step4Id = useApp((s) => s.siteData.fileRow?.studentId ?? '');
  const step4Busy = useApp((s) => s.steps[4].status === 'working');
  const testName = useApp((s) => s.form.resultTestName);
  const passport = useApp((s) => s.student?.passport ?? '');
  const fields = useApp(resultFields);
  if (!finalSaved || done) return null;

  const idNow = tidySpaces(id);
  const showing = !!view && view.state === 'student' && !!idNow && viewed === idNow;
  const thisStudent = showing && view.rows.length === 1 && view.samePassport;
  const locked = busy;
  const idTag = !idNow ? undefined : step4Id && idNow === step4Id ? <Badge tone="slate">From step 4</Badge> : <Badge tone="amber">{step4Id ? 'Changed' : 'Typed by you'}</Badge>;
  const onSiteTest = showing && view.testName === testName && !!testName;

  return (
    <div className="space-y-4">
      <SubHeading
        title={RESULT_SECTION}
        note="After Final Submit the tool opens LOS's own page for it (verify_eng_res.aspx) in its own tab. The tool fills it there; you press Upload here."
        right={view ? <Badge tone="slate">LOS page, in its own tab</Badge> : undefined}
      />
      {!view && work === 'find' && <FieldsLoading label={`Opening "${RESULT_SECTION}" in its own tab…`} rows={1} />}

      <Field
        label="Student ID"
        required
        htmlFor="resultStudentId"
        tag={idTag}
        help={
          step4Id && idNow !== step4Id ? (
            <>
              Step 4 found <span className="font-mono">{step4Id}</span>. Yours is used instead.
            </>
          ) : step4Id ? (
            'From Student Files in step 4. Not the LUC number, not the passport.'
          ) : step4Busy ? (
            'Comes from Student Files in step 4, which is still working. You can type it yourself.'
          ) : (
            "From Student Files in step 4. Type it here if step 4 didn't find it."
          )
        }
      >
        <div className="flex max-w-md gap-2">
          <Input
            id="resultStudentId"
            value={id}
            autoComplete="off"
            onChange={(e) => setResultStudentId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && idNow && !busy) viewEnglishResult();
            }}
            disabled={locked}
            className="min-w-0 flex-1 font-mono"
          />
          <Button
            variant="outline"
            icon={<Search className="h-4 w-4" />}
            onClick={() => viewEnglishResult()}
            loading={busy && (work === 'view' || work === 'find')}
            loadingText={work === 'find' ? 'Finding…' : 'Viewing…'}
            disabled={!idNow || busy}
            className="shrink-0"
          >
            View
          </Button>
        </div>
      </Field>

      {showing && <ResultRow view={view} passport={passport} />}
      {showing && view.said.length > 0 && (
        <p className="text-xs text-slate-600">
          LOS said: <span className="text-slate-800">"{view.said.join('" / "')}"</span>
        </p>
      )}
      {view && !showing && view.state === 'student' && !busy && (
        <p className="text-xs font-semibold text-amber-800">LOS shows a student, but not for this Student ID. Press View.</p>
      )}

      <ResultCertificate locked={busy} />

      {thisStudent ? (
        <div className="space-y-4">
          <Field
            label="Test Name"
            required
            htmlFor="resultTest"
            help={
              !testName
                ? "LOS's own list. Pick the test on the certificate; the boxes LOS asks for then show here."
                : work === 'test'
                  ? `Asking LOS which boxes ${testName} has…`
                  : onSiteTest
                    ? fields.length
                      ? `LOS asks for these for ${testName}.`
                      : `LOS asks for nothing more for ${testName}. Press Upload.`
                    : `LOS doesn't show ${testName} yet. Press Look again in the red box above.`
            }
          >
            {view.testNames.length === 0 && (
              <p className="mb-1 text-xs font-semibold text-amber-800">LOS's Test Name list hasn't shown yet. Press View again.</p>
            )}
            <div className="max-w-xs">
              <Select
                id="resultTest"
                options={view.testNames}
                placeholder="Pick the test"
                value={testName}
                onChange={(e) => pickResultTest(e.target.value)}
                disabled={locked}
              />
            </div>
          </Field>
          {onSiteTest && fields.length > 0 && (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              {fields.map((f) => (
                <ResultBox key={f.key} field={f} locked={locked} />
              ))}
            </div>
          )}
          {work === 'test' && <FieldsLoading label={`Reading the boxes LOS shows for ${testName}…`} rows={1} />}
        </div>
      ) : (
        !showing && (
          <p className="text-xs leading-relaxed text-slate-600">
            The Test Name and the boxes for it show here once LOS shows this student's row (after View).
          </p>
        )
      )}
    </div>
  );
}

const FEE_FIELDS: { key: FeeKey; label: string; help?: string; whole?: true }[] = [
  { key: 'kptFees', label: 'KPT Fees' },
  { key: 'scholarship', label: 'Lincoln Foundation Scholarship', help: 'Auto Calculation on the site.' },
  { key: 'tuitionFees', label: 'Currently Tution Fees', help: 'Including scholarship and loan.' },
  { key: 'totalSemester', label: 'Total Semester', whole: true },
];

/** "From the site" while a value is as the site has it, "Changed" once the staff changes it. */
function SiteTag({ value, site }: { value: string; site: string }) {
  return value === site ? <Badge tone="slate">From the site</Badge> : <Badge tone="amber">Changed</Badge>;
}

/** The fee table under the fields on the site, shown as it is. */
function FeePlan({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-semibold text-slate-900">Fee plan on the site</div>
      <div className="overflow-x-auto rounded-sm border border-slate-300">
        <table className="w-full text-left text-xs">
          {headers.length > 0 && (
            <thead className="border-b border-slate-300 bg-slate-100 text-slate-700">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-1.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-1.5 tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentPlan() {
  const f = useApp((s) => s.form);
  const pay = useApp((s) => s.siteData.payment);
  const loaded = useApp((s) => !!s.siteData.paymentLoaded);
  const saved = useApp((s) => !!s.saves.final);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'final')]);
  if (!loaded || !pay) return null;
  if (saved) {
    return (
      <div className="flex items-start gap-3 rounded-sm border border-emerald-300 bg-emerald-50 px-3.5 py-2.5">
        <CheckCircle2 className="mt-px h-5 w-5 shrink-0 text-emerald-700" />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-slate-900">Payment Plan: Final Submit done</div>
          <div className="text-xs text-slate-700">Financer: {f.financer || 'none'}</div>
        </div>
      </div>
    );
  }
  const locked = saved || busy;
  const anyBox = FEE_FIELDS.some(({ key }) => pay.fees[key].editable);
  return (
    <div className="space-y-4">
      <SubHeading
        title="Payment Plan"
        note={
          anyBox
            ? 'As the site has it now. Change a fee only where the site has a box for it; the rest come from Accounts.'
            : 'As the site has it now. The fees come from Accounts and only show here. You can change the Financer.'
        }
      />
      <Alert tone="error" title="On the site:">
        If any mistake in FEES details, Kindly contact Accounts Department / PTPTN
      </Alert>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        {FEE_FIELDS.map(({ key, label, help, whole }) => {
          const site = pay.fees[key];
          if (!site.editable) {
            return (
              <Field key={key} label={label} tag={<Badge tone="slate">From the site</Badge>} help={help}>
                <ReadValue value={site.value} mono />
              </Field>
            );
          }
          const value = f[key];
          const changed = value.trim() !== site.value;
          const ok = !changed || (whole ? isSemesters(value) : isFee(value));
          return (
            <Field
              key={key}
              label={label}
              htmlFor={key}
              tag={<SiteTag value={value.trim()} site={site.value} />}
              error={ok ? undefined : whole ? 'A whole number, e.g. 8.' : 'A number, e.g. 1500 or 1500.50.'}
              help={changed && !value.trim() ? 'Empty: the tool will clear this box on the site.' : help}
            >
              <Input
                id={key}
                value={value}
                inputMode={whole ? 'numeric' : 'decimal'}
                placeholder="Empty"
                onChange={(e) => setForm({ [key]: e.target.value } as Partial<typeof f>)}
                invalid={!ok}
                disabled={locked}
              />
            </Field>
          );
        })}
        <Field
          label="Financer"
          required
          htmlFor="financer"
          tag={f.financer ? <SiteTag value={f.financer} site={pay.financer} /> : undefined}
          help="The student decides this. It starts as the site has it; change it if the student chose another."
        >
          <Select
            id="financer"
            options={pay.financerOptions}
            placeholder="Pick the financer"
            value={f.financer}
            onChange={(e) => setForm({ financer: e.target.value })}
            disabled={locked}
          />
        </Field>
      </div>
      {pay.plan.rows.length > 0 && <FeePlan headers={pay.plan.headers} rows={pay.plan.rows} />}
    </div>
  );
}

export function Step3() {
  const profileSaved = useApp((s) => !!s.saves.profile);
  const parents = useApp((s) => s.siteData.parents);
  const paymentLoaded = useApp((s) => !!s.siteData.paymentLoaded);
  const parentsSaved = useApp((s) => !!s.saves.parents);
  const finalSaved = useApp((s) => !!s.saves.final);
  const done = useApp((s) => !!s.saves.englishReupload);
  const uploaded = useApp((s) => s.siteData.resultUploaded);
  const byStaff = useApp((s) => !!s.siteData.staffConfirmed?.englishReupload);
  const passport = useApp((s) => s.student?.passport ?? '');
  const parentsBusy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'parents')]);
  const finalBusy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'final')]);
  const resultBusy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'result')]);
  const uploading = useApp((s) => s.siteData.resultWork === 'upload');
  const status = useApp((s) => s.steps[3].status);
  const missingParents = useAppList(parentsMissing);
  const missingFinal = useAppList(finalMissing);
  const missingResult = useAppList(resultMissing);

  let footer = null;
  if (parents && !paymentLoaded) {
    footer = (
      <>
        <div className="flex-1">
          <MissingList items={missingParents} />
        </div>
        <Button size="lg" onClick={() => void continueParents()} loading={parentsBusy} loadingText="Saving…" disabled={missingParents.length > 0} className="sm:min-w-[190px]">
          Continue To Next
        </Button>
      </>
    );
  } else if (paymentLoaded && !finalSaved) {
    footer = (
      <>
        <div className="flex-1">
          <MissingList items={missingFinal} />
          {missingFinal.length === 0 && !finalBusy && (
            <p className="text-xs text-slate-600">You'll see the values once more before anything is pressed on the site.</p>
          )}
        </div>
        <Button size="lg" onClick={askFinalSubmit} loading={finalBusy} loadingText="Submitting…" disabled={missingFinal.length > 0} className="sm:min-w-[190px]">
          Final Submit
        </Button>
      </>
    );
  } else if (finalSaved && !done) {
    footer = (
      <>
        <div className="flex-1">
          <MissingList items={missingResult} />
          {missingResult.length === 0 && !resultBusy && (
            <p className="text-xs text-slate-600">The tool fills LOS, reads every value back, and presses Upload there only if they all match.</p>
          )}
        </div>
        <Button
          size="lg"
          variant="success"
          icon={<Upload className="h-4 w-4" />}
          onClick={() => void uploadEnglishResult()}
          loading={uploading}
          loadingText="Uploading…"
          disabled={missingResult.length > 0 || resultBusy}
          className="sm:min-w-[190px]"
        >
          Upload
        </Button>
      </>
    );
  }

  return (
    <StepShell step={3} footer={footer}>
      {!profileSaved && (
        <Alert
          tone="info"
          title="Starts after step 2"
          actions={
            <Button size="sm" variant="outline" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => selectStep(2)}>
              Go to step 2
            </Button>
          }
        >
          Press Continue To Next on the Admission Profile first. Then the tool passes Address, Add WhatsApp and Add Wechat by itself and stops
          here at Parents Details.
        </Alert>
      )}
      {done && (
        <Alert
          tone="success"
          title="Step 3 is done"
          actions={
            <Button size="sm" variant="outline" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => void openStudentFolder(passport)}>
              Open the student's folder
            </Button>
          }
        >
          Final Submit is done, and the English result is uploaded on "{RESULT_SECTION}"
          {uploaded?.file ? (
            <>
              : <span className="font-mono">{uploaded.file}</span>
              {uploaded.testName ? `, ${uploaded.testName}` : ''}
            </>
          ) : null}
          .{byStaff ? ' You checked the site window: it took the upload.' : ' LOS went back to the empty Student ID box.'}
        </Alert>
      )}
      <EnglishResult />
      {profileSaved && !parents && status !== 'error' && <FieldsLoading label="Passing through the tabs to Parents Details…" rows={2} />}
      {parentsSaved && !paymentLoaded && status !== 'error' && <FieldsLoading label="Passing Education and opening Payment Plan…" rows={2} />}
      {parentsSaved && <ParentsDetails />}
      <PaymentPlan />
      {!parentsSaved && <ParentsDetails />}
    </StepShell>
  );
}
