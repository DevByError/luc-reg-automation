import type { SaveResult } from '../../shared/ops';
import type { Lane } from '../browser';
import { answerHeld, existingPage, takeDialogs } from '../browser';
import { SiteStop } from '../errors';

export const WHERE = {
  list: 'the Registration Forms list',
  report: 'the registration form report',
  form: 'the Admission Form',
  odl: 'the ODL Registration page',
  profile: 'the Admission Profile',
  applicant: 'Applicant Details [All]',
  files: 'Student Files',
  docs: "the student's documents tab",
  collection: 'Passport Collection',
  stages: 'Passport Movement Stages',
  assist: 'Admission Assistance',
};

/** The tab a lane works in. Stops if it was closed. */
export function needPage(lane: Lane, what: string) {
  const p = existingPage(lane);
  if (!p) throw new SiteStop(`${what} is not open`, `The tool's tab for ${what} was closed. Press Try again to open it again.`);
  return p;
}

/** After a click that saves: any popup the tool didn't expect goes to the staff. */
export function saveResult(lane: Lane): SaveResult {
  const seen = takeDialogs(lane).filter((d) => !d.known);
  if (seen.length === 0) return {};
  const last = seen[seen.length - 1];
  return last.heldId ? { popup: last.text, popupId: last.heldId } : { popup: seen.map((d) => d.text).join(' / ') };
}

/** After a read: a popup the tool doesn't know stops it, with the popup's text. */
export async function stopOnUnknownDialogs(lane: Lane, where: string, extra = '') {
  const seen = takeDialogs(lane);
  const unknown = seen.filter((d) => !d.known);
  for (const d of unknown) if (d.heldId) await answerHeld(d.heldId, false);
  if (unknown.length) {
    throw new SiteStop('The site showed a message', `On ${where} the site said: "${unknown.map((d) => d.text).join('" / "')}". ${extra || 'The tool stopped here.'}`);
  }
  return seen;
}

/** The same passport, whatever spaces or small letters the site shows. */
export const samePassport = (a: string, b: string) => a.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === b.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** yyyy-mm-dd ↔ dd/mm/yyyy */
export const isoToDmy = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
export const dmyToIso = (dmy: string) => {
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : dmy;
};
