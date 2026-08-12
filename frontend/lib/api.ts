import type { ForecastApiResponse, StockStatusRow, UploadSalesResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // réponse non-JSON, on garde le message générique
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

export async function getStockStatus(): Promise<StockStatusRow[]> {
  const res = await fetch(`${API_BASE}/stock-status`);
  return handle<StockStatusRow[]>(res);
}

export async function getWarehouses(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/warehouses`);
  return handle<string[]>(res);
}

export async function updateWarehouseSettings(data: {
  warehouse: string;
  stock: number;
  delivery_time: number;
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
  months: number;
}

export interface AssistantResponse {
  reply: string;
}

export async function getForecast(
  warehouse: string | undefined,
  months: number
): Promise<ForecastApiResponse> {
  const body = { warehouse, months };
  const res = await fetch(`${API_BASE}/forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handle<ForecastApiResponse>(res);
}

export async function simulateForecast(data: SimulationRequest | number): Promise<ForecastApiResponse> {
  const body = typeof data === "number" ? { months: data } : data;

  const res = await fetch(`${API_BASE}/simulation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return handle<ForecastApiResponse>(res);
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
