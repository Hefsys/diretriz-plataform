import { useEffect, useState } from "react";
import { fmtMoeda, parseMoeda } from "@/lib/dp/folha";

/** Célula de valor monetário: edita como texto e grava no blur/Enter. */
export function CelulaValor({ value, disabled, onCommit }: { value: number | undefined; disabled?: boolean; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? fmtMoeda(value) : "");
  useEffect(() => setText(value != null ? fmtMoeda(value) : ""), [value]);
  if (disabled) return <div className="px-2 py-1.5 text-right tabular-nums">{value != null ? fmtMoeda(value) : "—"}</div>;
  return (
    <input
      inputMode="decimal"
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
      placeholder="0,00"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d.,-]/g, ""))}
      onBlur={() => {
        const n = parseMoeda(text);
        if (text.trim() && n === null) { setText(value != null ? fmtMoeda(value) : ""); return; }
        setText(n != null ? fmtMoeda(n) : "");
        if ((n ?? null) !== (value ?? null)) onCommit(n);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}
