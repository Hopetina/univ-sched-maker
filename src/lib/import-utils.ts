// Client-side spreadsheet parsing (CSV or XLSX) for the bulk import screens.
// Reuses the same "xlsx" package already used by export-utils.ts.
export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (matrix.length === 0) return { headers: [], rows: [] };

  const toCell = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value ?? "").trim();
  };

  const headers = matrix[0].map((h) => toCell(h));
  const rows = matrix.slice(1).map((line) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = toCell(line[index]);
    });
    return record;
  });
  return { headers, rows };
}

export interface FieldDefinition {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}

/** Best-effort auto-mapping of source spreadsheet headers to the target field keys. */
export function guessColumnMapping(headers: string[], fields: FieldDefinition[]): Record<string, string> {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalisedHeaders = headers.map((h) => ({ raw: h, norm: normalise(h) }));
  const mapping: Record<string, string> = {};

  for (const field of fields) {
    const candidates = [field.key, field.label, ...field.aliases].map(normalise);
    const match = normalisedHeaders.find((h) => candidates.includes(h.norm));
    if (match) mapping[field.key] = match.raw;
  }
  return mapping;
}
