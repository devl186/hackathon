// Leading characters that make spreadsheets evaluate a cell (OWASP CSV injection), incl. full-width forms.
const FORMULA_TRIGGER = /^[\s\p{Cc}]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u;
const LEADING_CONTROL_OR_SPACE = /^[\t\r\n\p{Cc}]/u;

/** Prefixes a single quote so spreadsheet apps treat the value as text, never as a formula. */
export function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGER.test(value) || LEADING_CONTROL_OR_SPACE.test(value) ? `'${value}` : value;
}

/** RFC 4180 field: always quoted, embedded quotes doubled; commas and newlines stay inside the quotes. */
export function csvField(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : neutralizeFormula(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}
