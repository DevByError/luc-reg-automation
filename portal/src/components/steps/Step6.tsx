import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { isoToDmy } from '../../lib/format';
import { addStampFile, setVisaExpiryDate, setVisaIssueDate, submitVisa } from '../../state/actions';
import { busyKeyFor } from '../../state/runner';
import { useApp, useAppList } from '../../state/store';
import { expiryDateError, expiryWarning, issueDateError, visaMissing } from '../../state/validation';
import { DateField } from '../DateField';
import { Dropzone } from '../Dropzone';
import { Alert, Badge, Button, Field, MissingList, ReadValue } from '../ui';
import { FieldsLoading, StepShell, SubHeading } from './StepShell';

function Check({ state, children }: { state: 'ok' | 'bad' | 'waiting'; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5 text-[13px]">
      {state === 'ok' ? (
        <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-700" />
      ) : state === 'bad' ? (
        <XCircle className="mt-px h-4 w-4 shrink-0 text-red-600" />
      ) : (
        <Clock3 className="mt-px h-4 w-4 shrink-0 text-slate-500" />
      )}
      <span className={state === 'bad' ? 'font-semibold text-red-700' : 'text-slate-800'}>{children}</span>
    </li>
  );
}

export function Step6() {
  const card = useApp((s) => s.siteData.card);
  const lucCheck = useApp((s) => s.siteData.lucCheck);
  const lucSaved = useApp((s) => s.form.lucSaved);
  const passport = useApp((s) => s.student?.passport ?? '');
  const f = useApp((s) => s.form);
  const stampFile = useApp((s) => s.siteData.stampFile);
  const stampUploaded = useApp((s) => !!s.siteData.stampUploaded);
  const stampDoc = useApp((s) => s.docs.stamp);
  const stampBusy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'stamp')]);
  const saved = useApp((s) => !!s.saves.visa);
  const confirmed = useApp((s) => !!s.siteData.visaConfirmed);
  const busy = useApp((s) => !!s.busy[busyKeyFor(s.runId, 'visa')]);
  const status = useApp((s) => s.steps[6].status);
  const missing = useAppList(visaMissing);
  const locked = saved || busy;

  const footer = !confirmed && (
    <>
      <div className="flex-1">
        <MissingList items={missing} />
      </div>
      <Button size="lg" onClick={() => void submitVisa()} loading={busy} loadingText="Submitting…" disabled={!card || missing.length > 0} className="sm:min-w-[220px]">
        Submit Visa Information
      </Button>
    </>
  );

  const step5Empty = !f.issueDate && !f.expiryDate;

  return (
    <StepShell step={6} footer={footer}>
      {confirmed && (
        <Alert tone="success" title="Visa information submitted">
          The site confirmed the save. Nothing else is needed from Admission Assistance.
        </Alert>
      )}
      {!card ? (
        status !== 'error' && <FieldsLoading label="Finding the student on Admission Assistance…" rows={2} />
      ) : (
        <>
          <div className="space-y-2">
            <SubHeading title="Find the student" note="Done by the tool on the Pre Medical tab." />
            <ul>
              <Check state="ok">
                Student found: <b className="font-semibold">{card.name}</b>
              </Check>
              <Check state={card.passportNo === passport ? 'ok' : 'bad'}>
                Passport No on the card is <span className="font-mono font-semibold">{card.passportNo}</span>
              </Check>
              <Check state={lucCheck === 'ok' ? 'ok' : lucCheck === 'bad' ? 'bad' : 'waiting'}>
                {lucCheck === 'ok' ? (
                  <>
                    Admission ID <span className="font-mono font-semibold">{card.admissionId}</span> matches the LUC number from step 1
                  </>
                ) : lucCheck === 'bad' ? (
                  <>
                    Admission ID <span className="font-mono">{card.admissionId}</span> is not the LUC number from step 1 (
                    <span className="font-mono">{lucSaved}</span>)
                  </>
                ) : (
                  <>Admission ID {card.admissionId} waits for the LUC number from step 1</>
                )}
              </Check>
            </ul>
          </div>

          <div className="space-y-4">
            <SubHeading title="Visa information" note="Enter the details exactly as printed on the visa page." />
            {step5Empty && !saved && (
              <Alert tone="info">The two dates fill in here as soon as you type them in step 5. You can check them again here.</Alert>
            )}
            <div className="grid gap-x-4 gap-y-5 md:grid-cols-2 2xl:grid-cols-3">
              <Field label="Visa Number" required tag={<Badge tone="slate">Filled by the tool</Badge>} help="The passport number goes here, as agreed.">
                <ReadValue value={passport} mono />
              </Field>
              <DateField
                id="visaIssueDate"
                label="Visa Issue Date"
                required
                value={f.visaIssueDate}
                onChange={setVisaIssueDate}
                error={issueDateError(f.visaIssueDate)}
                warning={
                  f.visaIssueEdited ? (
                    <>
                      Changed here only. Step 5 has {f.issueDate ? isoToDmy(f.issueDate) : 'no date'}; if step 5 is already submitted, change it on the
                      site by hand.
                    </>
                  ) : undefined
                }
                siteFormat="dmy"
                disabled={locked}
              />
              <DateField
                id="visaExpiryDate"
                label="Visa Expiry Date"
                required
                value={f.visaExpiryDate}
                onChange={setVisaExpiryDate}
                error={expiryDateError(f.visaIssueDate, f.visaExpiryDate)}
                warning={
                  f.visaExpiryEdited ? (
                    <>
                      Changed here only. Step 5 has {f.expiryDate ? isoToDmy(f.expiryDate) : 'no date'}; if step 5 is already submitted, change it on
                      the site by hand.
                    </>
                  ) : (
                    expiryWarning(f.visaExpiryDate)
                  )
                }
                siteFormat="dmy"
                disabled={locked}
              />
            </div>
            <Field label="Upload Visa Page" required help={!stampFile ? 'Scan the visa stamp in the passport, then add the scan here. The tool waits for it.' : undefined}>
              <Dropzone
                onFile={addStampFile}
                file={stampFile}
                uploading={stampBusy}
                uploaded={stampUploaded}
                failed={stampDoc.status === 'error'}
                disabled={!card}
                locked={locked}
              />
            </Field>
          </div>
        </>
      )}
    </StepShell>
  );
}
