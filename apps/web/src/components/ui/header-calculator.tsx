import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";

type Op = "+" | "-" | "×" | "÷";

function applyOp(left: number, right: number, op: Op): number {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "×":
      return left * right;
    case "÷":
      return right === 0 ? Number.NaN : left / right;
  }
}

function formatDisplay(value: string) {
  if (value === "Error") return value;
  if (value.includes("e") || value.includes("E")) return value;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Error";
  const asFixed = num.toFixed(10).replace(/\.?0+$/, "");
  return asFixed === "-0" ? "0" : asFixed;
}

export function HeaderCalculator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const inputDigit = (digit: string) => {
    setDisplay((current) => {
      if (current === "Error" || fresh) return digit;
      if (current === "0") return digit;
      if (current.replace(".", "").length >= 12) return current;
      return `${current}${digit}`;
    });
    setFresh(false);
  };

  const inputDot = () => {
    setDisplay((current) => {
      if (current === "Error" || fresh) return "0.";
      if (current.includes(".")) return current;
      return `${current}.`;
    });
    setFresh(false);
  };

  const clearAll = () => {
    setDisplay("0");
    setStored(null);
    setPendingOp(null);
    setFresh(true);
  };

  const chooseOp = (op: Op) => {
    const value = Number(display);
    if (!Number.isFinite(value)) {
      clearAll();
      setDisplay("Error");
      return;
    }
    if (stored !== null && pendingOp && !fresh) {
      const result = applyOp(stored, value, pendingOp);
      if (!Number.isFinite(result)) {
        clearAll();
        setDisplay("Error");
        return;
      }
      setStored(result);
      setDisplay(formatDisplay(String(result)));
    } else {
      setStored(value);
    }
    setPendingOp(op);
    setFresh(true);
  };

  const equals = () => {
    if (stored === null || !pendingOp) return;
    const value = Number(display);
    const result = applyOp(stored, value, pendingOp);
    if (!Number.isFinite(result)) {
      clearAll();
      setDisplay("Error");
      return;
    }
    setDisplay(formatDisplay(String(result)));
    setStored(null);
    setPendingOp(null);
    setFresh(true);
  };

  const keys: { label: string; onClick: () => void; className?: string; span?: boolean }[] = [
    { label: "C", onClick: clearAll, className: "bg-canvas text-rose-600" },
    {
      label: "±",
      onClick: () => {
        setDisplay((current) => {
          if (current === "Error" || current === "0") return current;
          return current.startsWith("-") ? current.slice(1) : `-${current}`;
        });
        setFresh(false);
      },
    },
    {
      label: "%",
      onClick: () => {
        const value = Number(display);
        if (!Number.isFinite(value)) return;
        setDisplay(formatDisplay(String(value / 100)));
        setFresh(true);
      },
    },
    { label: "÷", onClick: () => chooseOp("÷"), className: "bg-primary/10 text-primary" },
    { label: "7", onClick: () => inputDigit("7") },
    { label: "8", onClick: () => inputDigit("8") },
    { label: "9", onClick: () => inputDigit("9") },
    { label: "×", onClick: () => chooseOp("×"), className: "bg-primary/10 text-primary" },
    { label: "4", onClick: () => inputDigit("4") },
    { label: "5", onClick: () => inputDigit("5") },
    { label: "6", onClick: () => inputDigit("6") },
    { label: "-", onClick: () => chooseOp("-"), className: "bg-primary/10 text-primary" },
    { label: "1", onClick: () => inputDigit("1") },
    { label: "2", onClick: () => inputDigit("2") },
    { label: "3", onClick: () => inputDigit("3") },
    { label: "+", onClick: () => chooseOp("+"), className: "bg-primary/10 text-primary" },
    { label: "0", onClick: () => inputDigit("0"), span: true },
    { label: ".", onClick: inputDot },
    { label: "=", onClick: equals, className: "bg-primary text-primary-foreground" },
  ];

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 rounded-2xl border border-line bg-card p-3 shadow-card"
      role="dialog"
      aria-label="Calculator"
    >
      <div className="mb-3 rounded-xl border border-line bg-canvas px-3 py-3 text-right font-mono text-2xl tabular-nums text-ink">
        {display}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {keys.map((key) => (
          <button
            key={key.label}
            type="button"
            onClick={key.onClick}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg border border-line text-sm font-medium hover:bg-canvas",
              key.span ? "col-span-2" : "",
              key.className,
            )}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
