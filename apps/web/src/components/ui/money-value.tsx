import { formatMoney, type CurrencyCode } from "@solar/shared";

export function MoneyValue({ amount, currency }: { amount: string; currency?: CurrencyCode }) {
  const formatted = formatMoney(amount, currency);
  const negative = formatted.startsWith("-");
  const unsigned = negative ? formatted.slice(1) : formatted;
  const symbol = unsigned.slice(0, 1);
  const number = unsigned.slice(1);

  return (
    <span>
      {negative ? "-" : null}
      <span className="font-['Noto_Sans']">{symbol}</span>
      {number}
    </span>
  );
}
