"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { simulateForecast, getWarehouses, getStockStatus, ApiRequestError } from "@/lib/api";
import type { SimulationResult, StockStatusRow } from "@/lib/types";

const STORAGE_KEY = "simulation-form-state";

function getTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadStoredState(): {
  warehouse: string;
  stock: number | "";
  leadTime: number;
  minStock: number | "";
  referenceDate: string;
  months: number;
  result: SimulationResult | null;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface SimulationContextValue {
  warehouses: string[];
  warehouse: string;
  stock: number | "";
  leadTime: number | "";
  minStock: number | "";
  referenceDate: string;
  months: number;
  loading: boolean;
  result: SimulationResult | null;
  error: string | null;
  notification: string | null;
  setWarehouse: (warehouse: string) => void;
  setStock: (stock: number | "") => void;
  setLeadTime: (leadTime: number | "") => void;
  setMinStock: (minStock: number | "") => void;
  setReferenceDate: (referenceDate: string) => void;
  setMonths: (months: number) => void;
  simulate: () => void;
  dismissNotification: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [statusRows, setStatusRows] = useState<StockStatusRow[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [stock, setStock] = useState<number | "">("");
  const [leadTime, setLeadTime] = useState<number | "">(7);
  const [minStock, setMinStock] = useState<number | "">("");
  const [referenceDate, setReferenceDate] = useState("");
  const [months, setMonths] = useState(3);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredState();
    if (stored) {
      setWarehouse(stored.warehouse ?? "");
      setStock(stored.stock ?? "");
      setLeadTime(stored.leadTime ?? 7);
      setMinStock(stored.minStock ?? "");
      setReferenceDate(stored.referenceDate || getTodayIso());
      setMonths(stored.months ?? 3);
      setResult(stored.result ?? null);
    } else {
      setReferenceDate(getTodayIso());
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    getWarehouses()
      .then((data) => {
        setWarehouses(data);
        if (data.length && !warehouse) {
          setWarehouse(data[0]);
        }
      })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "Impossible de charger les entrepôts.");
      });
    getStockStatus()
      .then(setStatusRows)
      .catch(() => {
        // ignore
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!warehouse) return;
    const row = statusRows.find((item) => item.warehouse === warehouse);
    if (!row) return;
    setStock(row.stock);
    setLeadTime(row.delivery_time || 7);
    setMinStock(row.min_stock);
  }, [warehouse, statusRows]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ warehouse, stock, leadTime, minStock, referenceDate, months, result })
    );
  }, [hydrated, warehouse, stock, leadTime, minStock, referenceDate, months, result]);

  const simulate = useCallback(async () => {
    if (!warehouse) {
      setError("Veuillez sélectionner un entrepôt.");
      return;
    }
    if (stock === "") {
      setError("Indiquez un stock actuel (kg).");
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const data = await simulateForecast({
        warehouse,
        current_stock: stock,
        lead_time: leadTime === "" ? 7 : leadTime,
        min_stock: minStock === "" ? 0 : minStock,
        reference_date: referenceDate || undefined,
        months,
      });
      setResult(data);
      setNotification(`Simulation prête pour ${warehouse} (les paramètres d'entrepôt n'ont pas été modifiés)`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible de lancer la simulation.");
    } finally {
      setLoading(false);
    }
  }, [warehouse, stock, leadTime, minStock, referenceDate, months]);

  const dismissNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return (
    <SimulationContext.Provider
      value={{
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
        notification,
        setWarehouse,
        setStock,
        setLeadTime,
        setMinStock,
        setReferenceDate,
        setMonths,
        simulate,
        dismissNotification,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) {
    throw new Error("useSimulation doit être utilisé à l'intérieur de SimulationProvider");
  }
  return ctx;
}
