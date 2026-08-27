"use client";

import { useState } from "react";
import { simulateForecast, ApiRequestError } from "@/lib/api";
import type { ForecastApiResponse } from "@/lib/types";
import ForecastChart from "@/components/ForecastChart";
import { Loader2, AlertTriangle } from "lucide-react";

const HORIZON_OPTIONS = [1, 3, 6, 12];

export default function ForecastPage() {
  const [horizon, setHorizon] = useState(3);
  const [forecastData, setForecastData] = useState<ForecastApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlesimulateForecast() {
    setLoading(true);
    setError(null);

    try {
      const result = await simulateForecast(horizon);
      setForecastData(result);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  const chartData = forecastData?.forecast ?? [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Prévisions de ventes</h1>
        <p className="text-sm text-ink-soft mt-1">
          Visualisez la prévision mensuelle construite à partir de vos données importées.
        </p>
      </header>

      <div className="bg-surface border border-line rounded-lg p-5 mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
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
          onClick={handlesimulateForecast}
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
          <div className="mb-4 text-sm text-ink-faint">
            Prévision sur {horizon} mois
          </div>
          <ForecastChart data={chartData} />
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-ink-soft">
          Sélectionnez un horizon et lancez la prévision.
        </div>
      )}
    </div>
  );
}
