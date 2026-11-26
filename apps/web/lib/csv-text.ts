/** CSV helpers with no dependencies, safe to use in the browser. */

/**
 * Text from the file's bytes. Excel saves "CSV UTF-8" or, by default on Windows, Windows-1252
 * (Latin-1): a file that is not valid UTF-8 is read as Windows-1252 so French accents survive.
 */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^\uFEFF/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** A CSV of the rows that were not imported, with the reason in a last column, to fix and import again. */
export function problemsCsv(headers: string[], rows: { cells: string[]; reason: string }[], delimiter: string, reasonHeader: string): string {
  const esc = (c: string) => (c.includes(delimiter) || /["\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return "\uFEFF" + [[...headers, reasonHeader], ...rows.map((r) => [...r.cells, r.reason])].map((r) => r.map(esc).join(delimiter)).join("\r\n") + "\r\n";
}
