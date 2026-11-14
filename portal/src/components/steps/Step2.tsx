import { ArrowRight, CheckCircle2, Clock3, Download, Eye, FileSearch, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { ProfileOptions, SiteDocs } from '../../../shared/ops';
import {
  PROFILE_DEFAULTS,
  addEnglishFile,
  chooseEnglishAgain,
  continueProfile,
  englishDocName,
  keepEnglish,
  pickEnglishDoc,
  sameChoice,
} from '../../state/actions';
import { busyKeyFor } from '../../state/runner';
import { app, selectStep, setForm, showDoc, useApp, useAppList } from '../../state/store';
import { contactCodeError, contactNumberError, profileMissing } from '../../state/validation';
import { Dropzone } from '../Dropzone';
import type { DropzoneTexts } from '../Dropzone';
import { Alert, Badge, Button, Field, Input, MissingList, RadioGroup, ReadValue, Select, Spinner, cx } from '../ui';
import { FieldsLoading, StepShell, SubHeading } from './StepShell';

const DEFAULTS = PROFILE_DEFAULTS;
const NO_OPTIONS: ProfileOptions = {
  studentType: [],
  salutation: [],
  intake: [],
  highestQualification: [],
  visaType: [],
  studentCategory: [],
  classType: [],
  accommodation: [],
};

/** Shows the right page of the registration form while the staff works on a field. */
const focusPage = (page: number) => () => {
  const s = app.get();
  if (s.activeDoc !== 'registration' || s.docPage !== page) showDoc('registration', page, false);
};

function DefaultTag({ value, def }: { value: string; def: string }) {
  if (!value) return null;
  return sameChoice(value, def) ? <Badge tone="slate">Default</Badge> : <Badge tone="amber">Changed</Badge>;
}

const ENGLISH_TEXTS: DropzoneTexts = {
  what: 'the certificate',
  oneOnly: 'Drop one file only: the English certificate.',
  note: "PDF, JPG or PNG · up to 10 MB · saved in the student's folder, then attached to the form on the site",
  label: 'Add the English certificate yourself',
};

/**
 * The student's documents as Applicant Details [All] lists them, with the site's own columns. The staff presses
 * the one that is the English certificate (a master's or PhD student may have uploaded it in another row).
 */
function SiteDocuments({ docs }: { docs: SiteDocs }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-semibold text-slate-900">Choose it from the student's documents on the site</div>
      <p className="text-xs leading-relaxed text-slate-600">
        This is the student's list on Applicant Details [All]. Press <b>Use this</b> on the English certificate: the tool downloads it,
        saves it in the student's folder, attaches it to the form, and shows it on the left so you can check it.
      </p>
      <div className="overflow-x-auto rounded-sm border border-slate-300">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-300 bg-slate-100 text-slate-700">
            <tr>
              {docs.headers.map((h, i) => (
                <th key={i} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
              <th className="px-2.5 py-1.5">
                <span className="sr-only">Use</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {docs.rows.map((r, i) => {
              const name = englishDocName(docs, i);
              return (
                <tr key={i} className={r.file ? undefined : 'text-slate-500'}>
                  {docs.headers.map((_, k) => (
                    <td key={k} className="px-2.5 py-1.5 align-middle">
                      {r.cells[k] ?? ''}
                    </td>
                  ))}
                  <td className="px-2.5 py-1.5 text-right align-middle">
                    {r.file ? (
                      <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} aria-label={`Use "${name}"`} onClick={() => setError(pickEnglishDoc(i))}>
                        Use this
                      </Button>
                    ) : (
                      <span className="whitespace-nowrap">No file</span>
                    )}
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

function EnglishCertificate() {
  const doc = useApp((s) => s.docs.english);
  const attached = useApp((s) => !!s.siteData.englishAttached);
  const byStaff = useApp((s) => s.siteData.englishByStaff);
  const fromSite = useApp((s) => s.siteData.englishFromSite);
  const docs = useApp((s) => s.siteData.englishDocs);
  const choosing = useApp((s) => !!s.siteData.englishChoosing);
  const lucSaved = useApp((s) => s.form.lucSaved);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'english')]);
  const profileSaved = useApp((s) => !!s.saves.profile);
  const profileBusy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'profile')]);

  let icon = <Clock3 className="h-5 w-5 text-slate-500" />;
  let text = 'Waits for the LUC number from step 1.';
  if (doc.status === 'loading') {
    icon = <Spinner className="h-5 w-5 text-blue-600" />;
    text = byStaff
      ? `Saving ${byStaff.name} in the student's folder…`
      : fromSite
        ? `Getting "${fromSite.name}" from Applicant Details…`
        : `Searching Applicant Details [All] for ${lucSaved}…`;
  } else if (doc.status === 'error') {
    icon = <XCircle className="h-5 w-5 text-red-600" />;
    text = byStaff
      ? `${byStaff.name} wasn't saved. Choose the file again below.`
      : fromSite
        ? `"${fromSite.name}" didn't arrive. Choose it again below, or add the certificate yourself.`
        : docs && docs.rows.length > 0
          ? 'Press the right document in the list below, or add it yourself.'
          : "The tool couldn't get it from the site. Add it yourself below, or press Try again above.";
  } else if (doc.status === 'ready' && !attached) {
    const how = byStaff ? `Added by you as ${doc.fileName}` : fromSite ? `"${fromSite.name}" saved as ${doc.fileName}` : `Downloaded as ${doc.fileName}`;
    if (busy) {
      icon = <Spinner className="h-5 w-5 text-blue-600" />;
      text = `${how}. Attaching it to the form…`;
    } else {
      icon = <XCircle className="h-5 w-5 text-red-600" />;
      text = `${how}, but not attached to the form yet. Press Try again above.`;
    }
  } else if (attached) {
    icon = <CheckCircle2 className="h-5 w-5 text-emerald-700" />;
    const who = byStaff ? ', added by you' : fromSite ? `, from "${fromSite.name}" on the site` : '';
    text = `Attached: ${doc.fileName}${who}. Check on the left that it's the right document.`;
  } else if (lucSaved) {
    icon = <Spinner className="h-5 w-5 text-blue-600" />;
    text = 'Starting the search…';
  }

  // The staff can choose or add the certificate when the tool couldn't get it, or to use a different file,
  // until the Admission Profile is saved.
  const open = !profileSaved && !profileBusy;
  const canChoose = open && !busy && (doc.status === 'error' || (choosing && doc.status === 'ready'));
  const canChange = open && !busy && attached && !choosing;

  return (
    <div className={cx('rounded-sm border bg-white px-3.5 py-2.5', canChoose && !choosing ? 'border-red-300' : 'border-slate-300')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-px shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900">
              English proficiency certificate<span className="ml-0.5 text-red-600">*</span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{text}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canChange && (
            <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => chooseEnglishAgain()}>
              Use a different file
            </Button>
          )}
          <Button variant="outline" size="sm" icon={<Eye className="h-3.5 w-3.5" />} disabled={doc.status !== 'ready'} onClick={() => showDoc('english')}>
            View
          </Button>
        </div>
      </div>
      {choosing && busy && !docs && (
        <p className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs text-slate-700">
          <Spinner className="h-3.5 w-3.5 text-blue-600" /> Reading the student's documents on Applicant Details…
        </p>
      )}
      {canChoose && (
        <div className="mt-3 space-y-4 border-t border-slate-200 pt-3">
          {docs && docs.rows.length > 0 && <SiteDocuments docs={docs} />}
          <div className="space-y-1.5">
            <div className="text-[13px] font-semibold text-slate-900">{docs && docs.rows.length > 0 ? 'Or add the certificate yourself' : 'Add the certificate yourself'}</div>
            <p className="text-xs leading-relaxed text-slate-600">
              Use the student's English certificate from another place, such as the student's email. The tool saves it in the student's folder,
              attaches it to the form, and shows it on the left so you can check it.
            </p>
            <Dropzone onFile={addEnglishFile} uploading={false} uploaded={false} failed={false} texts={ENGLISH_TEXTS} />
          </div>
          {choosing && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => keepEnglish()}>
                Keep {doc.fileName}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Step2() {
  const f = useApp((s) => s.form);
  const loaded = useApp((s) => !!s.siteData.profileLoaded);
  const odl = useApp((s) => !!s.siteData.odl);
  const school = useApp((s) => s.siteData.schoolName);
  // The site's own choices, read live: only what the site offers can be picked.
  const OPTIONS = useApp((s) => s.siteData.profileOptions) ?? NO_OPTIONS;
  const saved = useApp((s) => !!s.saves.profile);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'profile')]);
  const status = useApp((s) => s.steps[2].status);
  const missing = useAppList(profileMissing);
  const locked = saved || busy;

  const footer = !saved && (
    <>
      <div className="flex-1">
        <MissingList items={missing} />
        {missing.length === 0 && !busy && (
          <p className="text-xs text-slate-600">The tool fills the site, reads every value back, and clicks Continue To Next only if all match.</p>
        )}
      </div>
      <Button size="lg" onClick={() => void continueProfile()} loading={busy} loadingText="Checking every value…" disabled={!loaded || missing.length > 0} className="sm:min-w-[190px]">
        Continue To Next
      </Button>
    </>
  );

  return (
    <StepShell step={2} footer={footer}>
      {odl && (
        <Alert tone="info" title="ODL student">
          The site sent this student through the ODL Registration Page first. The Admission Profile is the same form.
        </Alert>
      )}
      {saved && (
        <Alert
          tone="success"
          title="Admission Profile saved on the site"
          actions={
            <Button size="sm" variant="outline" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => selectStep(3)}>
              Go to step 3
            </Button>
          }
        >
          The tool carries on through Address, Add WhatsApp and Add Wechat by itself.
        </Alert>
      )}

      {!loaded ? (
        status !== 'error' && <FieldsLoading label="Opening the Admission Form…" rows={3} />
      ) : (
        <>
          <div className="space-y-4">
            <SubHeading
              title="Admission Profile"
              note="Only these fields are shown. The rest stay as the student filled them."
              right={
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" icon={<FileSearch className="h-3.5 w-3.5" />} onClick={() => showDoc('registration', 1)}>
                    Page 1
                  </Button>
                  <Button variant="ghost" size="sm" icon={<FileSearch className="h-3.5 w-3.5" />} onClick={() => showDoc('registration', 2)}>
                    Page 2
                  </Button>
                </div>
              }
            />
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field label="Student Type" required htmlFor="studentType" help="Pick it from the EMGS Approval Type on page 1 of the PDF.">
                <Select
                  id="studentType"
                  options={OPTIONS.studentType}
                  placeholder="Pick the student type"
                  value={f.studentType}
                  onChange={(e) => setForm({ studentType: e.target.value })}
                  onFocus={focusPage(1)}
                  disabled={locked}
                />
              </Field>
              <Field label="Salutation" required htmlFor="salutation" help="Pre-set to what the student chose on the site.">
                <Select
                  id="salutation"
                  options={OPTIONS.salutation}
                  placeholder="Pick a salutation"
                  value={f.salutation}
                  onChange={(e) => setForm({ salutation: e.target.value })}
                  disabled={locked}
                />
              </Field>
              <Field label="Intake" required htmlFor="intake" help="The site offers one intake at a time.">
                <Select
                  id="intake"
                  options={OPTIONS.intake}
                  placeholder="Pick the intake"
                  value={f.intake}
                  onChange={(e) => setForm({ intake: e.target.value })}
                  disabled={locked}
                />
              </Field>
              <Field
                label="Personal Contact"
                required
                htmlFor="contactNumber"
                error={contactCodeError(f.contactCode) ?? contactNumberError(f.contactNumber)}
                help="Pre-filled from the site. Check the code and number against page 2 of the PDF."
              >
                <div className="flex gap-2">
                  <div className="relative w-24 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">+</span>
                    <Input
                      aria-label="Country code"
                      value={f.contactCode}
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(e) => setForm({ contactCode: e.target.value.replace(/\D/g, '') })}
                      onFocus={focusPage(2)}
                      className="pl-5"
                      invalid={!!contactCodeError(f.contactCode)}
                      disabled={locked}
                    />
                  </div>
                  <Input
                    id="contactNumber"
                    value={f.contactNumber}
                    inputMode="numeric"
                    maxLength={12}
                    onChange={(e) => setForm({ contactNumber: e.target.value.replace(/\D/g, '') })}
                    onFocus={focusPage(2)}
                    invalid={!!contactNumberError(f.contactNumber)}
                    disabled={locked}
                  />
                </div>
              </Field>
              <Field label="Accommodation" required htmlFor="accommodation" help="Tick it from the address on page 2 of the PDF.">
                <RadioGroup
                  name="accommodation"
                  label="Accommodation"
                  options={OPTIONS.accommodation}
                  value={f.accommodation}
                  onChange={(v) => setForm({ accommodation: v })}
                  onFocus={focusPage(2)}
                  disabled={locked}
                />
              </Field>
              <Field label="Highest Qualification School/Institution Name" help="As the student typed it. Read only.">
                <ReadValue value={school} />
              </Field>
              <Field label="Highest Qualification" required htmlFor="highestQualification" help="Pick it from the school name.">
                <Select
                  id="highestQualification"
                  options={OPTIONS.highestQualification}
                  placeholder="Pick the qualification"
                  value={f.highestQualification}
                  onChange={(e) => setForm({ highestQualification: e.target.value })}
                  disabled={locked}
                />
              </Field>
              <Field label="Visa Type" required htmlFor="visaType" tag={<DefaultTag value={f.visaType} def={DEFAULTS.visaType} />}>
                <RadioGroup
                  name="visaType"
                  label="Visa Type"
                  options={OPTIONS.visaType}
                  value={f.visaType}
                  onChange={(v) => setForm({ visaType: v })}
                  disabled={locked}
                />
              </Field>
              <Field label="Student Category" required htmlFor="studentCategory" tag={<DefaultTag value={f.studentCategory} def={DEFAULTS.studentCategory} />}>
                <Select
                  id="studentCategory"
                  options={OPTIONS.studentCategory}
                  placeholder="Pick the category"
                  value={f.studentCategory}
                  onChange={(e) => setForm({ studentCategory: e.target.value })}
                  disabled={locked}
                />
              </Field>
              <Field label="Class Type" required htmlFor="classType" tag={<DefaultTag value={f.classType} def={DEFAULTS.classType} />}>
                <Select
                  id="classType"
                  options={OPTIONS.classType}
                  placeholder="Pick the class type"
                  value={f.classType}
                  onChange={(e) => setForm({ classType: e.target.value })}
                  disabled={locked}
                />
              </Field>
            </div>
          </div>
          <EnglishCertificate />
        </>
      )}
    </StepShell>
  );
}
