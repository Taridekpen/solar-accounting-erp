import { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/** Wipe posted/operational data for a company so balances and stock return to zero. */
export async function clearCompanyBooks(db: Db, companyId: string) {
  await db.importRow.deleteMany({ where: { batch: { companyId } } });
  await db.importBatch.deleteMany({ where: { companyId } });

  await db.bankStatementLine.deleteMany({ where: { companyId } });
  await db.bankStatement.deleteMany({ where: { companyId } });
  await db.cashCount.deleteMany({ where: { companyId } });
  await db.cashTransfer.deleteMany({ where: { companyId } });

  await db.salaryPaymentAllocation.deleteMany({ where: { payment: { companyId } } });
  await db.salaryPayment.deleteMany({ where: { companyId } });
  await db.salarySummaryDeduction.deleteMany({ where: { summary: { companyId } } });
  await db.salarySummary.deleteMany({ where: { companyId } });

  await db.expenseApproval.deleteMany({ where: { companyId } });
  await db.expense.deleteMany({ where: { companyId } });
  await db.fixedAsset.deleteMany({ where: { companyId } });
  await db.statementBudget.deleteMany({ where: { companyId } });
  await db.procurementApproval.deleteMany({ where: { companyId } });

  await db.supplierPaymentAllocation.deleteMany({ where: { payment: { companyId } } });
  await db.supplierPayment.deleteMany({ where: { companyId } });
  await db.supplierBillLine.deleteMany({ where: { bill: { companyId } } });
  await db.supplierBill.deleteMany({ where: { companyId } });
  await db.goodsReceiptSerial.deleteMany({ where: { companyId } });
  await db.goodsReceiptLine.deleteMany({ where: { receipt: { companyId } } });
  await db.goodsReceipt.deleteMany({ where: { companyId } });
  await db.purchaseOrderLine.deleteMany({ where: { order: { companyId } } });
  await db.purchaseOrder.deleteMany({ where: { companyId } });
  await db.purchaseRequisitionLine.deleteMany({ where: { requisition: { companyId } } });
  await db.purchaseRequisition.deleteMany({ where: { companyId } });

  await db.stockCountLine.deleteMany({ where: { count: { companyId } } });
  await db.stockCount.deleteMany({ where: { companyId } });
  await db.stockTransferLine.deleteMany({ where: { transfer: { companyId } } });
  await db.stockTransfer.deleteMany({ where: { companyId } });
  await db.warehouseStock.deleteMany({ where: { companyId } });
  await db.stockMovement.deleteMany({ where: { companyId } });
  await db.stockPosition.deleteMany({ where: { companyId } });

  await db.salesCreditNoteLine.deleteMany({ where: { creditNote: { companyId } } });
  await db.salesCreditNote.deleteMany({ where: { companyId } });
  await db.salesReturnLine.deleteMany({ where: { returnRequest: { companyId } } });
  await db.salesReturnRequest.deleteMany({ where: { companyId } });
  await db.customerReceiptAllocation.deleteMany({ where: { receipt: { companyId } } });
  await db.customerReceiptMethod.deleteMany({ where: { receipt: { companyId } } });
  await db.customerReceipt.deleteMany({ where: { companyId } });
  await db.salesInvoiceAllocation.deleteMany({ where: { invoice: { companyId } } });
  await db.salesInvoiceTax.deleteMany({ where: { invoice: { companyId } } });
  await db.projectMilestone.updateMany({ where: { companyId }, data: { invoiceId: null } });
  await db.salesInvoiceLine.deleteMany({ where: { invoice: { companyId } } });
  await db.salesInvoice.deleteMany({ where: { companyId } });
  await db.salesQuotationLine.deleteMany({ where: { quotation: { companyId } } });
  await db.salesQuotation.deleteMany({ where: { companyId } });

  await db.projectMaterialRequest.deleteMany({ where: { companyId } });
  await db.projectMilestone.deleteMany({ where: { companyId } });
  await db.projectBudget.deleteMany({ where: { companyId } });
  await db.projectQuotationLine.deleteMany({ where: { quotation: { companyId } } });
  await db.projectQuotation.deleteMany({ where: { companyId } });
  await db.project.deleteMany({ where: { companyId } });

  await db.openingBalanceLine.deleteMany({ where: { batch: { companyId } } });
  await db.openingBalanceBatch.deleteMany({ where: { companyId } });
  await db.postingAttempt.deleteMany({ where: { companyId } });
  await db.dailyClosing.deleteMany({ where: { companyId } });
  await db.periodClosingTask.deleteMany({ where: { companyId } });
  await db.periodCloseApproval.deleteMany({ where: { companyId } });
  await db.periodStatementSnapshot.deleteMany({ where: { companyId } });

  await db.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await db.journalLine.deleteMany({ where: { journal: { companyId } } });
  await db.journalEntry.deleteMany({ where: { companyId } });

  await db.customerBranch.deleteMany({ where: { customer: { companyId } } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.supplierBankDetail.deleteMany({ where: { supplier: { companyId } } });
  await db.supplierBranch.deleteMany({ where: { supplier: { companyId } } });
  await db.supplier.deleteMany({ where: { companyId } });
  await db.product.deleteMany({ where: { companyId } });

  await db.managedDocument.deleteMany({ where: { companyId } });
  await db.notification.deleteMany({ where: { companyId } });

  await db.documentSequence.updateMany({ where: { companyId }, data: { nextNumber: 1 } });
  await db.fiscalPeriod.updateMany({
    where: { companyId },
    data: {
      status: "open",
      closedAt: null,
      closedByUserId: null,
      closingStartedByUserId: null,
    },
  });
}
