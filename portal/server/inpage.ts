/**
 * Helpers that run inside the site's own pages (every page and frame of the site window).
 * The tool finds fields the way a person does: by the label written next to them.
 *
 * This function is sent to the browser as text, so it must not use anything from outside itself.
 */
export function installPortalHelpers() {
  const w = window as unknown as Record<string, unknown>;
  if (w.__portal) return;

  const canon = (s: string | null | undefined): string => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

  const visible = (el: Element | null | undefined): boolean => {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    return el.getClientRects().length > 0;
  };

  const ownText = (el: Element): string => {
    let t = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) t += n.textContent || '';
    });
    return t;
  };

  const isControl = (el: Element): boolean => {
    if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return !['hidden', 'submit', 'button', 'image', 'reset'].includes(el.type);
    return false;
  };

  const kindOf = (el: Element): string => {
    if (el instanceof HTMLSelectElement) return 'select';
    if (el instanceof HTMLTextAreaElement) return 'text';
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'date') return el.type;
      return 'text';
    }
    return 'other';
  };

  /**
   * A file box is often hidden behind a nicer button; it counts if its surroundings show. With hiddenFile it
   * counts even when hidden (the site's own "Click to choose a file" area stands in for it), if it takes a file.
   */
  const usable = (el: Element, hiddenFile = false): boolean =>
    isControl(el) &&
    (visible(el) || (el instanceof HTMLInputElement && el.type === 'file' && (visible(el.parentElement) || (hiddenFile && !el.disabled))));

  let seq = 0;
  const mark = (el: Element): string => {
    let m = el.getAttribute('data-portal');
    if (!m) {
      seq += 1;
      m = `m${Date.now().toString(36)}${seq}`;
      el.setAttribute('data-portal', m);
    }
    return m;
  };

  const LABEL_TAGS = 'label,span,td,th,div,b,strong,p,font,legend,h1,h2,h3,h4,h5,h6,li,dt,dd,em,i,small';

  const matches = (text: string, want: string, prefix: boolean) => !!text && (prefix ? text.startsWith(want) : text === want);

  /** Elements whose text is exactly the label (letters and digits only, so "Passport No :" = "Passport No"). */
  const labelElements = (want: string, prefix: boolean): Element[] => {
    const out: Element[] = [];
    document.querySelectorAll(LABEL_TAGS).forEach((el) => {
      if (!visible(el)) return;
      // Tab names and links are not labels ("Address" the tab is not "Address" the field).
      if (el.closest('a,button,[role=tab],[role=tablist],[class*="tab_header"],[class*="nav-tabs"]')) return;
      const own = canon(ownText(el));
      const full = el.querySelector('input,select,textarea,table,button') ? '' : canon(el.textContent);
      if (matches(own, want, prefix) || (full.length < 160 && matches(full, want, prefix))) out.push(el);
    });
    return out.filter((el) => !out.some((o) => o !== el && el.contains(o)));
  };

  /** The first control after a label, in reading order. Stops at the next label. */
  const controlAfter = (start: Element, kinds: string[] | null, maxTexts = 1, hiddenFile = false): Element | null => {
    const all = Array.from(document.body.querySelectorAll('*'));
    const i = all.indexOf(start);
    if (i < 0) return null;
    let j = i + 1;
    while (j < all.length && start.contains(all[j])) j += 1;
    let texts = 0;
    for (let k = j; k < all.length && k < j + 120; k += 1) {
      const el = all[k];
      if (isControl(el)) {
        if (!usable(el, hiddenFile)) continue;
        if (!kinds || kinds.includes(kindOf(el))) return el;
        continue;
      }
      if (el instanceof HTMLButtonElement || el instanceof HTMLOptionElement) continue;
      if (visible(el) && canon(ownText(el)).length >= 3) {
        texts += 1;
        if (texts > maxTexts) return null;
      }
    }
    return null;
  };

  /** Every control labelled `label`. More than one means the tool must not guess. */
  const findLabelled = (label: string, opts: { prefix?: boolean; kinds?: string[] | null; nth?: number; hiddenFile?: boolean }) => {
    const want = canon(label);
    const prefix = !!opts.prefix;
    const kinds = opts.kinds && opts.kinds.length ? opts.kinds : null;
    const hf = !!opts.hiddenFile;
    const found = new Set<Element>();
    const take = (el: Element | null | undefined) => {
      if (el && usable(el, hf) && (!kinds || kinds.includes(kindOf(el)))) found.add(el);
    };
    for (const el of labelElements(want, prefix)) {
      if (el instanceof HTMLLabelElement && el.htmlFor) {
        take(document.getElementById(el.htmlFor));
        continue;
      }
      const inside = Array.from(el.querySelectorAll('input,select,textarea')).filter((c) => usable(c, hf));
      if (el instanceof HTMLLabelElement && inside.length) {
        take(inside[0]);
        continue;
      }
      if (opts.nth && opts.nth > 1) {
        // Fields with two boxes under one label, such as country code + number.
        let cur: Element | null = el;
        let hit: Element | null = null;
        // From the first box to the next, no other label may come in between.
        for (let n = 0; n < opts.nth && cur; n += 1) {
          hit = controlAfter(cur, kinds, n === 0 ? 1 : 0, hf);
          cur = hit;
        }
        take(hit);
      } else {
        take(controlAfter(el, kinds, 1, hf));
      }
    }
    document.querySelectorAll('input,select,textarea').forEach((el) => {
      if (!usable(el, hf)) return;
      const names = [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('title')];
      if (names.some((n) => matches(canon(n), want, prefix))) take(el);
    });
    return Array.from(found).map((el) => ({
      mark: mark(el),
      kind: kindOf(el),
      id: el.id,
      name: el.getAttribute('name') || '',
    }));
  };

  /**
   * Fields by the id the site gives them, for fields whose ids were read from the real pages
   * (ContentPlaceHolder1_maintabcontainer_Tab1_ddlintake ends with "ddlintake"). Only fields that show
   * (and, with hiddenFile, a file box hidden behind the site's own upload area).
   */
  const findById = (suffixes: string[], kinds: string[] | null, hiddenFile = false) => {
    const found = new Set<Element>();
    for (const s of suffixes) {
      // "*" = any file box on the page (for a page that has just one, whose id isn't known).
      const q = s === '*' ? 'input[type=file]' : `[id="${CSS.escape(s)}"],[id$="_${CSS.escape(s)}"]`;
      document.querySelectorAll(q).forEach((el) => {
        if (usable(el, hiddenFile) && (!kinds || kinds.includes(kindOf(el)))) found.add(el);
      });
    }
    return Array.from(found).map((el) => ({ mark: mark(el), kind: kindOf(el), id: el.id, name: el.getAttribute('name') || '' }));
  };

  /** The words next to a tick-one choice: its label, or the text right after it. */
  const radioLabel = (r: HTMLInputElement): string => {
    if (r.id) {
      const l = document.querySelector(`label[for="${CSS.escape(r.id)}"]`);
      if (l) return clean(l.textContent);
    }
    const wrap = r.closest('label');
    if (wrap) return clean(wrap.textContent);
    let t = '';
    for (let n: ChildNode | null = r.nextSibling; n && !(n instanceof HTMLInputElement); n = n.nextSibling) {
      t += n.textContent || '';
      if (clean(t)) break;
    }
    return clean(t);
  };

  type RadioInfo = { mark: string; label: string; checked: boolean; disabled: boolean };
  const radioInfo = (r: HTMLInputElement): RadioInfo => ({ mark: mark(r), label: radioLabel(r), checked: r.checked, disabled: r.disabled });

  /** Every choice of the tick-one list that this choice belongs to (the same name, the same form). */
  const radioGroupOf = (m: string) => {
    const first = document.querySelector(`[data-portal="${m}"]`);
    if (!(first instanceof HTMLInputElement) || first.type !== 'radio' || !first.name) return null;
    const all = Array.from(document.querySelectorAll('input[type=radio]')) as HTMLInputElement[];
    const group = all.filter((r) => r.name === first.name && r.form === first.form && visible(r));
    return { name: first.name, options: group.map(radioInfo) };
  };

  /** Tick-one lists whose name ends with one of these, as ASP.NET names them ("...$Tab1$rbp_visatype"). */
  const radioGroupsByName = (suffixes: string[]) => {
    const names = new Set<string>();
    document.querySelectorAll('input[type=radio]').forEach((r) => {
      const n = (r as HTMLInputElement).name;
      if (n && visible(r) && suffixes.some((s) => n === s || n.endsWith('$' + s) || n.endsWith('_' + s))) names.add(n);
    });
    return Array.from(names).map((n) => {
      const group = (Array.from(document.querySelectorAll('input[type=radio]')) as HTMLInputElement[]).filter((r) => r.name === n && visible(r));
      return { name: n, options: group.map(radioInfo) };
    });
  };

  const buttonName = (el: Element): string => {
    if (el instanceof HTMLInputElement) return el.value || el.title || el.alt || '';
    return clean(el.textContent) || el.getAttribute('title') || el.getAttribute('aria-label') || '';
  };

  const BUTTON_SEL = 'input[type=submit],input[type=button],input[type=image],input[type=reset],button,a,[role=button],[onclick]';

  /** Buttons and links whose visible name is exactly `name`. */
  const findButtons = (name: string, opts: { prefix?: boolean; within?: string }) => {
    const want = canon(name);
    const root: ParentNode = opts.within ? document.querySelector(`[data-portal="${opts.within}"]`) || document : document;
    const hits: Element[] = [];
    root.querySelectorAll(BUTTON_SEL).forEach((el) => {
      if (!visible(el)) return;
      if (matches(canon(buttonName(el)), want, !!opts.prefix)) hits.push(el);
    });
    const inner = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
    return inner.map((el) => ({ mark: mark(el), name: clean(buttonName(el)), tag: el.tagName.toLowerCase() }));
  };

  /**
   * The buttons named `name` that belong with a box: the smallest part of the page around the box
   * that has such a button. A page-wide Search in the site's top bar is never the one next to a box.
   */
  const buttonsNear = (name: string, nearMark: string, prefix: boolean) => {
    const box = document.querySelector(`[data-portal="${nearMark}"]`);
    if (!box) return [];
    for (let cur = box.parentElement, n = 0; cur && n < 6; cur = cur.parentElement, n += 1) {
      const hits = findButtons(name, { prefix, within: mark(cur) });
      if (hits.length) return hits;
    }
    return [];
  };

  /** The header of a tab named `name`: tab strips made of links, list items or plain text. */
  const tabHeaders = (name: string) => {
    const want = canon(name);
    const hits: Element[] = [];
    document.querySelectorAll('[id^="__tab_"],[class*="ajax__tab_tab"],[role=tab],.nav-tabs a,.nav-tabs li,.nav-pills a,a.nav-link,button.nav-link').forEach((el) => {
      if (visible(el) && canon(el.textContent) === want) hits.push(el);
    });
    const inner = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
    return inner.map((el) => mark(el));
  };

  /**
   * A cell's text as it shows, with its lines apart: "Name: X Student ID: Y Passport No: Z",
   * never "…Passport No: ZAcademic Year" as the raw text would run them together.
   */
  const cellText = (c: Element): string => clean((c as HTMLElement).innerText ?? c.textContent);

  /** The text of each cell of a row, the same way tables are read. */
  const rowCells = (m: string): string[] | null => {
    const tr = document.querySelector(`[data-portal="${m}"]`);
    return tr instanceof HTMLTableRowElement ? Array.from(tr.cells).map(cellText) : null;
  };

  /** Reads a table: its headings and the text of each row that shows. */
  const tableInfo = (t: HTMLTableElement) => {
    const rows = Array.from(t.rows);
    let head = rows.findIndex((r) => Array.from(r.cells).some((c) => c.tagName === 'TH'));
    if (head < 0) head = t.tHead && t.tHead.rows.length ? rows.indexOf(t.tHead.rows[0]) : 0;
    const headers = rows[head] ? Array.from(rows[head].cells).map((c) => clean(c.textContent)) : [];
    const body = rows
      .slice(head + 1)
      .filter((r) => visible(r))
      .map((r) => ({ mark: mark(r), cells: Array.from(r.cells).map(cellText) }));
    return { mark: mark(t), headers, rows: body };
  };

  /** Visible tables that have every one of these headings. */
  const findTables = (headings: string[]) => {
    const want = headings.map(canon);
    const out: ReturnType<typeof tableInfo>[] = [];
    document.querySelectorAll('table').forEach((t) => {
      if (!visible(t)) return;
      const info = tableInfo(t);
      const have = info.headers.map(canon);
      if (want.every((h) => have.includes(h))) out.push(info);
    });
    const withRows = out.filter((t) => t.rows.length > 0);
    return withRows.length ? withRows : out;
  };

  /** Something is still loading: the page, a postback, an AJAX call or a "Please wait" box. */
  const busy = (): string => {
    if (document.readyState !== 'complete') return 'page';
    const sys = (w.Sys || null) as { WebForms?: { PageRequestManager?: { getInstance?: () => { get_isInAsyncPostBack?: () => boolean } } } } | null;
    try {
      if (sys?.WebForms?.PageRequestManager?.getInstance?.()?.get_isInAsyncPostBack?.()) return 'postback';
    } catch {
      // Not an ASP.NET AJAX page.
    }
    const jq = w.jQuery as { active?: number } | undefined;
    if (jq && typeof jq.active === 'number' && jq.active > 0) return 'ajax';
    const boxes = document.querySelectorAll('[id*="UpdateProgress"],[id*="updateprogress"],[id*="AsyncWait"],[id*="asyncwait"]');
    for (const b of Array.from(boxes)) if (visible(b)) return 'wait-box';
    const all = document.querySelectorAll('div,span,p,td,img');
    for (const el of Array.from(all)) {
      const t = canon(ownText(el)) || canon(el.getAttribute('alt'));
      if ((t === 'pleasewait' || t === 'loading' || t === 'processing' || t === 'pleasewaitloading') && visible(el)) return 'wait-box';
    }
    return '';
  };

  const pageText = () => canon(document.body ? document.body.innerText : '');

  const valueOf = (m: string) => {
    const el = document.querySelector(`[data-portal="${m}"]`);
    if (!el) return null;
    if (el instanceof HTMLSelectElement) {
      const opt = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      return { kind: 'select', value: opt ? clean(opt.text) : '', raw: el.value };
    }
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      return { kind: el.type, value: el.checked ? 'checked' : '', raw: el.value };
    }
    if (el instanceof HTMLInputElement && el.type === 'file') {
      return { kind: 'file', value: el.files && el.files.length ? el.files[0].name : '', raw: String(el.files ? el.files.length : 0) };
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return { kind: el instanceof HTMLInputElement ? el.type : 'textarea', value: el.value, raw: el.value };
    }
    return { kind: 'other', value: clean(el.textContent), raw: '' };
  };

  const optionsOf = (m: string) => {
    const el = document.querySelector(`[data-portal="${m}"]`);
    if (!(el instanceof HTMLSelectElement)) return [];
    return Array.from(el.options).map((o, index) => ({ index, text: clean(o.text), value: o.value }));
  };

  /** The page layout only: field names, buttons, headings. Never values or student details. */
  const layout = () => {
    // Only words a form uses are kept. Any other word (a name, for example) becomes "•",
    // and numbers of 3 digits or more become "#", so no student detail can end up in the file.
    const WORDS = new Set(
      (
        'a an the of and or to in on at for by with from as is are be this that your you our all any no not yes ok new old other others more only per below above here please click me ' +
        'view details detail list search find filter show showing entries entry records record page pages next previous prev first last total select selected choose none data found ' +
        'verify submit submitted reset clear close open save saved update updated edit delete remove add cancel back continue print download upload uploaded export refresh go home ' +
        'menu help logout login log out sign user staff admin dashboard report reports viewer letter form forms file files document documents image url date time day month year years ' +
        'today until status stage stages remark remarks reason access state information info profile personal contact number id code name names type types category class intake ' +
        'course program programme faculty school institution university college campus centre center student students applicant applicants application applications admission ' +
        'admissions registration register registered post pre medical assistance visa passport movement control collection holding received receive issue issued expiry expire ' +
        'expired method place birth email phone mobile whatsapp wechat address city town village province postal zip country nationality relationship occupation father mother ' +
        'guardian parent parents family sponsor employer government self finance financer fees fee tuition tution scholarship foundation lincoln semester payment plan final kpt ' +
        'english proficiency certicate certificate certificates result results profency medium instruction highest qualification spm stpm diploma degree bachelor master doctorate ' +
        'secondary senior accommodation hostel own local social visit airport pickup normal credit transfer prerequisite office sabah dependent pass employment resident pr rp eval ' +
        'without renew extension checkout memo shorten special quit withdraw endorsment endorsement approval approvalurl emgs val odl enter ic mr mrs ms miss dr prof datuk encik ' +
        'salutation gender male female religion race marital transaction confirm confirmed success successfully error failed invalid required optional soon current currently ' +
        'active inactive true false inso ready submission step steps tab tabs section sl sno action actions pending approved rejected complete completed process processing ' +
        'loading wait sms notification sent send message alert warning note notes ptptn jpa mara yayasan jpk bkns ph phd pg advance advanced university pre secondary certificate ' +
        'mykad nric luc online lucodl portal assistant agent sub subagent counsellor counselor batch level academic session semester image images scan scanned stamp page ' +
        'uploads uploading progress drag drop replace change done pdf jpg jpeg png mb kb size max allowed background immediately chosen browse too big large limit fail failure ' +
        'retry try again test tests score scores marks band overall exam examination language moi ielts toefl ibt linguaskill muet pearson pte els reading writing ' +
        'listening speaking obtained already booking room single'
      ).split(' '),
    );
    const S = (t: string | null | undefined, max = 60) => {
      let s = clean(t);
      if (s.length > max) s = s.slice(0, max) + '…';
      return s
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/\d{3,}/g, (d) => '#'.repeat(Math.min(d.length, 6)))
        .replace(/[A-Za-z]+/g, (w) => (WORDS.has(w.toLowerCase()) ? w : '•'));
    };
    /** Page addresses and class names: kept, but long numbers are hidden. */
    const D = (t: string | null | undefined, max = 80) => {
      let s = clean(t);
      if (s.length > max) s = s.slice(0, max) + '…';
      return s.replace(/\d{4,}/g, '#');
    };
    const ACTION = /^(view|view details|print|complete|upload|edit|edit form|download|select|submit|update|delete|approval|details|open|save|search|ok|cancel|back|next|continue to next|click me to view all documents)$/i;
    const labelGuess = (el: Element): string => {
      const id = el.id;
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l) return S(l.textContent);
      }
      const wrap = el.closest('label');
      if (wrap) return S(ownText(wrap));
      for (const a of ['aria-label', 'placeholder', 'title']) {
        const v = el.getAttribute(a);
        if (v) return `${a}: ${S(v)}`;
      }
      const cell = el.closest('td');
      if (cell && cell.previousElementSibling && cell.previousElementSibling.tagName === 'TD') {
        const prev = cell.previousElementSibling;
        if (!prev.querySelector('input,select,textarea')) return `cell: ${S(prev.textContent)}`;
      }
      let p = el.previousElementSibling;
      for (let n = 0; p && n < 3; n += 1, p = p.previousElementSibling) {
        const t = clean(p.textContent);
        if (t && /[:*]$/.test(t)) return `before: ${S(t)}`;
        if (p.tagName === 'LABEL' || p.tagName === 'TH') return `before: ${S(t)}`;
      }
      return '';
    };
    const controls: unknown[] = [];
    document.querySelectorAll('input,select,textarea').forEach((el) => {
      const input = el as HTMLInputElement;
      if (input.type === 'hidden') return;
      controls.push({
        tag: el.tagName.toLowerCase(),
        type: input.type || '',
        id: D(el.id),
        name: D(el.getAttribute('name') || ''),
        label: labelGuess(el),
        visible: visible(el),
        disabled: input.disabled || undefined,
        readOnly: input.readOnly || undefined,
        options: el instanceof HTMLSelectElement ? Array.from(el.options).slice(0, 40).map((o) => S(o.text, 40)) : undefined,
      });
    });
    const buttons: unknown[] = [];
    document.querySelectorAll(BUTTON_SEL).forEach((el) => {
      if (!visible(el)) return;
      const inBody = !!el.closest('tbody') && !!el.closest('td');
      const name = clean(buttonName(el));
      buttons.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        id: D(el.id),
        text: inBody ? (ACTION.test(name) ? name : name ? `(hidden, ${name.length} letters)` : '') : S(name),
        href: el instanceof HTMLAnchorElement ? D((el.getAttribute('href') || '').replace(/\?.*$/, '?…')) : undefined,
      });
    });
    const tables: unknown[] = [];
    document.querySelectorAll('table').forEach((t) => {
      if (!visible(t)) return;
      const info = tableInfo(t as HTMLTableElement);
      const first = (t as HTMLTableElement).rows[Math.min((t as HTMLTableElement).rows.length - 1, 1)];
      tables.push({
        id: D(t.id),
        className: D(t.className),
        headers: info.headers.map((h) => S(h, 40)),
        rows: info.rows.length,
        firstRowShape: first
          ? Array.from(first.cells).map((c) => {
              const parts: string[] = [];
              c.querySelectorAll('a,input,select,textarea,img,button').forEach((x) => {
                const nm = clean(buttonName(x));
                parts.push(
                  x.tagName.toLowerCase() +
                    (x instanceof HTMLInputElement ? `:${x.type}` : '') +
                    (ACTION.test(nm) ? `:${nm}` : ''),
                );
              });
              return parts.length ? parts.join('+') : clean(c.textContent) ? 'text' : 'empty';
            })
          : [],
      });
    });
    const texts: string[] = [];
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,label,th,[role=tab]').forEach((el) => {
      if (texts.length < 200 && visible(el)) texts.push(`${el.tagName.toLowerCase()}: ${S(el.textContent)}`);
    });
    document.querySelectorAll('span,td,div,b,strong,p,font').forEach((el) => {
      const t = clean(ownText(el));
      if (texts.length < 300 && t && t.length < 60 && /[:*]$/.test(t) && visible(el)) texts.push(`label: ${S(t)}`);
    });
    const tabs: unknown[] = [];
    document.querySelectorAll('[role=tab],.nav-tabs a,.nav-tabs li,[class*="tab"] a,[class*="Tab"] a,[id*="Tab"] a,[id*="tab"] a,[id^="__tab_"],[class*="ajax__tab_tab"]').forEach((el) => {
      if (!visible(el) || tabs.length > 40) return;
      const cls = `${el.className} ${el.parentElement ? el.parentElement.className : ''}`;
      // The classes and style show how this site marks the open tab, if the tool doesn't recognise it.
      tabs.push({
        text: S(el.textContent, 40),
        active: /active|selected|current/i.test(cls) || el.getAttribute('aria-selected') === 'true',
        classes: D(cls, 120),
        style: D(el.getAttribute('style') || (el.parentElement && el.parentElement.getAttribute('style')) || '', 120),
      });
    });
    // File boxes and what their upload area shows, so a site's own upload widget can be understood.
    const uploads: unknown[] = [];
    document.querySelectorAll('input[type=file]').forEach((el) => {
      if (uploads.length >= 6) return;
      const parents: string[] = [];
      let area = '';
      for (let p = el.parentElement, n = 0; p && n < 4; p = p.parentElement, n += 1) {
        const cls = typeof p.className === 'string' && p.className.trim() ? '.' + D(p.className, 60).trim().replace(/\s+/g, '.') : '';
        parents.push(`${p.tagName.toLowerCase()}${p.id ? '#' + D(p.id, 40) : ''}${cls}${visible(p) ? '' : ' (hidden)'}`);
        if (!area && visible(p)) area = S((p as HTMLElement).innerText, 240);
      }
      const input = el as HTMLInputElement;
      uploads.push({
        id: D(input.id),
        visible: visible(input),
        accept: D(input.getAttribute('accept') || '', 60),
        files: input.files ? input.files.length : 0,
        onchange: !!input.getAttribute('onchange') || undefined,
        parents,
        area,
      });
    });
    const frames = Array.from(document.querySelectorAll('iframe,frame')).map((f) => ({
      id: D(f.id),
      name: D(f.getAttribute('name') || ''),
      src: D((f.getAttribute('src') || '').replace(/\?.*$/, '?…'), 100),
      visible: visible(f),
    }));
    return {
      path: D(location.pathname, 120),
      queryNames: Array.from(new URLSearchParams(location.search).keys()),
      title: S(document.title, 80),
      busy: busy(),
      controls,
      buttons,
      tables,
      tabs,
      texts,
      uploads,
      frames,
    };
  };

  /** Table rows that have a cell whose whole text is `text` ("Student Type Document", not "... English Pre"). */
  const rowsWithCell = (text: string) => {
    const want = canon(text);
    const out: string[] = [];
    document.querySelectorAll('tr').forEach((tr) => {
      if (!visible(tr)) return;
      const cells = Array.from((tr as HTMLTableRowElement).cells);
      if (cells.some((c) => canon(c.textContent) === want || Array.from(c.querySelectorAll('a,span,b,label')).some((x) => canon(x.textContent) === want))) {
        out.push(mark(tr));
      }
    });
    return out.filter((m) => {
      const tr = document.querySelector(`[data-portal="${m}"]`);
      return !out.some((o) => o !== m && tr && tr.contains(document.querySelector(`[data-portal="${o}"]`)));
    });
  };

  /** The link in a row that gives the file: a real address first, otherwise something clickable. */
  const fileLinkIn = (rowMark: string, skipText: string) => {
    const row = document.querySelector(`[data-portal="${rowMark}"]`);
    if (!row) return null;
    const skip = canon(skipText);
    // An empty address ("") is no file: the browser would read it as the page itself.
    const links = (Array.from(row.querySelectorAll('a[href]')) as HTMLAnchorElement[]).filter((a) => {
      const h = (a.getAttribute('href') || '').trim();
      return h !== '' && !/^(#|javascript:)/i.test(h);
    });
    const real = links.find((a) => visible(a));
    if (real) return { mark: mark(real), name: clean(real.textContent) || real.title || '', href: real.href };
    const clickable = Array.from(row.querySelectorAll('a,input[type=image],input[type=submit],input[type=button],button,img[onclick],[onclick]')).find(
      (x) => visible(x) && canon(x.textContent) !== skip,
    );
    if (!clickable) return null;
    const name = clickable instanceof HTMLInputElement ? clickable.value || clickable.title || clickable.alt : clean(clickable.textContent) || clickable.getAttribute('title') || '';
    return { mark: mark(clickable), name, href: '' };
  };

  /** Controls inside one row, such as the Select tick box or the Remark box of a table row. */
  const rowControls = (rowMark: string) => {
    const row = document.querySelector(`[data-portal="${rowMark}"]`);
    if (!row) return [];
    return Array.from(row.querySelectorAll('input,select,textarea'))
      .filter((c) => usable(c))
      .map((c) => ({ mark: mark(c), kind: kindOf(c), id: c.id, name: c.getAttribute('name') || '' }));
  };

  /**
   * The text shown after a label that has no box, as on a student card. Three shapes:
   * "<b>Passport No:</b> A1234567" (text right after the label), "Passport No: A1234567" in one piece,
   * and the label and its value in two boxes one after the other.
   */
  const textAfter = (label: string) => {
    const want = canon(label);
    const out: string[] = [];
    const strip = (t: string) => clean(t).replace(/^[:\-–]+\s*/, '').trim();
    for (const el of labelElements(want, false)) {
      // Text in the same parent, right after the label.
      let sib: ChildNode | null = el.nextSibling;
      let inline = '';
      while (sib) {
        if (sib.nodeType === Node.TEXT_NODE) inline += sib.textContent || '';
        else if (sib instanceof Element) {
          if (!visible(sib)) {
            sib = sib.nextSibling;
            continue;
          }
          // A value in its own box right after the label; another label (ending in ":") means no value.
          if (canon(sib.textContent) && !strip(inline) && !/:\s*$/.test(clean(sib.textContent))) inline += sib.textContent || '';
          break;
        }
        sib = sib.nextSibling;
      }
      if (strip(inline)) {
        out.push(strip(inline));
        continue;
      }
      const all = Array.from(document.body.querySelectorAll('*'));
      let j = all.indexOf(el) + 1;
      while (j < all.length && el.contains(all[j])) j += 1;
      for (let k = j; k < all.length && k < j + 15; k += 1) {
        const t = clean(ownText(all[k]));
        if (t && visible(all[k]) && !/^[:\-–]+$/.test(t)) {
          // The next label, not a value: this label shows nothing.
          if (!/:\s*$/.test(t)) out.push(strip(t));
          break;
        }
      }
    }
    // "Label: value" written in one piece.
    const words = clean(label).split(' ').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    const re = new RegExp(`^${words}\\s*[:\\-–]\\s*(.+)$`, 'i');
    document.querySelectorAll(LABEL_TAGS).forEach((el) => {
      if (!visible(el)) return;
      const t = clean(ownText(el));
      const m = t.match(re);
      if (m && clean(m[1])) out.push(clean(m[1]));
    });
    return out;
  };

  /**
   * What a label shows when the page writes a value as text instead of a box ("KPT Fees :" then "17777.78").
   * One entry per label on the page (table headings are not labels): its box if it has one,
   * otherwise the text right after it, '' when the next thing is another label or outside the label's group.
   */
  const shownAfter = (label: string, prefix: boolean) => {
    const want = canon(label);
    const all = Array.from(document.body.querySelectorAll('*'));
    const isLabel = (e: Element, t: string) => e.tagName === 'LABEL' || e.tagName === 'TH' || /:\s*$/.test(t);
    return labelElements(want, prefix)
      .filter((el) => !el.closest('th') && !(el.closest('td') && el.closest('table')?.querySelector('th')))
      .map((el) => {
        const strip = (t: string) => clean(t).replace(/^[:\-–]+\s*/, '').trim();
        // "KPT Fees : 17777.78" in one piece.
        const words = clean(label).split(' ').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
        const one = clean(ownText(el)).match(new RegExp(`^${words}\\s*[:\\-–]\\s*(.+)$`, 'i'));
        if (one && strip(one[1])) return { box: '', value: strip(one[1]) };
        // Text written right after the label in the same parent: <label>KPT Fees :</label> 17777.78
        let inline = '';
        for (let sib = el.nextSibling; sib && sib.nodeType === Node.TEXT_NODE; sib = sib.nextSibling) inline += sib.textContent || '';
        if (strip(inline)) return { box: '', value: strip(inline) };
        let group: Element = el;
        for (let n = 0; n < 3 && group.parentElement && group.parentElement !== document.body; n += 1) group = group.parentElement;
        let j = all.indexOf(el) + 1;
        while (j < all.length && el.contains(all[j])) j += 1;
        for (let k = j; k < all.length && k < j + 40; k += 1) {
          const e = all[k];
          if (isControl(e)) {
            if (usable(e)) return { box: mark(e), value: '' };
            continue;
          }
          if (!visible(e)) continue;
          const t = clean(ownText(e));
          if (!t) continue;
          if (isLabel(e, t) || !group.contains(e)) return { box: '', value: '' };
          return { box: '', value: t };
        }
        return { box: '', value: '' };
      });
  };

  /**
   * After the site refused a save: the fields it asks for, among the fields that show. The signs, surest first:
   * an ASP.NET check that failed (Page_Validators), a field the page or the browser marks as wrong (aria-invalid,
   * an "error" class, a required box left empty), and an empty field whose label the site's message names
   * ("Please select Country"). When the site only says "fill all required fields", the empty fields marked * are taken.
   * `skip` holds the ids and names of the fields the portal fills itself: those are only reported by their label.
   */
  const siteNeeds = (messages: string[], skip: string[], opts: { marked: boolean; guess: boolean }) => {
    const words = (t: string) => (t || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const hasWords = (text: string, phrase: string) => {
      const t = words(text);
      const p = words(phrase);
      if (!p.length || p.length > t.length) return false;
      for (let i = 0; i + p.length <= t.length; i += 1) if (p.every((x, k) => t[i + k] === x)) return true;
      return false;
    };
    const ASKS = /\b(please|required|mandatory|must|cannot|can't|empty|blank|invalid|select|enter|fill|choose|provide)\b/i;
    const PLACEHOLDER = /^(-+|select\b|-+\s*select|please select|choose\b|-+\s*choose)/i;
    const skipped = (el: Element, key: string) => {
      const id = (el.id || '').toLowerCase();
      const k = key.toLowerCase();
      return skip.some((x) => {
        const s = x.toLowerCase();
        return id === s || id.endsWith('_' + s) || k === s || k.endsWith('$' + s) || k.endsWith('_' + s);
      });
    };
    type F = { el: Element; key: string; kind: string; radios: HTMLInputElement[] };
    const fieldOf = (el: Element): F | null => {
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        if (!el.name) return null;
        const radios = (Array.from(document.querySelectorAll('input[type=radio]')) as HTMLInputElement[]).filter(
          (r) => r.name === el.name && r.form === el.form && visible(r),
        );
        return radios.length ? { el: radios[0], key: el.name, kind: 'radio', radios } : null;
      }
      if (!isControl(el) || (el instanceof HTMLInputElement && el.type === 'file')) return null;
      const kind =
        el instanceof HTMLSelectElement
          ? 'select'
          : el instanceof HTMLInputElement && el.type === 'checkbox'
            ? 'checkbox'
            : el instanceof HTMLInputElement && el.type === 'date'
              ? 'date'
              : 'text';
      const key = el.id || el.getAttribute('name') || '';
      return key && visible(el) ? { el, key, kind, radios: [] } : null;
    };
    const emptyNow = (f: F): boolean => {
      const el = f.el;
      if (f.kind === 'radio') return !f.radios.some((r) => r.checked);
      if (el instanceof HTMLSelectElement) {
        const o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
        if (!o) return true;
        const v = (o.value || '').trim();
        const t = clean(o.text);
        return !t || v === '' || v === '0' || v === '-1' || PLACEHOLDER.test(t);
      }
      if (el instanceof HTMLInputElement && el.type === 'checkbox') return !el.checked;
      return !((el as HTMLInputElement).value || '').trim();
    };
    /**
     * The words a person reads as the field's name, and whether a * marks it: its own label, else the text right before it.
     * A box that follows another box with no words between (a middle name after a first name) has no label of its own:
     * its placeholder is used, and only `shared` (for showing it) goes on to the words before the first box.
     */
    const labelOf = (f: F, shared = false): { text: string; star: boolean } => {
      const tidy = (t: string) => clean(t).replace(/[\s:*]+$/, '').replace(/^[\s*]+/, '').trim();
      const el = f.el;
      if (f.kind !== 'radio' && el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l && clean(l.textContent)) return { text: tidy(l.textContent || ''), star: (l.textContent || '').includes('*') };
      }
      const named = el.getAttribute('aria-label');
      if (named) return { text: tidy(named), star: el.getAttribute('aria-required') === 'true' };
      // A tick-one list: start before the list around its choices (ASP.NET puts them in a table).
      let start: Element = el;
      if (f.kind === 'radio') {
        const box = el.closest('table,span[id],div[id]');
        if (box && f.radios.every((r) => box.contains(r))) start = box;
      }
      const all = Array.from(document.body.querySelectorAll('*'));
      const i = all.indexOf(start);
      let star = false;
      const own = tidy(el.getAttribute('placeholder') || el.getAttribute('title') || '');
      for (let k = i - 1; k >= 0 && k >= i - 60; k -= 1) {
        const e = all[k];
        if (e.contains(start) || e instanceof HTMLOptionElement || e.closest('select,script,style')) continue;
        if (isControl(e)) {
          if (visible(e) && !(f.kind === 'radio' && f.radios.includes(e as HTMLInputElement)) && (own || !shared)) return { text: own, star };
          continue;
        }
        const t = clean(ownText(e));
        if (!t || !visible(e)) continue;
        if (t === '*') {
          star = true;
          continue;
        }
        if (!/[a-z]/i.test(t) || t.length > 80) continue;
        return { text: tidy(t), star: star || t.includes('*') };
      }
      return { text: own, star };
    };
    const found = new Map<string, { f: F; said: string }>();
    const portal: string[] = [];
    const add = (el: Element | null, said: string) => {
      if (!el) return;
      // A check may name the list around the choices (an ASP.NET RadioButtonList), not one choice.
      const c = isControl(el) ? el : el.querySelector('input,select,textarea');
      const f = c ? fieldOf(c) : null;
      if (!f || (f.el as HTMLInputElement).disabled) return;
      if (skipped(f.el, f.key)) {
        const l = labelOf(f, true).text;
        if (l && !portal.includes(l)) portal.push(l);
        return;
      }
      const had = found.get(f.key);
      if (had) {
        if (said && !had.said) had.said = said;
      } else found.set(f.key, { f, said });
    };
    const controls = Array.from(document.querySelectorAll('input,select,textarea'));

    // 1. ASP.NET's own checks that failed.
    type Validator = HTMLElement & { isvalid?: boolean; controltovalidate?: string; errormessage?: string };
    const vals = (w.Page_Validators as Validator[] | undefined) || [];
    for (const v of Array.from(vals)) {
      if (!v || v.isvalid !== false || !v.controltovalidate) continue;
      add(document.getElementById(v.controltovalidate), clean(v.errormessage || v.textContent || ''));
    }
    // 2. Marked wrong by the page, or a required box the browser won't let through empty.
    const cls = (e: Element | null) => (e && typeof e.className === 'string' ? e.className : '');
    for (const el of controls) {
      if (!opts.marked || !visible(el)) continue;
      let invalid = false;
      try {
        invalid = (el as HTMLInputElement).required && el.matches(':invalid');
      } catch {
        invalid = false;
      }
      if (
        invalid ||
        el.getAttribute('aria-invalid') === 'true' ||
        /(^|\s)(error|is-invalid|input-validation-error|has-error|field-error)(\s|$)/i.test(cls(el)) ||
        /(^|\s)(has-error|is-invalid)(\s|$)/i.test(cls(el.parentElement))
      ) {
        add(el, '');
      }
    }
    // 3. An empty field that the site's message names.
    const asks = messages.map((m) => clean(m)).filter((m) => m && ASKS.test(m));
    const asked = (m: string) => {
      const a = m.match(/\b(?:select|enter|fill(?:\s+in)?|choose|provide|key\s+in)\s+(?:the\s+|a\s+|an\s+|your\s+)?([a-z][a-z0-9 /&()-]{1,60}?)\s*(?:[.!,;]|$)/i);
      if (a) return a[1];
      const b = m.match(/^([a-z][a-z0-9 /&()-]{1,60}?)\s+(?:is|are)\s+(?:required|mandatory|empty|blank|invalid)/i);
      return b ? b[1] : '';
    };
    if (asks.length) {
      const empties = controls
        .map((el) => fieldOf(el))
        .filter((f): f is F => !!f && !(f.el as HTMLInputElement).disabled && emptyNow(f));
      const seen = new Set<string>();
      const named: { f: F; said: string }[] = [];
      for (const f of empties) {
        if (seen.has(f.key)) continue;
        seen.add(f.key);
        const label = labelOf(f).text;
        if (label.length < 2) continue;
        const said = asks.find((m) => hasWords(m, label)) ?? asks.find((m) => !!asked(m) && hasWords(label, asked(m)));
        if (said) named.push({ f, said });
      }
      for (const n of named) add(n.f.el, n.said);
      // 4. Only "fill all required fields": the empty fields marked as required.
      if (opts.guess && !found.size && !named.length) {
        for (const f of empties) {
          const l = labelOf(f);
          if (l.star || (f.el as HTMLInputElement).required || f.el.getAttribute('aria-required') === 'true') add(f.el, asks[0]);
        }
      }
    }

    const list = Array.from(found.values())
      .sort((a, b) => (a.f.el.compareDocumentPosition(b.f.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .slice(0, 12)
      .map(({ f, said }) => {
        let options: string[] = [];
        let value = '';
        if (f.kind === 'select') {
          const sel = f.el as HTMLSelectElement;
          options = Array.from(sel.options)
            .map((o) => clean(o.text))
            .filter((t) => t && !PLACEHOLDER.test(t));
          value = emptyNow(f) ? '' : clean(sel.options[sel.selectedIndex].text);
        } else if (f.kind === 'radio') {
          options = f.radios.map((r) => radioLabel(r));
          const on = f.radios.find((r) => r.checked);
          value = on ? radioLabel(on) : '';
        } else if (f.kind === 'checkbox') {
          value = (f.el as HTMLInputElement).checked ? 'checked' : '';
        } else {
          value = ((f.el as HTMLInputElement).value || '').trim();
        }
        return { key: f.key, label: labelOf(f, true).text || f.key, kind: f.kind, value, options, said };
      });
    return { fields: list, portal };
  };

  /** A field by its id, or a tick-one list by its name, as siteNeeds named it. Only if it shows and can be changed. */
  const fieldByKey = (key: string) => {
    const radios = (Array.from(document.querySelectorAll('input[type=radio]')) as HTMLInputElement[]).filter((r) => r.name === key && visible(r));
    if (radios.length) return { kind: 'radio', name: key, options: radios.map(radioInfo), marks: [] as string[] };
    const byId = document.getElementById(key);
    const els = (byId ? [byId] : Array.from(document.getElementsByName(key))).filter((e) => isControl(e) && visible(e));
    return { kind: els.length === 1 ? kindOf(els[0]) : '', name: key, options: [] as RadioInfo[], marks: els.map((e) => mark(e)) };
  };

  /** Draws a red box around something, so the staff can see it in the site window. */
  const highlight = (m: string) => {
    const el = document.querySelector(`[data-portal="${m}"]`) as HTMLElement | null;
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.style.outline = '3px solid #D93025';
    el.style.outlineOffset = '2px';
    return true;
  };

  /**
   * Boxes the site draws over the page (a SweetAlert box, a dialog, a toast) can vanish by themselves within a second.
   * Their words are written down the moment they appear, so the tool can still read them afterwards.
   */
  const said: string[] = [];
  const POPUP = '[role=dialog],[role=alertdialog],[role=alert],[aria-modal=true],[class*="swal" i],[class*="sweet" i],[class*="modal" i],[class*="toast" i],[class*="notif" i],[class*="noty" i],[class*="alertify" i]';
  const note = (el: Element) => {
    // Each piece of text on its own, so a button's "OK" is not glued to the message before it.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const x = clean(n.textContent);
      if (x && x.length <= 300 && !/^(ok|okay|close|cancel|x|\u00d7)$/i.test(x) && !said.includes(x) && said.length < 40) said.push(x);
    }
  };
  const scan = (n: Node) => {
    if (!(n instanceof Element)) return;
    if (n.matches(POPUP)) note(n);
    n.querySelectorAll(POPUP).forEach(note);
    const up = n.closest(POPUP);
    if (up && up !== n) note(up);
  };
  try {
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(scan);
        else if (m.type === 'characterData' && m.target.parentElement) scan(m.target.parentElement);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  } catch {
    // No observer: the tool reads what is on screen, as before.
  }
  const saidWords = (reset = false): string[] => {
    const out = said.slice();
    if (reset) said.length = 0;
    return out;
  };

  w.__portal = {
    saidWords,
    canon,
    clean,
    visible,
    findLabelled,
    findById,
    radioGroupOf,
    radioGroupsByName,
    findButtons,
    buttonsNear,
    tabHeaders,
    findTables,
    tableInfo,
    rowCells,
    busy,
    pageText,
    valueOf,
    optionsOf,
    layout,
    highlight,
    mark,
    rowsWithCell,
    fileLinkIn,
    rowControls,
    textAfter,
    shownAfter,
    siteNeeds,
    fieldByKey,
  };

  // The tool never prints. If a page tries to open the print window by itself, nothing happens.
  try {
    window.print = () => undefined;
  } catch {
    // Some pages lock window.print; that's fine.
  }
}
