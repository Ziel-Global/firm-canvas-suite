import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Client-side report export. Avoids the Supabase Edge Function so exports
 * work even when `export-report` is not deployed / unreachable.
 */

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function sanitizeFilename(title: string) {
  return title.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
}

function flattenRows(reportData: unknown[]): Record<string, unknown>[] {
  return (reportData ?? []).map((row) => {
    if (row == null || typeof row !== "object") {
      return { value: row };
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (value == null) {
        out[key] = "";
      } else if (typeof value === "object") {
        out[key] = JSON.stringify(value);
      } else {
        out[key] = value;
      }
    }
    return out;
  });
}

export function exportReportCsv(title: string, reportData: unknown[]) {
  const rows = flattenRows(reportData);
  if (rows.length === 0) {
    throw new Error("No data to export.");
  }

  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const str = String(row[header] ?? "");
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, `${sanitizeFilename(title)}.csv`);
}

export async function exportReportPdf(title: string, reportData: unknown[]) {
  const rows = flattenRows(reportData);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const fontSize = 9;
  const titleSize = 16;
  const lineHeight = 14;
  const pageWidth = 612;
  const pageHeight = 792;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawText = (
    text: string,
    opts: { bold?: boolean; size?: number; x?: number } = {},
  ) => {
    const size = opts.size ?? fontSize;
    const useFont = opts.bold ? boldFont : font;
    const x = opts.x ?? margin;
    const maxWidth = pageWidth - margin * 2;
    // pdf-lib drawText doesn't wrap; truncate long lines for readability.
    let line = text.replace(/\s+/g, " ").trim();
    while (useFont.widthOfTextAtSize(line, size) > maxWidth && line.length > 3) {
      line = `${line.slice(0, -4)}…`;
    }
    page.drawText(line || " ", {
      x,
      y,
      size,
      font: useFont,
      color: rgb(0.1, 0.1, 0.12),
    });
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  drawText(title.replace(/_/g, " "), { bold: true, size: titleSize });
  y -= titleSize + 16;

  drawText(
    `Generated ${new Date().toLocaleString()} · ${rows.length} row${rows.length === 1 ? "" : "s"}`,
    { size: 8 },
  );
  y -= lineHeight + 8;

  if (rows.length === 0) {
    drawText("No data available.");
  } else {
    const headers = Object.keys(rows[0]);
    ensureSpace(lineHeight);
    drawText(headers.join("  |  "), { bold: true, size: 8 });
    y -= lineHeight;

    for (const row of rows) {
      ensureSpace(lineHeight);
      const rowText = headers.map((h) => String(row[h] ?? "")).join("  |  ");
      drawText(rowText, { size: 8 });
      y -= lineHeight;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], {
    type: "application/pdf",
  });
  downloadBlob(blob, `${sanitizeFilename(title)}.pdf`);
}

export async function exportReport(
  format: "pdf" | "excel",
  title: string,
  reportData: unknown[],
) {
  if (format === "excel") {
    exportReportCsv(title, reportData);
    return;
  }
  await exportReportPdf(title, reportData);
}
