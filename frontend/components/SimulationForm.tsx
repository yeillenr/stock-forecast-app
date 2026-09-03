"use client";

import { AlertTriangle } from "lucide-react";
import { useSimulation } from "@/lib/simulationContext";
import ForecastChart from "@/components/ForecastChart";

const RISK_LABEL: Record<string, string> = {
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
  unknown: "Indéterminé",
};

const MODEL_LABEL: Record<string, string> = {
  prophet: "Prophet",
  pooled_prophet: "Prophet (dépôt lié)",
  seasonal_naive: "Naïve saisonnière",
  mean: "Moyenne",
  naive: "Naïve",
};

export default function SimulationForm() {
  const {
    warehouses,
    warehouse,
    stock,
    leadTime,
    minStock,
    referenceDate,
    months,
    loading,
    result,
    error,
    setWarehouse,
    setStock,
    setLeadTime,
    setMinStock,
    setReferenceDate,
    setMonths,
    simulate,
  } = useSimulation();

  const remainingDays = result?.remaining_days ?? result?.remaining_stock;
  const lead = leadTime === "" ? 0 : leadTime;

  return (
    <div className="space-y-8">
      <div className="bg-surface border border-line rounded-xl p-8">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm mb-2">Entrepôt</label>
            <select
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="">Choisir un entrepôt...</option>
              {warehouses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2">Stock actuel (kg)</label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={stock}
              onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Délai de livraison (jours)</label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Stock minimum (kg)</label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Date de référence</label>
            <input
              type="date"
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Horizon</label>
            <select
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              <option value={1}>1 mois</option>
              <option value={3}>3 mois</option>
              <option value={6}>6 mois</option>
              <option value={12}>12 mois</option>
            </select>
          </div>
        </div>

        <button
          onClick={simulate}
          disabled={loading}
          className="mt-8 bg-brand text-white rounded-lg px-6 py-3 transition-all duration-200 hover:bg-brand-dark hover:shadow-md active:scale-[0.98] disabled:opacity-60 disabled:hover:bg-brand disabled:active:scale-100"
        >
          {loading ? "Simulation..." : "Lancer la simulation"}
        </button>
      </div>

      {error && (
        <div className="animate-fade-in rounded-xl border border-status-criticalSoft bg-status-criticalSoft/10 px-4 py-3 text-sm text-status-critical">
          {error}
        </div>
      )}

      {result && (
        <div className="animate-fade-in space-y-8">
          {result.low_data_warning && (
            <div className="flex items-center gap-3 rounded-xl bg-status-watchSoft px-5 py-4 text-status-watch shadow-sm">
              <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
              <span>
                Historique limité ({result.history_months} mois complets) : un modèle simple est préféré à Prophet.
              </span>
            </div>
          )}

          {remainingDays != null && remainingDays <= lead && (
            <div className="flex items-center gap-3 rounded-xl bg-status-out px-5 py-4 text-white font-semibold shadow-sm">
              <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
              <span>
                Risque de rupture : le stock atteindra le seuil minimum le {formatDate(result.stockout_date)}, avant
                l&apos;arrivée d&apos;une commande passée aujourd&apos;hui (délai : {lead} j).
              </span>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Card title="Demande prévue (P50)" value={`${formatNumber(result.predicted_demand)} kg`} />
            <Card title="Demande haute (P10 stock)" value={`${formatNumber(result.adjusted_demand)} kg`} />
            <Card title="Quantité à commander" value={`${formatNumber(result.quantity_to_order)} kg`} />
            <Card
              title="Date de rupture (P50)"
              value={formatDate(result.stockout_date)}
              subtitle={`dans ${formatNumber(remainingDays)} jours`}
            />
            <Card
              title="Rupture P10 / P90"
              value={`${formatDate(result.stockout_date_p10)} / ${formatDate(result.stockout_date_p90)}`}
            />
            <Card title="Niveau de risque" value={RISK_LABEL[result.risk || ""] || result.risk || "-"} />
            <Card title="Date de commande" value={formatDate(result.order_date || result.forecast_date)} />
            <Card
              title="Modèle de demande"
              value={MODEL_LABEL[result.model_used || ""] || result.model_used || "-"}
            />
          </div>

          {result.forecast && result.forecast.length > 0 && (
            <div className="bg-surface border border-line rounded-xl p-5">
              <h3 className="text-base font-semibold mb-4">Trajectoire de demande prévue</h3>
              <ForecastChart data={result.forecast} />
            </div>
          )}

          <div className="text-xs italic text-ink-faint space-y-1">
            <div className="flex gap-4 flex-wrap">
              <span>MAE hold-out : {formatNumber(result.MAE)} kg</span>
              <span>RMSE : {formatNumber(result.RMSE)} kg</span>
              {result.mape != null && <span>MAPE : {result.mape} %</span>}
            </div>
            {result.days_since_last_data != null && (
              <div>Dernière donnée complète il y a {result.days_since_last_data} j</div>
            )}
            {result.incomplete_month_dropped && (
              <div>Mois incomplet écarté : {result.incomplete_month_dropped}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-5 transition-shadow duration-200 hover:shadow-md">
      <p className="text-sm text-ink-soft">{title}</p>
      <p className="text-2xl font-semibold mt-2">{value}</p>
      {subtitle && <p className="text-xs text-ink-faint mt-1">{subtitle}</p>}
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("fr-FR").format(Number(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
