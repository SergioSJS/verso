export type PdfSpec = {
  file: string;
  page: number;
  height?: number;
  width?: number;
};

/** Parse a PDF target reference like `doc.pdf#page=3`, `doc.pdf#3`, `doc.pdf#page 3`,
 *  or with height `doc.pdf#page=3&height=500` or alias `doc.pdf|500`. */
export function parsePdfSpec(rawTarget: string, alias?: string | null): PdfSpec {
  let file = rawTarget.trim();
  let fragment = "";
  const hashIdx = file.indexOf("#");
  if (hashIdx !== -1) {
    fragment = file.slice(hashIdx + 1).trim();
    file = file.slice(0, hashIdx).trim();
  }

  // Also strip any query or pipe in file if present
  file = file.split("|")[0]?.trim() ?? file;

  let page = 1;
  let height: number | undefined;
  let width: number | undefined;

  const combined = `${fragment}&${alias ?? ""}`;

  // 1. Check for page: page=N, page N, p=N, p.N, pN
  const pageMatch = /(?:^|[&#|,;\s])(?:page[ =:]*|p[ =.:]*)(\d+)/i.exec(combined);
  if (pageMatch && pageMatch[1]) {
    page = parseInt(pageMatch[1], 10);
  } else if (/^\d+$/.test(fragment)) {
    // 2. Just a raw number in the fragment: #3
    page = parseInt(fragment, 10);
  }

  // Check for height / width: e.g. height=500, h=500
  const heightMatch = /(?:^|[&#|,;\s])(?:height|h)[ =:]*(\d+)/i.exec(combined);
  if (heightMatch && heightMatch[1]) {
    height = parseInt(heightMatch[1], 10);
  }

  const widthMatch = /(?:^|[&#|,;\s])(?:width|w)[ =:]*(\d+)/i.exec(combined);
  if (widthMatch && widthMatch[1]) {
    width = parseInt(widthMatch[1], 10);
  }

  // Alias dimensions: e.g. |500 or |800x600
  if (alias && alias !== rawTarget) {
    const dimMatch = /^(\d+)(?:x(\d+))?$/i.exec(alias.trim());
    if (dimMatch && dimMatch[1]) {
      if (dimMatch[2]) {
        width = parseInt(dimMatch[1], 10);
        height = parseInt(dimMatch[2], 10);
      } else {
        height = parseInt(dimMatch[1], 10);
      }
    }
  }

  return { file, page: Math.max(1, page), height, width };
}

/** A page number pdf.js accepts: from 1 to the pages the document has
 *  (`#page=9` in a 3-page file opens the last, never "not a valid page"). */
export function clampPage(page: number, pages: number): number {
  const last = Math.max(1, Math.floor(pages) || 1);
  return Math.max(1, Math.min(last, Math.round(page) || 1));
}
