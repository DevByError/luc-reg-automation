/**
 * The one way the portal asks the site for something. Sample mode answers with made-up data;
 * live mode asks the tool on this computer, which works in the site window.
 */
import type { OpArgs, OpName, OpResult } from '../../shared/ops';
import { app } from '../state/store';
import { ensureSession, liveCall } from './live';
import { mockHandlers, resetSample } from './mock';

export const isLive = () => app.get().settings.mode === 'live';

export function call<K extends OpName>(run: number, name: K, args: OpArgs<K>): Promise<OpResult<K>> {
  const s = app.get();
  if (s.settings.mode !== 'live') return (mockHandlers[name] as (a: OpArgs<K>) => Promise<OpResult<K>>)(args);
  return liveCall(run, s.student?.passport ?? '', name, args, () => app.get().runId === run);
}

/** A new student: the tool closes the old student's tabs before anything else runs. */
export function beginStudent(run: number, passport: string) {
  if (isLive()) ensureSession(run, passport).catch(() => undefined);
  else resetSample();
}
