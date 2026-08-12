export interface DashboardSummary {
  warehouse: string;
  stock: number;
  average_consumption: number;
  autonomy: number;
  delivery_time: number;
  order_in_days: number;
  quantity_to_order: number;
}

export interface SalesPoint {
  date: string;
  Quantité?: number;
  quantity?: number;
}

export interface ForecastPoint {
  date: string;
  prediction: number;
  lower: number;
  upper: number;
}

export interface ForecastApiResponse {
  history: Array<{ date: string; quantity: number }>;
  forecast: ForecastPoint[];
}

export interface UploadSalesResponse {
  success: boolean;
  message: string;
  sales_files: number;
}

export interface AssistantResponse {
  reply: string;
}

export interface WarehouseSettingsRequest {
  warehouse: string;
  stock: number;
  delivery_time: number;
}

export type StockStatusLevel = "rupture" | "critique" | "a_commander" | "ok";

export interface StockStatusRow {
  warehouse: string;
  stock: number;
  average_consumption: number;
  autonomy: number;
  delivery_time: number;
  order_in_days: number;
  quantity_to_order: number;
  status: StockStatusLevel;
}

export interface ApiError {
  detail: string;
}
