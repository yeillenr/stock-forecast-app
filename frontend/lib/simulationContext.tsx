"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { simulateForecast, getWarehouses, ApiRequestError } from "@/lib/api";

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
  result: any;
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
  leadTime: number;
  minStock: number | "";
  referenceDate: string;
  months: number;
  loading: boolean;
  result: any;
  error: string | null;
  notification: string | null;
  setWarehouse: (warehouse: string) => void;
  setStock: (stock: number | "") => void;
  setLeadTime: (leadTime: number) => void;
  setMinStock: (minStock: number | "") => void;
  setReferenceDate: (referenceDate: string) => void;
  setMonths: (months: number) => void;
  simulate: () => void;
  dismissNotification: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [stock, setStock] = useState<number | "">("");
  const [leadTime, setLeadTime] = useState(7);
  const [minStock, setMinStock] = useState<number | "">("");
  const [referenceDate, setReferenceDate] = useState("");
  const [months, setMonths] = useState(3);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Ne lit le localStorage qu'après le montage côté client, pour éviter
  // un décalage entre le HTML rendu côté serveur et celui du client.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ warehouse, stock, leadTime, minStock, referenceDate, months, result })
    );
  }, [hydrated, warehouse, stock, leadTime, minStock, referenceDate, months, result]);

  const simulate = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const data = await simulateForecast({
        warehouse: warehouse || undefined,
        current_stock: stock === "" ? 0 : stock,
        lead_time: leadTime,
        min_stock: minStock === "" ? 0 : minStock,
        reference_date: referenceDate || undefined,
        months,
      });
      setResult(data);
      setNotification(
        warehouse ? `Simulation prête pour ${warehouse}` : "Simulation prête"
      );
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
