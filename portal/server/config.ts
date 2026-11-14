import os from 'node:os';
import path from 'node:path';

/** The site the tool works on. Tests point this at a practice copy. */
export const SITE_URL = (process.env.PORTAL_SITE_URL || 'https://online.lincoln.edu.my').replace(/\/+$/, '');
/** The site's host. "www.online..." and "online..." are the same site. */
export const SITE_HOST = new URL(SITE_URL).host.replace(/^www\./i, '');

/** Page addresses from the flow map. */
export const PAGES = {
  registrationList: '/inso_post_admisn/newreg_form_updsts.aspx',
  admissionForm: '/admin_stf/stdnew.aspx',
  applicantDetails: '/Subagentport/vwappldet_all.aspx',
  studentFiles: '/stdfile_orgnl/stdinfcenter.aspx',
  passportMovement: '/studentaffairs/passportMovementControl.aspx',
  admissionAssistance: '/admin_stf/AdmissionAssistance.aspx',
  /** Stage 0: the A/c Mini Statement. */
  miniStatement: '/mininew/rpt_printministatement.aspx',
  /** Verify / Upload English Result: opened by its own address after Final Submit. */
  englishResult: '/admin_stf/verify_eng_res.aspx',
} as const;

/** A light page used to check the login without opening a tab. */
export const LOGIN_PROBE = PAGES.admissionForm;

export const siteUrl = (p: string) => (/^https?:/i.test(p) ? p : SITE_URL + p);

/** Where the site window keeps its own data (cookies and so on). Outside the portal folder. */
export function browserProfileDir(): string {
  if (process.env.PORTAL_BROWSER_PROFILE) return process.env.PORTAL_BROWSER_PROFILE;
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'Registration Portal', 'site-window');
}

/** Tests only: run a given browser without a window. */
export const BROWSER_PATH = process.env.PORTAL_BROWSER_PATH || '';
export const HEADLESS = process.env.PORTAL_HEADLESS === '1';

/** Waits. Reads give up before the portal's own limit (90 s) so the portal gets a clear answer. */
export const WAIT = {
  page: 60_000,
  settle: 60_000,
  save: 90_000,
  element: 15_000,
  download: 60_000,
  newTab: 20_000,
};
