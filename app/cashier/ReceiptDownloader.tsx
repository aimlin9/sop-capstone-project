'use client';

import { Download, Lock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


interface Props {
  completedSaleData: any;
  onDone: () => void;
  paymentVerified?: boolean;
}

export default function ReceiptDownloader({ completedSaleData, onDone, paymentVerified = true }: Props) {
  const generateReceiptPDF = async () => {
    if (!completedSaleData) return;

    const doc = new jsPDF({ format: 'a5' });
    const isCash = completedSaleData.paymentMethod === 'cash';

    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('SnapSell', 74, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Sales Receipt', 74, 25, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`Date: ${completedSaleData.date}`, 14, 45);
    doc.text(`Payment: ${completedSaleData.paymentMethod.toUpperCase()}`, 14, 52);

    // Items Table
    const tableColumn = ["Item", "Qty", "Price", "Total"];
    const tableRows = completedSaleData.items.map((item: any) => [
      item.product.name,
      item.quantity.toString(),
      `GHS ${item.product.price.toFixed(2)}`,
      `GHS ${(item.quantity * item.product.price).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 56,
      head: [tableColumn],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [124, 58, 237] },
      margin: { top: 56 }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 66;

    const summaryXLabel = 95;
    const summaryXValue = 134;

    doc.setFontSize(10);
    doc.text('Subtotal:', summaryXLabel, finalY + 10);
    doc.text(`GHS ${completedSaleData.subtotal.toFixed(2)}`, summaryXValue, finalY + 10, { align: 'right' });

    doc.text('Tax (12.5%):', summaryXLabel, finalY + 16);
    doc.text(`GHS ${completedSaleData.tax.toFixed(2)}`, summaryXValue, finalY + 16, { align: 'right' });

    doc.setDrawColor(200, 200, 200);
    doc.line(summaryXLabel, finalY + 20, summaryXValue, finalY + 20);

    doc.setFont('helvetica', 'bold');
    doc.text('Total:', summaryXLabel, finalY + 27);
    doc.text(`GHS ${completedSaleData.total.toFixed(2)}`, summaryXValue, finalY + 27, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Thank you for shopping at SnapSell!', 74, finalY + 45, { align: 'center' });

    doc.save('SnapSell_receipt.pdf');
  };

  return (
    <div className="pt-2 flex flex-col gap-3">
      <button
        onClick={generateReceiptPDF}
        disabled={!paymentVerified}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-colors font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {paymentVerified ? (
          <>
            <Download className="w-5 h-5" />
            <span>Download Receipt (PDF)</span>
          </>
        ) : (
          <>
            <Lock className="w-5 h-5" />
            <span>Receipt locked until payment confirmed</span>
          </>
        )}
      </button>
      <button
        onClick={onDone}
        className="w-full py-3 px-4 bg-secondary font-semibold hover:bg-secondary/80 border border-border rounded-xl transition-colors"
      >
        Start New Sale
      </button>
    </div>
  );
}