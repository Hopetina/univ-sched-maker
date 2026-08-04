// Client-side export helpers (PDF + Excel). Imported lazily by report screens.
export interface ExportColumn {
  key: string;
  label: string;
}

export async function exportToExcel(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  fileName: string,
  sheetName = "Timetable",
) {
  const XLSX = await import("xlsx");
  const data = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.label, row[column.key] ?? ""])),
  );
  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  worksheet["!cols"] = columns.map((column) => ({
    wch: Math.max(
      column.label.length + 2,
      ...rows.map((row) => String(row[column.key] ?? "").length + 2),
      10,
    ),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export async function exportToPdf(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  fileName: string,
  title: string,
  subtitle?: string,
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (subtitle) doc.text(subtitle, 40, 56);
  doc.text(`Generated ${new Date().toLocaleString()}`, 40, subtitle ? 70 : 56);

  autoTable(doc, {
    startY: subtitle ? 84 : 70,
    head: [columns.map((column) => column.label)],
    body: rows.map((row) => columns.map((column) => String(row[column.key] ?? ""))),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [23, 37, 84], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 245, 248] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${fileName}.pdf`);
}
