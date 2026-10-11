import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { assertValidTimeZone } from "../../common/timezone";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { parseMoney } from "../accounting/money";
import { UpdateCompanyDto } from "./dto/company.dto";

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async get() {
    const company = await this.prisma.company.findFirst({ where: { deletedAt: null } });
    if (!company) {
      throw new NotFoundException("Company has not been created");
    }
    return serializeCompany(company);
  }

  async requireRecord() {
    const company = await this.prisma.company.findFirst({ where: { deletedAt: null } });
    if (!company) {
      throw new NotFoundException("Company has not been created");
    }
    return company;
  }

  async create(input: UpdateCompanyDto, access?: AccessContext, correlationId?: string) {
    const existing = await this.prisma.company.findFirst();
    if (existing) {
      throw new ConflictException("Only one legal company is supported");
    }
    validateCompany(input);
    try {
      const company = await this.prisma.company.create({
        data: {
          legalName: input.legalName ?? "Solar & Inverter Co.",
          tradingName: input.tradingName,
          registrationNumber: input.registrationNumber,
          taxIdentificationNumber: input.taxIdentificationNumber,
          email: input.email,
          phone: input.phone,
          website: input.website,
          address: input.address,
          city: input.city,
          state: input.state,
          country: input.country ?? "Nigeria",
          baseCurrency: input.baseCurrency ?? "NGN",
          timezone: input.timezone ?? "Africa/Lagos",
          fiscalYearStartMonth: input.fiscalYearStartMonth ?? 1,
          logoUrl: input.logoUrl,
          purchaseApprovalLimit: input.purchaseApprovalLimit,
          inventoryCostingMethod: input.inventoryCostingMethod ?? "weighted_average",
          moneyRoundingMode: input.moneyRoundingMode ?? "half_up",
          emailNotificationsEnabled: input.emailNotificationsEnabled ?? false,
        },
      });
      await this.prisma.documentTemplate.create({ data: { companyId: company.id } });
      if (access && this.audit) {
        await this.audit.record({
          actorUserId: access.userId,
          action: "company.created",
          entityType: "company",
          entityId: company.id,
          newValues: serializeCompany(company),
          correlationId,
        });
      }
      return serializeCompany(company);
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  async update(input: UpdateCompanyDto, access?: AccessContext, correlationId?: string) {
    const company = await this.requireRecord();
    validateCompany(input);
    if (input.inventoryCostingMethod && input.inventoryCostingMethod !== "weighted_average") {
      throw new BadRequestException("Only weighted_average inventory costing is supported");
    }
    if (input.moneyRoundingMode && input.moneyRoundingMode !== "half_up") {
      throw new BadRequestException("Only half_up rounding is supported");
    }
    if (input.purchaseApprovalLimit !== undefined) {
      try {
        if (parseMoney(input.purchaseApprovalLimit) < 0n) {
          throw new BadRequestException("Purchase approval limit cannot be negative");
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException("Purchase approval limit must be a decimal amount");
      }
    }
    const previous = serializeCompany(company);
    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        legalName: input.legalName,
        tradingName: input.tradingName,
        registrationNumber: input.registrationNumber,
        taxIdentificationNumber: input.taxIdentificationNumber,
        email: input.email,
        phone: input.phone,
        website: input.website,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        baseCurrency: input.baseCurrency,
        timezone: input.timezone,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        logoUrl: input.logoUrl,
        purchaseApprovalLimit: input.purchaseApprovalLimit,
        inventoryCostingMethod: input.inventoryCostingMethod,
        moneyRoundingMode: input.moneyRoundingMode,
        emailNotificationsEnabled: input.emailNotificationsEnabled,
      },
    });
    if (access && this.audit) {
      await this.audit.record({
        actorUserId: access.userId,
        action: "company.updated",
        entityType: "company",
        entityId: updated.id,
        previousValues: previous,
        newValues: serializeCompany(updated),
        correlationId,
      });
    }
    return serializeCompany(updated);
  }
}

function validateCompany(input: UpdateCompanyDto): void {
  if (input.timezone) {
    try {
      assertValidTimeZone(input.timezone);
    } catch {
      throw new BadRequestException("Unknown timezone");
    }
  }
  if (input.baseCurrency && !/^[A-Z]{3}$/.test(input.baseCurrency)) {
    throw new BadRequestException("Currency must be a three-letter ISO code");
  }
  if (
    input.fiscalYearStartMonth !== undefined &&
    (input.fiscalYearStartMonth < 1 || input.fiscalYearStartMonth > 12)
  ) {
    throw new BadRequestException("Fiscal year start month must be from 1 to 12");
  }
}

export function rethrowPrisma(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ConflictException("A unique value already exists");
    }
    if (error.code === "P2003") {
      throw new BadRequestException("A related record does not exist");
    }
  }
  throw error;
}

function serializeCompany(company: {
  id: string;
  legalName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  taxIdentificationNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  baseCurrency: string;
  timezone: string;
  fiscalYearStartMonth: number;
  purchaseApprovalLimit: { toFixed: (digits: number) => string };
  logoUrl: string | null;
  inventoryCostingMethod: string;
  moneyRoundingMode: string;
  emailNotificationsEnabled: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: company.id,
    legalName: company.legalName,
    tradingName: company.tradingName,
    registrationNumber: company.registrationNumber,
    taxIdentificationNumber: company.taxIdentificationNumber,
    email: company.email,
    phone: company.phone,
    website: company.website,
    address: company.address,
    city: company.city,
    state: company.state,
    country: company.country,
    baseCurrency: company.baseCurrency,
    timezone: company.timezone,
    fiscalYearStartMonth: company.fiscalYearStartMonth,
    purchaseApprovalLimit: company.purchaseApprovalLimit.toFixed(4),
    logoUrl: company.logoUrl,
    inventoryCostingMethod: company.inventoryCostingMethod,
    moneyRoundingMode: company.moneyRoundingMode,
    emailNotificationsEnabled: company.emailNotificationsEnabled,
    status: company.status,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}
