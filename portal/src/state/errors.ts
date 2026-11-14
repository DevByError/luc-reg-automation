import type { StepError } from './types';

/** Stops a step with a message for the staff. */
export class StopError extends Error {
  constructor(
    public title: string,
    message: string,
    public extra: Partial<StepError> = {},
  ) {
    super(message);
    this.name = 'StopError';
  }
}

/** The staff started another student; old work just ends quietly. */
export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'Cancelled';
  }
}
