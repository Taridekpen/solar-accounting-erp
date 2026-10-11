import { BadRequestException } from "@nestjs/common";
import { formatMoneyUnits, multiplyMoney, parseMoney } from "../accounting/money";

export interface PricedLine {
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  lineNet: string;
  taxAmount: string;
  lineTotal: string;
}

export function priceLine(input: {
  quantity: string;
  unitPrice: string;
  discount?: string;
  taxRate?: string;
}): PricedLine {
  let quantity: bigint;
  let unitPrice: bigint;
  let discount: bigint;
  let taxRate: bigint;
  try {
    quantity = parseMoney(input.quantity);
    unitPrice = parseMoney(input.unitPrice);
    discount = parseMoney(input.discount ?? "0");
    taxRate = parseMoney(input.taxRate ?? "0");
  } catch {
    throw new BadRequestException("Quantities and amounts must be decimal strings");
  }
  if (quantity <= 0n) {
    throw new BadRequestException("Quantity must be greater than zero");
  }
  const extended = multiplyMoney(quantity, unitPrice);
  if (discount > extended) {
    throw new BadRequestException("Discount cannot exceed the line amount");
  }
  const lineNet = extended - discount;
  const taxAmount = multiplyMoney(lineNet, taxRate);
  return {
    quantity: formatMoneyUnits(quantity),
    unitPrice: formatMoneyUnits(unitPrice),
    discount: formatMoneyUnits(discount),
    taxRate: formatMoneyUnits(taxRate),
    lineNet: formatMoneyUnits(lineNet),
    taxAmount: formatMoneyUnits(taxAmount),
    lineTotal: formatMoneyUnits(lineNet + taxAmount),
  };
}

export function sumMoney(values: string[]): string {
  return formatMoneyUnits(values.reduce((total, value) => total + parseMoney(value), 0n));
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function moneyText(value: { toFixed(digits: number): string }): string {
  return value.toFixed(4);
}
