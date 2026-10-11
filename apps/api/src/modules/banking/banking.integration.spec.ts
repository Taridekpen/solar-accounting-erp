import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AccessContext } from "../auth/access";

function useDisposableDatabase(): void {
  const envPath = resolve(__dirname, "../../../.env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
  }
  const current = process.env.DATABASE_URL ?? "";
  if (!current.includes("/solar_accounting_test")) {
    process.env.DATABASE_URL = current.replace("/solar_accounting", "/solar_accounting_test");
  }
}

useDisposableDatabase();

describe("banking, cash, and reconciliation", () => {
  let prisma: PrismaClient;
  let companyUser: AccessContext;
  let counter: AccessContext;
  let reviewer: AccessContext;
  let outsider: AccessContext;
  let branchId = "";

  beforeAll(async () => {
    const client = await import("@prisma/client");
    const { seed } = await import("../../../prisma/seed");
    prisma = new client.PrismaClient();
    await seed(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@solar.local" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { branchCode: "HO", deletedAt: null } });
    const other = await prisma.branch.upsert({
      where: { companyId_branchCode: { companyId: admin.companyId, branchCode: "BNKX" } },
      update: {},
      create: { companyId: admin.companyId, branchCode: "BNKX", name: "Banking exclusion", status: "active" },
    });
    const maker = await prisma.user.upsert({
      where: { email: "bank-counter@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "bank-counter@solar.local", status: "active" },
    });
    const approver = await prisma.user.upsert({
      where: { email: "bank-reviewer@solar.local" },
      update: {},
      create: { companyId: admin.companyId, email: "bank-reviewer@solar.local", status: "active" },
    });
    branchId = branch.id;
    companyUser = context(admin.id, admin.email, true, { type: "company" }, ["banking.transfer", "banking.reconcile"]);
    counter = context(maker.id, maker.email, false, { type: "branches", branchIds: [branch.id] }, ["banking.reconcile"]);
    reviewer = context(approver.id, approver.email, false, { type: "branches", branchIds: [branch.id] }, ["banking.reconcile"]);
    outsider = context(approver.id, approver.email, false, { type: "branches", branchIds: [other.id] }, ["banking.reconcile"]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("transfers cash without profit and locks a matched statement", async () => {
    const { BankingService } = await import("./banking.service");
    const { DocumentNumberService } = await import("../organization/document-number.service");
    const { AccountingPostingService } = await import("../accounting/posting.service");
    const { AuditService } = await import("../auth/audit.service");
    const banking = new BankingService(
      prisma as never,
      new DocumentNumberService(prisma as never),
      new AccountingPostingService(prisma as never, new DocumentNumberService(prisma as never)),
      new AuditService(prisma as never),
    );
    const operating = (await banking.accounts(companyUser)).find((row) => row.accountCode === "1100");
    expect(units(operating?.bookBalance ?? "0.0000")).toBe(await postedNet(prisma, operating?.ledgerAccountId ?? ""));
    const branchBank = await banking.createAccount(companyUser, {
      bankName: "GTBank",
      accountName: `Head office collection ${randomUUID().slice(0, 8)}`,
      accountNumber: "0123456789",
      branchId,
    });
    expect(branchBank.maskedAccountNumber).toBe("****6789");
    await expect(banking.accounts(outsider)).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: branchBank.id })]));

    const beforeCash = await cashAndBank(prisma);
    const beforeProfit = await profitNet(prisma);
    const moved = await banking.transfer(companyUser, {
      kind: "account_to_account",
      sourceBranchId: branchId,
      destinationBranchId: branchId,
      sourceAccountId: operating?.ledgerAccountId ?? "",
      destinationAccountId: branchBank.ledgerAccountId ?? "",
      amount: "10000.0000",
      sentDate: "2026-10-10",
    });
    expect(moved.status).toBe("received");
    const transferJournal = await prisma.journalLine.findMany({
      where: { journal: { sourceDocumentId: moved.id, status: "posted" } },
      include: { account: true },
    });
    expect(transferJournal.every((line) => line.account.accountType === "asset")).toBe(true);
    expect(await cashAndBank(prisma)).toBe(beforeCash);
    expect(await profitNet(prisma)).toBe(beforeProfit);

    const delayed = await banking.transfer(companyUser, {
      kind: "branch_to_head_office",
      sourceBranchId: branchId,
      destinationBranchId: branchId,
      sourceAccountId: branchBank.ledgerAccountId ?? "",
      destinationAccountId: operating?.ledgerAccountId ?? "",
      amount: "5000.0000",
      sentDate: "2026-10-12",
      receivedDate: "2026-10-14",
    });
    expect(delayed.status).toBe("in_transit");
    const transitDuring = await postedNet(prisma, (await prisma.account.findFirstOrThrow({ where: { accountCode: "1110" } })).id);
    const received = await banking.receive(companyUser, delayed.id);
    expect(received.status).toBe("received");
    await expect(banking.receive(companyUser, delayed.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await postedNet(prisma, (await prisma.account.findFirstOrThrow({ where: { accountCode: "1110" } })).id)).toBe(transitDuring - 50000000n);
    expect(await cashAndBank(prisma)).toBe(beforeCash);

    const drawer = (await banking.drawers(companyUser)).find((row) => row.kind === "drawer");
    const cashBefore = await banking.cashBook(companyUser, { from: "2026-10-01", to: "2026-10-31", accountId: drawer?.ledgerAccountId });
    const funded = await banking.transfer(companyUser, {
      kind: "account_to_account",
      sourceBranchId: branchId,
      destinationBranchId: branchId,
      sourceAccountId: operating?.ledgerAccountId ?? "",
      destinationAccountId: drawer?.ledgerAccountId ?? "",
      amount: "50000.0000",
      sentDate: "2026-10-17",
    });
    expect(funded.status).toBe("received");
    const cashBook = await banking.cashBook(companyUser, { from: "2026-10-01", to: "2026-10-31", accountId: drawer?.ledgerAccountId });
    expect(units(cashBook.receipts) - units(cashBefore.receipts)).toBe(500000000n);
    let asOfCount = await banking.cashBook(companyUser, { from: "2026-01-01", to: "2026-10-18", accountId: drawer?.ledgerAccountId, branchId });
    if (units(asOfCount.closing) < 25000000n) {
      await banking.transfer(companyUser, {
        kind: "account_to_account",
        sourceBranchId: branchId,
        destinationBranchId: branchId,
        sourceAccountId: operating?.ledgerAccountId ?? "",
        destinationAccountId: drawer?.ledgerAccountId ?? "",
        amount: formatUnits(25000000n - units(asOfCount.closing) + 10000000n),
        sentDate: "2026-10-17",
      });
      asOfCount = await banking.cashBook(companyUser, { from: "2026-01-01", to: "2026-10-18", accountId: drawer?.ledgerAccountId, branchId });
    }
    const counted = formatUnits(units(asOfCount.closing) - 25000000n);
    const draft = await banking.createCount(counter, { drawerId: drawer?.id ?? "", countDate: "2026-10-18", countedAmount: counted });
    expect(draft.varianceAmount).toBe("-2500.0000");
    await expect(banking.postCount(counter, draft.id)).rejects.toBeInstanceOf(ForbiddenException);
    const posted = await banking.postCount(reviewer, draft.id);
    expect(posted.status).toBe("posted");
    const varianceLines = await prisma.journalLine.findMany({
      where: { journal: { sourceDocumentId: draft.id, sourceDocumentType: "cash_count", status: "posted" } },
      include: { account: true },
    });
    expect(varianceLines.find((line) => line.account.accountCode === "6900")?.debit.toFixed(4)).toBe("2500.0000");
    expect(await prisma.auditEvent.findFirst({ where: { entityId: draft.id, action: "banking.count_posted" } })).toBeTruthy();

    const deposit = await banking.transfer(companyUser, {
      kind: "deposit",
      sourceBranchId: branchId,
      destinationBranchId: branchId,
      sourceAccountId: drawer?.ledgerAccountId ?? "",
      destinationAccountId: branchBank.ledgerAccountId ?? "",
      amount: "8000.0000",
      sentDate: "2026-10-20",
    });
    expect(deposit.status).toBe("received");
    const statement = await banking.createStatement(companyUser, {
      bankAccountId: branchBank.id,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      statementEnding: "0.0000",
    });
    await banking.importCsv(companyUser, statement.id, { csv: "date,description,amount,reference\n2026-10-20,Collection deposit,8000.0000,DEP1\n" });
    const open = await banking.statement(companyUser, statement.id);
    expect(open.difference).not.toBe("0.0000");
    expect(open.suggestions).toEqual([{ statementLineId: open.lines[0]?.id, journalLineId: expect.any(String) }]);
    await banking.match(companyUser, statement.id, { statementLineId: open.suggestions[0].statementLineId, journalLineId: open.suggestions[0].journalLineId });
    await banking.addLine(companyUser, statement.id, { lineDate: "2026-10-21", description: "Unmatched charge", amount: "-100.0000" });
    await expect(banking.approve(companyUser, statement.id)).rejects.toBeInstanceOf(ForbiddenException);
    const locked = await banking.approve(reviewer, statement.id);
    expect(locked.status).toBe("locked");
    await expect(banking.match(reviewer, statement.id, { statementLineId: open.suggestions[0].statementLineId, journalLineId: open.suggestions[0].journalLineId })).rejects.toBeInstanceOf(ConflictException);
    await expect(banking.statement(outsider, statement.id)).rejects.toBeInstanceOf(NotFoundException);
  }, 60_000);
});

async function postedNet(prisma: PrismaClient, accountId: string) {
  const lines = await prisma.journalLine.findMany({ where: { accountId, journal: { status: "posted" } }, select: { debit: true, credit: true } });
  return lines.reduce((sum, line) => sum + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)), 0n);
}

async function cashAndBank(prisma: PrismaClient) {
  const lines = await prisma.journalLine.findMany({
    where: { journal: { status: "posted" }, account: { accountSubtype: { in: ["cash", "bank"] } } },
    select: { debit: true, credit: true },
  });
  return lines.reduce((sum, line) => sum + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)), 0n);
}

async function profitNet(prisma: PrismaClient) {
  const lines = await prisma.journalLine.findMany({
    where: { journal: { status: "posted" }, account: { accountType: { in: ["revenue", "expense"] } } },
    select: { debit: true, credit: true },
  });
  return lines.reduce((sum, line) => sum + units(line.debit.toFixed(4)) - units(line.credit.toFixed(4)), 0n);
}

function units(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return (negative ? -1n : 1n) * (BigInt(whole) * 10000n + BigInt((fraction + "0000").slice(0, 4)));
}

function formatUnits(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10000n;
  const fraction = (absolute % 10000n).toString().padStart(4, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

function context(
  userId: string,
  email: string,
  companyWide: boolean,
  scope: AccessContext["scope"],
  permissions: string[],
): AccessContext {
  return {
    userId,
    email,
    sessionId: "00000000-0000-4000-8000-000000000010",
    csrfTokenHash: "test",
    permissions,
    roleCodes: companyWide ? ["super_administrator"] : ["branch_accountant"],
    companyWide,
    mfaPending: false,
    mfaEnabled: true,
    scope,
  };
}
