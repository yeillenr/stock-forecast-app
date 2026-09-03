"use client";

import { useEffect, useState } from "react";
import { getWarehouses, getStockStatus, updateWarehouseSettings, ApiRequestError } from "@/lib/api";
import type { StockStatusRow } from "@/lib/types";

export default function WarehouseForm() {
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [stockStatus, setStockStatus] = useState<StockStatusRow[]>([]);
  const [stock, setStock] = useState<number | "">("");
  const [deliveryTime, setDeliveryTime] = useState<number | "">("");
  const [minStock, setMinStock] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
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

    getStockStatus()
      .then(setStockStatus)
      .catch(() => {
        // les champs resteront vides
      });
  }, []);

  useEffect(() => {
    const row = stockStatus.find((item) => item.warehouse === warehouse);
    if (row) {
      setStock(row.stock);
      setDeliveryTime(row.delivery_time || 7);
      setMinStock(row.min_stock);
    }
  }, [warehouse, stockStatus]);

  async function save() {
    if (!warehouse) {
      setError("Veuillez sélectionner un entrepôt.");
      setSavedMessage(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSavedMessage(null);

    try {
      await updateWarehouseSettings({
        warehouse,
        stock: stock === "" ? 0 : stock,
        delivery_time: deliveryTime === "" ? 7 : deliveryTime,
        min_stock: minStock === "" ? 0 : minStock,
      });
      setSavedMessage("Paramètres enregistrés. Rechargez le tableau de bord pour voir le nouveau statut.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'enregistrer les paramètres.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-8">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm mb-2">Entrepôt</label>
          <select
            className="w-full border border-line rounded-md p-3 transition-colors duration-150 focus:border-brand"
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
            className="w-full border border-line rounded-md p-3 transition-colors duration-150 focus:border-brand"
            value={stock}
            onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-sm mb-2">Délai de livraison (jours)</label>
          <input
            type="number"
            min={0}
            className="w-full border border-line rounded-md p-3 transition-colors duration-150 focus:border-brand"
            value={deliveryTime}
            onChange={(e) => setDeliveryTime(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-sm mb-2">Stock minimum (kg)</label>
          <input
            type="number"
            min={0}
            className="w-full border border-line rounded-md p-3 transition-colors duration-150 focus:border-brand"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
      </div>

      {error && (
        <div className="animate-fade-in mt-6 rounded-xl border border-status-criticalSoft bg-status-criticalSoft/10 px-4 py-3 text-sm text-status-critical">
          {error}
        </div>
      )}
      {savedMessage && (
        <div className="animate-fade-in mt-6 rounded-xl border border-status-ctaSoft bg-status-ctaSoft/10 px-4 py-3 text-sm text-status-cta">
          {savedMessage}
        </div>
      )}

      <button
        onClick={save}
        disabled={loading}
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-white transition-all duration-200 hover:bg-brand-dark hover:shadow-md active:scale-[0.98] disabled:opacity-60 disabled:hover:bg-brand disabled:active:scale-100"
      >
        {loading ? "Enregistrement..." : "Enregistrer"}
      </button>
    </div>
  );
}
