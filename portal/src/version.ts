/**
 * When this copy of the portal was made, in the time of the office computers. It shows at the top of the portal,
 * so each computer can be checked to have the latest copy.
 */
export const VERSION = { date: '2026-11-06', time: '10:45' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "4 Nov 2026, 18:30" */
export function versionText(): string {
  const [y, m, d] = VERSION.date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}, ${VERSION.time}`;
}
