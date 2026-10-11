import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { BranchScope, assertBranchAllowed } from "./branch-scope";

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  async allocate(scope: BranchScope, branchId: string, documentType: string) {
    assertBranchAllowed(scope, branchId);
    return this.prisma.$transaction((tx) => this.allocateWith(tx, branchId, documentType));
  }

  async allocateWith(tx: Prisma.TransactionClient, branchId: string, documentType: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string; prefix: string; next_number: number; padding: number; branch_code: string }>
    >(Prisma.sql`
      SELECT s.id, s.prefix, s.next_number, s.padding, b.branch_code
      FROM document_sequences s
      INNER JOIN branches b ON b.id = s.branch_id
      WHERE s.branch_id = CAST(${branchId} AS uuid)
        AND s.document_type = ${documentType}
        AND b.deleted_at IS NULL
      FOR UPDATE
    `);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Document sequence was not found");
    }
    await tx.documentSequence.update({
      where: { id: row.id },
      data: { nextNumber: Number(row.next_number) + 1 },
    });
    const serial = String(Number(row.next_number)).padStart(Number(row.padding), "0");
    return { documentNumber: `${row.prefix}-${row.branch_code}-${serial}` };
  }
}
