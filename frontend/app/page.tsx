"use client";

import { useEffect, useState, ChangeEvent } from "react";

import {
  Boxes,
  AlertTriangle,
  PackageX,
  ShoppingCart,
} from "lucide-react";

import {
  ApiRequestError,
  getStockStatus,
  getWarehouses,
  getForecast,
} from "@/lib/api";

import type { ForecastApiResponse, StockStatusRow } from "@/lib/types";

import StatCard from "@/components/StatCard";
import StockStatusTable from "@/components/StockStatusTable";
import ForecastChart from "@/components/ForecastChart";
import HistoryChart from "@/components/HistoryChart";

export default function DashboardPage() {
  const [rows, setRows] = useState<StockStatusRow[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [forecastWarehouse, setForecastWarehouse] = useState("");
  const [forecastData, setForecastData] = useState<ForecastApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [error, setError] = useState("");
  const [forecastError, setForecastError] = useState("");

  useEffect(() => {
    setLoading(true);
    getStockStatus()
      .then(setRows)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "Erreur lors du chargement du statut de stock.");
      })
      .finally(() => setLoading(false));

    getWarehouses()
      .then(setWarehouses)
      .catch(() => {
        // ignore warehouse list error
      });

    fetchForecast();
  }, []);

  async function fetchForecast(warehouse?: string) {
    setForecastLoading(true);
    setForecastError("");

    try {
      const data = await getForecast(warehouse, 3);
      setForecastData(data);
    } catch (err) {
      setForecastError(err instanceof ApiRequestError ? err.message : "Impossible de charger les prévisions.");
      setForecastData(null);
    } finally {
      setForecastLoading(false);
    }
  }

  const handleWarehouseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextWarehouse = event.target.value;
    setForecastWarehouse(nextWarehouse);
    fetchForecast(nextWarehouse || undefined);
  };

  const stats = {
    total: rows.length,
    rupture: rows.filter((r) => r.status === "rupture").length,
    critique: rows.filter((r) => r.status === "critique").length,
    commande: rows.filter((r) => r.status === "a_commander").length,
  };

  return (
    <div className="space-y-8 p-8">

      <div>
        <h1 className="text-3xl font-bold">
          Tableau de bord
        </h1>

        <p className="text-gray-500 mt-2">
          Vue globale de votre activité de stockage.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <StatCard icon={Boxes} label="Entrepôts" value={stats.total} />
        <StatCard icon={ShoppingCart} label="A commander" value={stats.commande} tone="warning" />
        <StatCard icon={AlertTriangle} label="Critiques" value={stats.critique} tone="critical" />
        <StatCard icon={PackageX} label="Ruptures" value={stats.rupture} tone="critical" />
      </div>

      {error && (
        <div className="rounded-2xl border border-status-criticalSoft bg-status-criticalSoft/10 px-4 py-3 text-sm text-status-critical">
          {error}
        </div>
      )}

      <section className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Prévisions de ventes</h2>
            <p className="text-sm text-ink-faint mt-1">Visualisation des prévisions à partir des ventes importées.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-medium text-ink">Entrepôt</label>
            <select
              className="border border-line rounded-lg px-3 py-2 bg-white"
              value={forecastWarehouse}
              onChange={handleWarehouseChange}
            >
              <option value="">Tous les entrepôts</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse} value={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          </div>
        </div>

        {forecastError ? (
          <div className="text-status-critical text-sm">{forecastError}</div>
        ) : forecastLoading ? (
          <div className="text-sm text-ink-faint">Chargement des prévisions...</div>
        ) : forecastData ? (
          <div className="grid gap-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="bg-surface border border-line rounded-2xl p-5">
                <h3 className="text-base font-semibold mb-4">Historique des ventes</h3>
                <HistoryChart data={forecastData.history} />
              </div>
              <div className="bg-surface border border-line rounded-2xl p-5">
                <h3 className="text-base font-semibold mb-4">Prévision</h3>
                <ForecastChart data={forecastData.forecast} />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-faint">Aucune prévision disponible.</div>
        )}
      </section>

      <section className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-5">Produits critiques</h2>
        <StockStatusTable rows={rows} />
      </section>

    </div>
  );
}