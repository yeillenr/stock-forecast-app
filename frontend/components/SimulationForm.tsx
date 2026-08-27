"use client";

import { AlertTriangle } from "lucide-react";
import { useSimulation } from "@/lib/simulationContext";

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

  return (
    <div className="space-y-8">

      <div className="bg-surface border border-line rounded-xl p-8">

        <div className="grid md:grid-cols-2 gap-6">

          <div>
            <label className="block text-sm mb-2">Dépôt</label>

            <select
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="">Choisir...</option>
              {warehouses.length > 0 ? (
                warehouses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))
              ) : (
                <option value="">Aucun entrepôt disponible</option>
              )}
            </select>

          </div>

          <div>
            <label>Stock actuel (Kg)</label>

            <input
              type="number"
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={stock}
              onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div>
            <label>Délai de livraison (jours)</label>

            <input
              type="number"
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={leadTime}
              onChange={(e) => setLeadTime(Number(e.target.value))}
            />
          </div>

          <div>
            <label>Stock minimum (Kg)</label>

            <input
              type="number"
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div>
            <label>Date de référence</label>

            <input
              type="date"
              className="w-full border rounded-md p-3 transition-colors duration-150 focus:border-brand"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
            />
          </div>

          <div>
            <label>Horizon</label>

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
                Historique limité ({result.history_months} mois de données) : cette prévision doit être interprétée
                avec prudence, le modèle n'a pas assez de recul pour être vraiment fiable.
              </span>
            </div>
          )}

          {result.remaining_stock <= leadTime && (
            <div className="flex items-center gap-3 rounded-xl bg-status-out px-5 py-4 text-white font-semibold shadow-sm">
              <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
              <span>
                Risque de rupture : le stock atteindra le seuil minimum le {formatDate(result.stockout_date)}, avant
                même l'arrivée d'une commande passée aujourd'hui (délai de livraison : {leadTime} j).
              </span>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Card title="Demande prévue" value={`${formatNumber(result.predicted_demand?.toFixed?.(0)) } Kg`} />
            <Card title="Demande ajustée" value={`${formatNumber(result.adjusted_demand) } Kg `} />
            <Card title="Quantité à commander" value={`${formatNumber(result.quantity_to_order) } Kg `} />
            <Card
              title="Date de rupture"
              value={formatDate(result.stockout_date)}
              subtitle={`dans ${formatNumber(result.remaining_stock)} jours`}
            />
            <Card title="Niveau de risque" value={result.risk } />
            <Card title="Date de commande" value={formatDate(result.forecast_date)} />
          </div>

          <div className="text-xs italic text-ink-faint space-y-1">
            <div className="flex gap-4">
              <span>MAE : {formatNumber(result.MAE)} Kg</span>
              <span>RMSE : {formatNumber(result.RMSE)} Kg</span>
              {result.credibility_rate != null && (
                <span>Crédibilité : {result.credibility_rate} %</span>
              )}
            </div>
            {result.days_since_last_data != null && (
              <div>Dernière donnée il y a {result.days_since_last_data} j</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, subtitle }: any) {
  return (
    <div className="bg-surface border border-line rounded-xl p-5 transition-shadow duration-200 hover:shadow-md">
      <p className="text-sm text-ink-soft">{title}</p>
      <p className="text-2xl font-semibold mt-2">{value}</p>
      {subtitle && <p className="text-xs text-ink-faint mt-1">{subtitle}</p>}
    </div>
  );
}
function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";

  return new Intl.NumberFormat("fr-FR").format(value);
}
function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
