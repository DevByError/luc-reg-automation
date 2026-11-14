import type { SiteNeeds } from '../shared/ops';

/** Problems an operation can report. The portal turns each into the right pause or message. */

export class SiteStop extends Error {
  constructor(
    public title: string,
    message: string,
    public rows?: { field: string; expected: string; actual: string }[],
  ) {
    super(message);
    this.name = 'SiteStop';
  }
}

export class SiteLoggedOut extends Error {
  constructor() {
    super('The site logged you out');
    this.name = 'SiteLoggedOut';
  }
}

export class SiteNetwork extends Error {
  constructor(message = "Couldn't reach online.lincoln.edu.my") {
    super(message);
    this.name = 'SiteNetwork';
  }
}

export class SiteCancelled extends Error {
  constructor() {
    super('A new student was started');
    this.name = 'SiteCancelled';
  }
}

/** The site refused a save and asks for fields the portal doesn't fill: the staff fills them in the portal. */
export class SiteNeedsStop extends SiteStop {
  constructor(
    title: string,
    message: string,
    public needs: SiteNeeds,
  ) {
    super(title, message);
    this.name = 'SiteNeedsStop';
  }
}

/** An element the tool needs isn't on the page, or more than one matches. */
export class SiteChanged extends SiteStop {
  constructor(title: string, message: string) {
    super(title, message);
    this.name = 'SiteChanged';
  }
}
