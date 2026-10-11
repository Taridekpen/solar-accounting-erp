import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { branchIdFilter } from "../organization/branch-scope";
import { formatMoneyUnits, parseMoney } from "./money";

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(access: AccessContext) {
    const companyId = await this.companyId(access.userId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { accountCode: "asc" },
    });
    const totals = await this.totals(companyId, access);
    return accounts.map((account) => {
      const total = totals.get(account.id) ?? { debit: 0n, credit: 0n };
      const signed = account.normalBalance === "debit" ? total.debit - total.credit : total.credit - total.debit;
      return {
        id: account.id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        parentAccountId: account.parentAccountId,
        normalBalance: account.normalBalance,
        isPostable: account.isPostable,
        isControlAccount: account.isControlAccount,
        isActive: account.isActive,
        balance: formatMoneyUnits(signed),
      };
    });
  }

  async create(
    access: AccessContext,
    input: {
      accountCode: string;
      accountName: string;
      accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
      accountSubtype?: string;
      parentAccountId?: string;
      normalBalance: "debit" | "credit";
      isPostable?: boolean;
    },
  ) {
    const companyId = await this.companyId(access.userId);
    if (input.parentAccountId) {
      const parent = await this.prisma.account.findFirst({
        where: { id: input.parentAccountId, companyId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException("Parent account was not found");
      }
    }
    try {
      return await this.prisma.account.create({
        data: {
          companyId,
          accountCode: input.accountCode.trim(),
          accountName: input.accountName.trim(),
          accountType: input.accountType,
          accountSubtype: input.accountSubtype,
          parentAccountId: input.parentAccountId,
          normalBalance: input.normalBalance,
          isPostable: input.isPostable ?? true,
          isControlAccount: false,
          isActive: true,
        },
      });
    } catch {
      throw new ConflictException("Account code already exists");
    }
  }

  async update(
    access: AccessContext,
    accountId: string,
    input: { accountName?: string; isActive?: boolean; isPostable?: boolean },
  ) {
    const companyId = await this.companyId(access.userId);
    const account = await this.prisma.account.findFirst({ where: { id: accountId, companyId, deletedAt: null } });
    if (!account) {
      throw new NotFoundException("Account was not found");
    }
    if (account.isControlAccount && input.isActive === false) {
      throw new BadRequestException("A control account cannot be deactivated");
    }
    return this.prisma.account.update({
      where: { id: account.id },
      data: {
        accountName: input.accountName?.trim(),
        isActive: input.isActive,
        isPostable: account.isControlAccount ? undefined : input.isPostable,
      },
    });
  }

  private async totals(companyId: string, access: AccessContext) {
    const rows = await this.prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { journal: { companyId, status: "posted" }, branchId: branchIdFilter(access.scope) },
      _sum: { debit: true, credit: true },
    });
    return new Map(rows.map((row) => [
      row.accountId,
      {
        debit: parseMoney(row._sum.debit?.toFixed(4) ?? "0"),
        credit: parseMoney(row._sum.credit?.toFixed(4) ?? "0"),
      },
    ]));
  }

  private async companyId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
    return user.companyId;
  }
}
