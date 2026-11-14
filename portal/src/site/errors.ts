/** The site (or the portal's own tool) gave no answer. Reading tries again by itself; a save is checked first. */
export class NetworkError extends Error {
  constructor(message = 'No answer from the site') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** The site answered with its login page: it has logged the staff out. */
export class LoggedOutError extends Error {
  constructor() {
    super('The site logged you out');
    this.name = 'LoggedOutError';
  }
}
