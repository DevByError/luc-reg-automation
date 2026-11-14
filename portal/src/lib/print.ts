/**
 * Opens the browser's print window for a PDF or image, without leaving the portal.
 * The staff picks the printer there; the portal never prints by itself.
 */
export function printFile(url: string, kind: 'pdf' | 'image'): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;opacity:0;';
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
      window.setTimeout(() => frame.remove(), 60_000);
    };
    frame.onload = () => {
      window.setTimeout(
        () => {
          try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          } catch {
            window.open(url, '_blank', 'noopener');
          }
          finish();
        },
        kind === 'pdf' ? 900 : 150,
      );
    };
    if (kind === 'image') {
      frame.srcdoc =
        '<!doctype html><html><head><style>@page{margin:10mm}html,body{margin:0}' +
        'img{display:block;max-width:100%;max-height:96vh;margin:0 auto}</style></head>' +
        `<body><img src="${url}" alt=""></body></html>`;
    } else {
      frame.src = url;
    }
    document.body.appendChild(frame);
    // If the browser never reports the frame as loaded, open the file in a tab instead.
    window.setTimeout(() => {
      if (!finished) {
        window.open(url, '_blank', 'noopener');
        finish();
      }
    }, 15_000);
  });
}
