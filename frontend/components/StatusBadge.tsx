import type { StockStatusLevel } from "@/lib/types";
import { AlertTriangle, CheckCircle2, XCircle, ShoppingCart } from "lucide-react";

const CONFIG: Record<
  StockStatusLevel,
  { label: string; bg: string; text: string; Icon: typeof CheckCircle2 }
> = {
  ok: { label: "OK", bg: "bg-status-okSoft", text: "text-status-ok", Icon: CheckCircle2 },
  a_commander: {
    label: "À commander",
    bg: "bg-status-watchSoft",
    text: "text-status-watch",
    Icon: ShoppingCart,
  },
  critique: {
    label: "Critique",
    bg: "bg-status-criticalSoft",
    text: "text-status-critical",
    Icon: AlertTriangle,
  },
  rupture: {
    label: "Rupture",
    bg: "bg-status-outSoft",
    text: "text-status-out",
    Icon: XCircle,
  },
};

export default function StatusBadge({ status }: { status: StockStatusLevel }) {
  const { label, bg, text, Icon } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
      {label}
    </span>
  );
}
