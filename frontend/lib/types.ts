export interface DashboardSummary {
  warehouse: string;
  stock: number;
  min_stock: number;
  average_consumption: number;
  autonomy: number;
  stockout_date: string;
  delivery_time: number;
  order_in_days: number;
  quantity_to_order: number;
}

export interface SalesPoint {
  date: string;
  Quantité?: number;
  quantity?: number;
  incomplete?: boolean;
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
  MAE?: number | null;
  RMSE?: number | null;
  mape?: number | null;
  model_used?: string;
  low_data_warning?: boolean;
  history_months?: number;
  days_since_last_data?: number | null;
  incomplete_month_dropped?: string | null;
}

export interface SimulationResult extends ForecastApiResponse {
  predicted_demand?: number;
  adjusted_demand?: number;
  quantity_to_order?: number;
  remaining_days?: number;
  remaining_stock?: number;
  risk?: string;
  stockout_date?: string | null;
  stockout_date_p10?: string | null;
  stockout_date_p50?: string | null;
  stockout_date_p90?: string | null;
  order_date?: string | null;
  order_in_days?: number;
  forecast_date?: string | null;
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
  min_stock: number;
}

export type StockStatusLevel = "rupture" | "critique" | "a_commander" | "ok";

export interface StockStatusRow {
  warehouse: string;
  stock: number;
  min_stock: number;
  average_consumption: number;
  autonomy: number;
  stockout_date: string;
  stockout_date_p10?: string | null;
  stockout_date_p90?: string | null;
  delivery_time: number;
  order_in_days: number;
  quantity_to_order: number;
  status: StockStatusLevel;
  model_used?: string;
  mape?: number | null;
}

export interface ApiError {
  detail: string;
}
