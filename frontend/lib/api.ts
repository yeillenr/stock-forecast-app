import type { ForecastApiResponse, SimulationResult, StockStatusRow, UploadSalesResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === "string" ? item : item?.msg || JSON.stringify(item)))
      .join(" ; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "";
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      const parsed = formatDetail(body?.detail);
      if (parsed) detail = parsed;
    } catch {
      // réponse non-JSON
    }
    throw new ApiRequestError(detail);
  }
  return res.json() as Promise<T>;
}

export async function uploadSales(files: File[]): Promise<UploadSalesResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const res = await fetch(`${API_BASE}/import`, {
    method: "POST",
    body: formData,
  });
  return handle<UploadSalesResponse>(res);
}

export async function getStockStatus(warehouse?: string): Promise<StockStatusRow[]> {
  const query = warehouse ? `?warehouse=${encodeURIComponent(warehouse)}` : "";
  const res = await fetch(`${API_BASE}/stock-status${query}`);
  return handle<StockStatusRow[]>(res);
}

export async function getWarehouses(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/warehouses`);
  return handle<string[]>(res);
}

export async function getSalesHistory(warehouse?: string): Promise<{ date: string; quantity: number; incomplete?: boolean }[]> {
  const query = warehouse ? `?warehouse=${encodeURIComponent(warehouse)}` : "";
  const res = await fetch(`${API_BASE}/sales${query}`);
  return handle<{ date: string; quantity: number; incomplete?: boolean }[]>(res);
}

export async function updateWarehouseSettings(data: {
  warehouse: string;
  stock: number;
  delivery_time: number;
  min_stock: number;
}) {
  const res = await fetch(`${API_BASE}/warehouse/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handle<unknown>(res);
}

export interface SimulationRequest {
  warehouse?: string;
  current_stock?: number;
  lead_time?: number;
  min_stock?: number;
  reference_date?: string;
  months: number;
}

export interface AssistantResponse {
  reply: string;
}

export async function getForecast(
  warehouse: string | undefined,
  months: number
): Promise<ForecastApiResponse> {
  const body: { months: number; warehouse?: string } = { months };
  if (warehouse) body.warehouse = warehouse;
  const res = await fetch(`${API_BASE}/forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handle<ForecastApiResponse>(res);
}

export async function simulateForecast(data: SimulationRequest): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/simulation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return handle<SimulationResult>(res);
}

export async function assistantRequest(message: string): Promise<AssistantResponse> {
  const res = await fetch(`${API_BASE}/assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  return handle<AssistantResponse>(res);
}

export { ApiRequestError };
