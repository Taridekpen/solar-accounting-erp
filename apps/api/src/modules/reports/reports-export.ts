import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

export interface ReportTable {
  title: string;
  companyName: string;
  period: string;
  scope: string;
  currency: string;
  generatedAt: string;
  preparedBy: string;
  columns: string[];
  rows: string[][];
}

export function renderCsv(table: ReportTable): string {
  const preface = [
    ["Company", table.companyName],
    ["Report", table.title],
    ["Period", table.period],
    ["Scope", table.scope],
    ["Currency", table.currency],
    ["Generated", table.generatedAt],
    ["Prepared by", table.preparedBy],
    [],
    table.columns,
    ...table.rows,
  ];
  return preface.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function renderPdf(table: ReportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ compress: false, margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.fontSize(16).text(table.companyName);
    pdf.fontSize(13).text(table.title);
    pdf.fontSize(10).text(`${table.period} · ${table.scope} · ${table.currency}`);
    pdf.text(`Generated ${table.generatedAt}`);
    pdf.text(`Prepared by ${table.preparedBy}`);
    pdf.moveDown();
    pdf.fontSize(9).text(table.columns.join("  "));
    for (const row of table.rows) {
      pdf.text(row.join("  "));
    }
    pdf.end();
  });
}

export async function renderXlsx(table: ReportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(table.title.slice(0, 31) || "Report");
  sheet.addRows([
    ["Company", table.companyName],
    ["Report", table.title],
    ["Period", table.period],
    ["Scope", table.scope],
    ["Currency", table.currency],
    ["Generated", table.generatedAt],
    ["Prepared by", table.preparedBy],
    [],
    table.columns,
    ...table.rows,
  ]);
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll("\"", "\"\"")}"`;
  return value;
}
