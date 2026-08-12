import type { StockStatusRow } from "@/lib/types";
import StatusBadge from "./StatusBadge";

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export default function StockStatusTable({ rows }: { rows: StockStatusRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-ink-faint py-10 text-center">
        Aucun entrepôt à afficher.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-faint uppercase tracking-wide border-b border-line">
            <th className="py-2.5 pr-4 font-medium">Entrepôt</th>
            <th className="py-2.5 pr-4 font-medium">Stock actuel</th>
            <th className="py-2.5 pr-4 font-medium">Consommation moyenne / jour</th>
            <th className="py-2.5 pr-4 font-medium">Autonomie</th>
            <th className="py-2.5 pr-4 font-medium">À commander dans</th>
            <th className="py-2.5 pr-4 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.warehouse} className="border-b border-line last:border-0">
              <td className="py-3 pr-4 font-medium text-ink">{row.warehouse}</td>
              <td className="py-3 pr-4 font-mono">{formatNumber(row.stock)}</td>
              <td className="py-3 pr-4 font-mono">{formatNumber(row.average_consumption)}</td>
              <td className="py-3 pr-4 font-mono">{formatNumber(row.autonomy)} j</td>
              <td className="py-3 pr-4 font-mono">{formatNumber(row.order_in_days)} j</td>
              <td className="py-3 pr-4">
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
