"use client";

import { useEffect, useState } from "react";
import { getForecast, getWarehouses, ApiRequestError } from "@/lib/api";
import type { ForecastApiResponse } from "@/lib/types";
import ForecastChart from "@/components/ForecastChart";
import { Loader2, AlertTriangle } from "lucide-react";

const HORIZON_OPTIONS = [1, 3, 6, 12];

const MODEL_LABEL: Record<string, string> = {
  prophet: "Prophet",
  pooled_prophet: "Prophet (dépôt lié)",
  seasonal_naive: "Naïve saisonnière",
  mean: "Moyenne",
  naive: "Naïve",
};

export default function ForecastPage() {
  const [horizon, setHorizon] = useState(3);
  const [warehouse, setWarehouse] = useState("");
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [forecastData, setForecastData] = useState<ForecastApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWarehouses()
      .then((data) => {
        setWarehouses(data);
        if (data.length) setWarehouse(data[0]);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  async function handleForecast() {
    setLoading(true);
    setError(null);

    try {
      const result = await getForecast(warehouse || undefined, horizon);
      setForecastData(result);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  const chartData = forecastData?.forecast ?? [];
  const modelLabel = forecastData?.model_used
    ? MODEL_LABEL[forecastData.model_used] || forecastData.model_used
    : null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Prévisions de ventes</h1>
        <p className="text-sm text-ink-soft mt-1">
          Prophet n&apos;est utilisé que s&apos;il bat une baseline sur un hold-out chronologique. Les mois incomplets sont exclus.
        </p>
      </header>

      <div className="bg-surface border border-line rounded-lg p-5 mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">
            Entrepôt
          </label>
          <select
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            className="w-full border border-line rounded-md px-3 py-2 text-sm bg-surface"
          >
            <option value="">Tous les entrepôts</option>
            {warehouses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">
            Horizon de prévision
          </label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="w-full border border-line rounded-md px-3 py-2 text-sm bg-surface"
          >
            {HORIZON_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} mois
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleForecast}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-60"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Lancer la prévision
        </button>
      </div>

      {error && (
        <div className="bg-status-criticalSoft text-status-critical text-sm rounded-md px-4 py-3 mb-6 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {forecastData ? (
        <div className="bg-surface border border-line rounded-lg p-5">
          <div className="mb-4 text-sm text-ink-faint space-y-1">
            <div>
              Prévision sur {horizon} mois
              {modelLabel ? ` · modèle servi : ${modelLabel}` : ""}
              {forecastData.mape != null ? ` · MAPE hold-out ${forecastData.mape} %` : ""}
            </div>
            {forecastData.incomplete_month_dropped && (
              <div>Mois incomplet écarté : {forecastData.incomplete_month_dropped}</div>
            )}
          </div>
          <ForecastChart data={chartData} />
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-ink-soft">
          Choisissez un entrepôt et un horizon, puis lancez la prévision.
        </div>
      )}
    </div>
  );
}
