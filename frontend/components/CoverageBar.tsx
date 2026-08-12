import type { StockStatusLevel } from "@/lib/types";

interface CoverageBarProps {
  daysOfCoverage: number | null;
  leadTimeDays: number;
  safetyStockDays: number;
  status: StockStatusLevel;
}

const MARKER_COLOR: Record<StockStatusLevel, string> = {
  ok: "#2F8F5B",
  a_commander: "#C98A24",
  critique: "#B8442F",
  rupture: "#7A1F1F",
};

/**
 * Jauge horizontale : le stock disponible est représenté comme une distance
 * en jours à parcourir avant la rupture. Les zones colorées montrent où se
 * situe le délai de réapprovisionnement (rouge) et la marge de sécurité
 * (ambre), pour visualiser d'un coup d'œil si le repère de stock actuel
 * (le curseur) est déjà dans la zone de danger.
 */
export default function CoverageBar({
  daysOfCoverage,
  leadTimeDays,
  safetyStockDays,
  status,
}: CoverageBarProps) {
  if (daysOfCoverage === null) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-line" />
        <span className="text-xs text-ink-faint whitespace-nowrap">
          pas de demande prévue
        </span>
      </div>
    );
  }

  const criticalEnd = leadTimeDays;
  const watchEnd = leadTimeDays + safetyStockDays;
  const displayMax = Math.max(daysOfCoverage * 1.15, watchEnd * 1.6, 14);

  const criticalPct = Math.min(100, (criticalEnd / displayMax) * 100);
  const watchPct = Math.min(100, (watchEnd / displayMax) * 100) - criticalPct;
  const okPct = 100 - criticalPct - watchPct;

  const markerPct = Math.min(100, (daysOfCoverage / displayMax) * 100);

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="relative h-2 flex-1 rounded-full overflow-hidden bg-status-outSoft flex">
        <div
          className="h-full bg-status-critical/70"
          style={{ width: `${criticalPct}%` }}
        />
        <div
          className="h-full bg-status-watch/60"
          style={{ width: `${watchPct}%` }}
        />
        <div
          className="h-full bg-status-ok/50"
          style={{ width: `${okPct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow"
          style={{ left: `${markerPct}%`, backgroundColor: MARKER_COLOR[status] }}
          title={`${daysOfCoverage} jours de couverture`}
        />
      </div>
      <span className="text-xs font-mono text-ink-soft whitespace-nowrap w-14 text-right">
        {daysOfCoverage} j
      </span>
    </div>
  );
}
