"use client";

import { useEffect, useState } from "react";
import { simulateForecast, getWarehouses, ApiRequestError } from "@/lib/api";

export default function SimulationForm() {
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [stock, setStock] = useState<number | "">("");
  const [leadTime, setLeadTime] = useState(7);
  const [months, setMonths] = useState(3);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWarehouses()
      .then((data) => {
        setWarehouses(data);
        if (data.length) {
          setWarehouse(data[0]);
        }
      })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "Impossible de charger les entrepôts.");
      });
  }, []);

  async function simulate() {
    setError(null);
    setLoading(true);

    try {
      const data = await simulateForecast({
        warehouse: warehouse || undefined,
        current_stock: stock === "" ? 0 : stock,
        lead_time: leadTime,
        months,
      });
      console.log("Réponse API :", data);
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible de lancer la simulation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">

      <div className="bg-surface border border-line rounded-xl p-8">

        <div className="grid md:grid-cols-2 gap-6">

          <div>
            <label className="block text-sm mb-2">Dépôt</label>

            <select
              className="w-full border rounded-md p-3"
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
              className="w-full border rounded-md p-3"
              value={stock}
              onChange={(e) => setStock(Number(e.target.value))}
            />
          </div>

          <div>
            <label>Délai de livraison (jours)</label>

            <input
              type="number"
              className="w-full border rounded-md p-3"
              value={leadTime}
              onChange={(e) => setLeadTime(Number(e.target.value))}
            />
          </div>

          <div>
            <label>Horizon</label>

            <select
              className="w-full border rounded-md p-3"
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
          className="mt-8 bg-brand text-white rounded-lg px-6 py-3"
        >
          {loading ? "Simulation..." : "Lancer la simulation"}
        </button>

      </div>

      {error && (
        <div className="rounded-xl border border-status-criticalSoft bg-status-criticalSoft/10 px-4 py-3 text-sm text-status-critical">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Card title="Demande prévue" value={`${formatNumber(result.predicted_demand?.toFixed?.(0)) } Kg`} />
            <Card title="Demande ajustée" value={`${formatNumber(result.adjusted_demand) } Kg `} />
            <Card title="Quantité à commander" value={`${formatNumber(result.quantity_to_order) } Kg `} />
            <Card title="Autonomie restante" value={`${formatNumber(result.remaining_stock) } jours`} />
            <Card title="Niveau de risque" value={result.risk } />
            <Card title="Prochain approvisionnement" value={result.forecast_date } />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <Card title="Incertitude" value={`${formatNumber(result.forecast_uncertainty) } Kg`} />
            <Card title="Niveau de confiance" value={`${formatNumber(result.confidence) } %`} />
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, value }: any) {
  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <p className="text-sm text-ink-soft">{title}</p>
      <p className="text-2xl font-semibold mt-2">{value}</p>
    </div>
  );
}
function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";

  return new Intl.NumberFormat("fr-FR").format(value);
}