"use client";

import { useEffect, useRef, useState, ChangeEvent } from "react";

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
  getSalesHistory,
} from "@/lib/api";

import type { StockStatusRow } from "@/lib/types";

import StatCard from "@/components/StatCard";
import StockStatusTable from "@/components/StockStatusTable";
import StockLevelsChart from "@/components/StockLevelsChart";
import HistoryChart from "@/components/HistoryChart";

export default function DashboardPage() {
  const [rows, setRows] = useState<StockStatusRow[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [salesWarehouse, setSalesWarehouse] = useState("");
  const [salesHistory, setSalesHistory] = useState<{ date: string; quantity: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(false);
  const [error, setError] = useState("");
  const [salesError, setSalesError] = useState("");
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

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

    fetchSalesHistory();
  }, []);

  async function fetchSalesHistory(warehouse?: string) {
    setSalesLoading(true);
    setSalesError("");

    try {
      const data = await getSalesHistory(warehouse);
      setSalesHistory(data);
    } catch (err) {
      setSalesError(err instanceof ApiRequestError ? err.message : "Impossible de charger l'historique des ventes.");
      setSalesHistory([]);
    } finally {
      setSalesLoading(false);
    }
  }

  const handleWarehouseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextWarehouse = event.target.value;
    setSalesWarehouse(nextWarehouse);
    fetchSalesHistory(nextWarehouse || undefined);
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
            <h2 className="text-xl font-semibold">Activité de stockage</h2>
            <p className="text-sm text-ink-faint mt-1">Historique des ventes et niveaux de stock à partir des données importées.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-medium text-ink">Entrepôt</label>
            <select
              className="border border-line rounded-lg px-3 py-2 bg-white"
              value={salesWarehouse}
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

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-surface border border-line rounded-2xl p-5">
            <h3 className="text-base font-semibold mb-4">Historique des ventes</h3>
            {salesError ? (
              <div className="text-status-critical text-sm">{salesError}</div>
            ) : salesLoading ? (
              <div className="text-sm text-ink-faint">Chargement de l'historique...</div>
            ) : salesHistory.length > 0 ? (
              <HistoryChart data={salesHistory} />
            ) : (
              <div className="text-sm text-ink-faint">Aucune vente disponible.</div>
            )}
          </div>
          <div className="bg-surface border border-line rounded-2xl p-5">
            <h3 className="text-base font-semibold mb-4">Niveaux de stock</h3>
            <StockLevelsChart rows={rows} />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-5">Produits critiques</h2>
        <StockStatusTable rows={rows} />
      </section>

    </div>
  );
}