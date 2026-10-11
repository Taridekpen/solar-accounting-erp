import PDFDocument from "pdfkit";

export interface SalesPdfDocument {
  title: string;
  number: string;
  party: string;
  date: string;
  grandTotal: string;
  lines: { description: string; quantity: string; amount: string }[];
}

export function renderSalesPdf(document: SalesPdfDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ compress: false, margin: 48 });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.fontSize(18).text(`${document.title} ${document.number}`);
    pdf.moveDown();
    pdf.fontSize(12).text(document.party);
    pdf.text(document.date);
    pdf.moveDown();
    for (const line of document.lines) {
      pdf.text(`${line.description}    ${line.quantity}    ${line.amount}`);
    }
    pdf.moveDown();
    pdf.fontSize(14).text(`Grand total ${document.grandTotal}`);
    pdf.end();
  });
}
