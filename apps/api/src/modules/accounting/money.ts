const SCALE = 10000n;

export function parseMoney(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error("Money amounts must be zero or positive decimal strings");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt((fraction + "0000").slice(0, 4));
}

export function formatMoneyUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(4, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function multiplyMoney(quantity: bigint, unitCost: bigint): bigint {
  return (quantity * unitCost) / SCALE;
}

export function accountingDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Accounting date must be YYYY-MM-DD");
  }
  return new Date(`${value}T00:00:00.000Z`);
}
