import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "critical";
  icon: LucideIcon;
}

const TONE_STYLES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-ink",
  warning: "text-status-watch",
  critical: "text-status-critical",
};

export default function StatCard({ label, value, tone = "default", icon: Icon }: StatCardProps) {
  return (
    <div className="bg-surface border border-line rounded-lg p-4 flex items-start justify-between">
      <div>
        <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">{label}</p>
        <p className={`font-display text-2xl font-semibold ${TONE_STYLES[tone]}`}>{value}</p>
      </div>
      <div className="w-9 h-9 rounded-md bg-canvas flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-ink-soft" strokeWidth={2} />
      </div>
    </div>
  );
}
