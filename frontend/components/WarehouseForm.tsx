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
        // ignore, les champs resteront à 0
      });
  }, []);

  useEffect(() => {
    const row = stockStatus.find((item) => item.warehouse === warehouse);
    if (row) {
      setStock(row.stock);
      setDeliveryTime(row.delivery_time);
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
        delivery_time: deliveryTime ==="" ? 0 : deliveryTime,
      });
      setSavedMessage("Paramètres enregistrés.");
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
            className="w-full border border-line rounded-md p-3"
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
          <label className="block text-sm mb-2">Stock actuel (KG)</label>
          <input
            type="number"
            className="w-full border border-line rounded-md p-3"
            value={stock}
            onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-sm mb-2">Délai de livraison (jours)</label>
          <input
            type="number"
            className="w-full border border-line rounded-md p-3"
            value={deliveryTime}
            onChange={(e) => setDeliveryTime(Number(e.target.value))}
          />
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-status-criticalSoft bg-status-criticalSoft/10 px-4 py-3 text-sm text-status-critical">
          {error}
        </div>
      )}
      {savedMessage && (
        <div className="mt-6 rounded-xl border border-status-ctaSoft bg-status-ctaSoft/10 px-4 py-3 text-sm text-status-cta">
          {savedMessage}
        </div>
      )}

      <button
        onClick={save}
        disabled={loading}
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-white disabled:opacity-60"
      >
        {loading ? "Enregistrement..." : "Enregistrer"}
      </button>
    </div>
  );
}
