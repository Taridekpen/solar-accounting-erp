import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AccessContext } from "../auth/access";
import { AuditService } from "../auth/audit.service";
import { assertBranchAllowed } from "../organization/branch-scope";
import { CompanyService } from "../organization/company.service";
import { DOCUMENT_KINDS, DocumentListQueryDto, UploadDocumentDto } from "./admin.dto";

const MAX_BYTES = 2_000_000;
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "text/csv"]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompanyService,
    private readonly audit: AuditService,
  ) {}

  async list(access: AccessContext, query: DocumentListQueryDto) {
    const company = await this.companies.requireRecord();
    const where: Prisma.ManagedDocumentWhereInput = {
      companyId: company.id,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.documentKind ? { documentKind: query.documentKind } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...this.scopeFilter(access),
    };
    const rows = await this.prisma.managedDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        branchId: true,
        entityType: true,
        entityId: true,
        documentKind: true,
        fileName: true,
        mimeType: true,
        byteSize: true,
        uploadedByUserId: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      contentUrl: `/documents/${row.id}/content`,
    }));
  }

  async upload(access: AccessContext, input: UploadDocumentDto, correlationId?: string) {
    if (!access.permissions.includes("documents.manage") && !access.permissions.includes("settings.manage")) {
      throw new ForbiddenException("Document upload is not authorized");
    }
    if (!(DOCUMENT_KINDS as readonly string[]).includes(input.documentKind)) {
      throw new BadRequestException("Document kind is not supported");
    }
    if (!ALLOWED_MIME.has(input.mimeType)) {
      throw new BadRequestException("File type is not allowed");
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.contentBase64, "base64");
    } catch {
      throw new BadRequestException("File content is not valid base64");
    }
    if (!bytes.length) throw new BadRequestException("File content is empty");
    if (bytes.length > MAX_BYTES) throw new BadRequestException("File exceeds the 2 MB limit");

    const company = await this.companies.requireRecord();
    let branchId = input.branchId ?? null;
    if (input.documentKind === "logo") {
      branchId = null;
    } else if (branchId) {
      assertBranchAllowed(access.scope, branchId);
    } else if (!access.companyWide && !access.permissions.includes("settings.view")) {
      throw new ForbiddenException("A branch is required for this document");
    }

    const row = await this.prisma.managedDocument.create({
      data: {
        companyId: company.id,
        branchId,
        entityType: input.entityType,
        entityId: input.entityId,
        documentKind: input.documentKind,
        fileName: input.fileName.trim(),
        mimeType: input.mimeType,
        content: new Uint8Array(bytes),
        byteSize: bytes.length,
        uploadedByUserId: access.userId,
      },
    });

    if (input.documentKind === "logo" && input.entityType === "company") {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { logoUrl: `/documents/${row.id}/content` },
      });
    }

    await this.audit.record({
      actorUserId: access.userId,
      action: "documents.uploaded",
      entityType: "managed_document",
      entityId: row.id,
      branchScope: branchId ? [branchId] : null,
      newValues: {
        fileName: row.fileName,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        documentKind: row.documentKind,
        entityType: row.entityType,
        entityId: row.entityId,
      },
      correlationId,
    });

    return {
      id: row.id,
      branchId: row.branchId,
      entityType: row.entityType,
      entityId: row.entityId,
      documentKind: row.documentKind,
      fileName: row.fileName,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      contentUrl: `/documents/${row.id}/content`,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async content(access: AccessContext, id: string) {
    const row = await this.prisma.managedDocument.findFirst({ where: { id } });
    if (!row) throw new NotFoundException("Document was not found");
    this.assertReadable(access, row.branchId);
    return { fileName: row.fileName, mimeType: row.mimeType, content: row.content };
  }

  private scopeFilter(access: AccessContext): Prisma.ManagedDocumentWhereInput {
    if (access.companyWide || access.scope.type === "company") {
      return {};
    }
    const branchIds = access.scope.branchIds;
    if (access.permissions.includes("settings.view")) {
      return { OR: [{ branchId: null }, { branchId: { in: branchIds } }] };
    }
    return { branchId: { in: branchIds } };
  }

  private assertReadable(access: AccessContext, branchId: string | null) {
    if (access.companyWide) return;
    if (branchId === null) {
      if (!access.permissions.includes("settings.view") && !access.permissions.includes("documents.view")) {
        throw new ForbiddenException("Company documents are not available for this account");
      }
      return;
    }
    assertBranchAllowed(access.scope, branchId);
  }
}
