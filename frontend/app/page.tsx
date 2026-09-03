"use client";

import { useCallback, useEffect, useState, ChangeEvent } from "react";

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
  const [salesHistory, setSalesHistory] = useState<{ date: string; quantity: number; incomplete?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(false);
  const [error, setError] = useState("");
  const [salesError, setSalesError] = useState("");

  const loadStatus = useCallback(async (warehouse?: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await getStockStatus(warehouse);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Erreur lors du chargement du statut de stock.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSalesHistory = useCallback(async (warehouse?: string) => {
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
  }, []);

  useEffect(() => {
    getWarehouses()
      .then(setWarehouses)
      .catch(() => {
        // liste optionnelle
      });
    loadStatus();
    fetchSalesHistory();
  }, [loadStatus, fetchSalesHistory]);

  const handleWarehouseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextWarehouse = event.target.value;
    setSalesWarehouse(nextWarehouse);
    loadStatus(nextWarehouse || undefined);
    fetchSalesHistory(nextWarehouse || undefined);
  };

  const stats = {
    total: rows.length,
    rupture: rows.filter((r) => r.status === "rupture").length,
    critique: rows.filter((r) => r.status === "critique").length,
    commande: rows.filter((r) => r.status === "a_commander").length,
  };

  const incompleteMonth = salesHistory.some((point) => point.incomplete);

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Tableau de bord</h1>
        <p className="text-gray-500 mt-2">
          Statut de stock dérivé de la demande prévue, pas seulement de la moyenne historique.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <StatCard icon={Boxes} label="Entrepôts" value={loading ? "…" : stats.total} />
        <StatCard icon={ShoppingCart} label="À commander" value={loading ? "…" : stats.commande} tone="warning" />
        <StatCard icon={AlertTriangle} label="Critiques" value={loading ? "…" : stats.critique} tone="critical" />
        <StatCard icon={PackageX} label="Ruptures" value={loading ? "…" : stats.rupture} tone="critical" />
      </div>

      {error && (
        <div className="rounded-2xl border border-status-criticalSoft bg-status-criticalSoft/10 px-4 py-3 text-sm text-status-critical">
          {error}
        </div>
      )}

      {incompleteMonth && (
        <div className="rounded-2xl border border-status-watchSoft bg-status-watchSoft/20 px-4 py-3 text-sm text-status-watch">
          Le dernier mois de l&apos;historique est incomplet : il est affiché sur la courbe mais exclu de l&apos;entraînement et des dates de rupture.
        </div>
      )}

      <section className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Activité de stockage</h2>
            <p className="text-sm text-ink-faint mt-1">
              Filtre appliqué aux ventes, aux niveaux de stock et au tableau de statut.
            </p>
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
          <div className="bg-surface border border-line rounded-2xl p-5 transition-shadow duration-200 hover:shadow-md">
            <h3 className="text-base font-semibold mb-4">Historique des ventes</h3>
            {salesError ? (
              <div className="text-status-critical text-sm">{salesError}</div>
            ) : salesLoading ? (
              <div className="text-sm text-ink-faint">Chargement de l&apos;historique...</div>
            ) : salesHistory.length > 0 ? (
              <div className="animate-fade-in">
                <HistoryChart data={salesHistory} />
              </div>
            ) : (
              <div className="text-sm text-ink-faint">Aucune vente disponible.</div>
            )}
          </div>
          <div className="bg-surface border border-line rounded-2xl p-5 transition-shadow duration-200 hover:shadow-md">
            <h3 className="text-base font-semibold mb-4">Niveaux de stock</h3>
            <StockLevelsChart rows={rows} />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-5">Statut des entrepôts</h2>
        {loading ? (
          <div className="text-sm text-ink-faint py-10 text-center">Calcul des trajectoires de stock...</div>
        ) : (
          <StockStatusTable rows={rows} />
        )}
      </section>
    </div>
  );
}
