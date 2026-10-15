import { BadRequestException } from "@nestjs/common";

const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decode a base64 payload (optionally a data-URL) into raw file bytes. */
export function decodeBase64ToBytes(value: string, maxBytes: number, label = "file"): Buffer {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`The ${label} content is empty`);
  }
  const raw = trimmed.includes(",") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed;
  const compact = raw.replace(/\s/g, "");
  if (!compact || compact.length % 4 !== 0 || !BASE64_BODY.test(compact)) {
    throw new BadRequestException(`The ${label} content is not valid base64`);
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length === 0) {
    throw new BadRequestException(`The ${label} content is empty`);
  }
  if (bytes.length > maxBytes) {
    throw new BadRequestException(`The ${label} must be a file of ${Math.floor(maxBytes / 1_000_000)} MB or less`);
  }
  return bytes;
}

export function mimeTypeFromFileName(fileName: string): string {
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "csv":
      return "text/csv";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}
