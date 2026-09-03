import json
import os
from datetime import date

import pandas as pd

from data_store import APP_DIR, BACKEND_DIR, DataStore
from forecasting import ForecastingService
from inventory import simulate_inventory


class DashboardService:
    def __init__(self):
        self.settings_file = os.path.join(BACKEND_DIR, "settings.json")
        self.legacy_settings_file = os.path.join(APP_DIR, "settings.json")
        self.store = DataStore()
        if not os.path.exists(self.settings_file):
            with open(self.settings_file, "w") as f:
                json.dump({}, f)
        self._merge_legacy_settings()

    def _merge_legacy_settings(self):
        settings = self.load_settings()
        if os.path.exists(self.legacy_settings_file):
            with open(self.legacy_settings_file, "r") as f:
                legacy = json.load(f)
            changed = False
            for warehouse, values in legacy.items():
                if warehouse not in settings:
                    settings[warehouse] = values
                    changed = True
                else:
                    for key, value in values.items():
                        if key not in settings[warehouse]:
                            settings[warehouse][key] = value
                            changed = True
        for warehouse, values in list(settings.items()):
            if values.get("delivery_time") in (None, ""):
                values["delivery_time"] = 7
                changed = True
        if changed:
            self.save_settings(settings)

    def load_settings(self):
        with open(self.settings_file, "r") as f:
            return json.load(f)

    def save_settings(self, settings):
        with open(self.settings_file, "w") as f:
            json.dump(settings, f, indent=4)

    def _update_field(self, warehouse, field, value):
        settings = self.load_settings()
        if warehouse not in settings:
            settings[warehouse] = {}
        settings[warehouse][field] = value
        self.save_settings(settings)

    def update_stock(self, warehouse, stock):
        self._update_field(warehouse, "stock", stock)

    def update_delivery_time(self, warehouse, delay):
        self._update_field(warehouse, "delivery_time", delay)

    def update_min_stock(self, warehouse, min_stock):
        self._update_field(warehouse, "min_stock", min_stock)

    def reconstructed_stocks(self):
        movements = self.store.load_movements()
        if movements is None:
            return {}
        return self.store.reconstruct_stock(movements)

    def get_stock(self, warehouse):
        settings = self.load_settings()
        if warehouse in settings and "stock" in settings[warehouse]:
            return settings[warehouse]["stock"]
        reconstructed = self.reconstructed_stocks()
        return reconstructed.get(warehouse, 0)

    def get_delivery_time(self, warehouse):
        settings = self.load_settings()
        value = settings.get(warehouse, {}).get("delivery_time")
        if value in (None, ""):
            return 7
        return value

    def get_min_stock(self, warehouse):
        settings = self.load_settings()
        return settings.get(warehouse, {}).get("min_stock", 0)

    def sales_history(self, dataframe, warehouse=None):
        df = dataframe.copy()
        if warehouse:
            df = df[df["Entrepôt"] == warehouse]

        cutoff = self.store.incomplete_month_start(df)
        sales = (
            df.groupby(pd.Grouper(key="Date physique", freq="MS"))["Quantité"]
            .sum()
            .reset_index()
        )
        rows = []
        for _, row in sales.iterrows():
            month_start = pd.Timestamp(row["Date physique"]).normalize()
            incomplete = cutoff is not None and month_start >= cutoff
            rows.append(
                {
                    "date": month_start.strftime("%Y-%m-%d"),
                    "quantity": round(float(row["Quantité"]), 2),
                    "incomplete": bool(incomplete),
                }
            )
        return rows

    def average_consumption(self, dataframe, warehouse):
        df = dataframe.copy()
        df = df[df["Entrepôt"] == warehouse]
        df, _ = self.store.drop_incomplete_last_month(df)
        if df.empty:
            return 0.0
        span_days = (df["Date physique"].max() - df["Date physique"].min()).days + 1
        if span_days <= 0:
            return 0.0
        average = df["Quantité"].sum() / span_days
        if pd.isna(average):
            return 0.0
        return round(float(average), 2)

    def warehouse_list(self, dataframe):
        if "Entrepôt" not in dataframe.columns:
            return []
        return sorted(dataframe["Entrepôt"].dropna().unique().tolist())

    def _inventory_for_warehouse(self, dataframe, warehouse, months=3):
        forecast_service = ForecastingService()
        prophet_response = forecast_service.forecast(
            dataframe=dataframe,
            months=months,
            warehouse=warehouse,
        )
        inventory = simulate_inventory(
            forecast_points=prophet_response.get("forecast", []),
            current_stock=self.get_stock(warehouse),
            min_stock=self.get_min_stock(warehouse),
            lead_time=self.get_delivery_time(warehouse),
            reference_date=date.today(),
            months=months,
        )
        return prophet_response, inventory

    def dashboard_summary(self, dataframe, warehouse, months=3):
        if not warehouse:
            raise ValueError("Un entrepôt est requis.")
        prophet_response, inventory = self._inventory_for_warehouse(
            dataframe, warehouse, months=months
        )
        autonomy = inventory["remaining_days"]
        return {
            "warehouse": warehouse,
            "stock": self.get_stock(warehouse),
            "min_stock": self.get_min_stock(warehouse),
            "average_consumption": self.average_consumption(dataframe, warehouse),
            "autonomy": autonomy,
            "stockout_date": inventory["stockout_date"],
            "stockout_date_p10": inventory["stockout_date_p10"],
            "stockout_date_p90": inventory["stockout_date_p90"],
            "delivery_time": self.get_delivery_time(warehouse),
            "order_in_days": inventory["order_in_days"],
            "quantity_to_order": inventory["quantity_to_order"],
            "model_used": prophet_response.get("model_used"),
            "mape": prophet_response.get("mape"),
        }

    def stock_status_rows(self, dataframe, warehouse=None):
        warehouses = self.warehouse_list(dataframe)
        if warehouse:
            warehouses = [item for item in warehouses if item == warehouse]

        rows = []
        for item in warehouses:
            summary = self.dashboard_summary(dataframe, item)
            stock = summary["stock"]
            order_in_days = summary["order_in_days"]
            delivery = summary["delivery_time"] or 0

            if stock <= 0:
                status = "rupture"
            elif order_in_days <= 0:
                status = "critique"
            elif order_in_days <= max(delivery, 30):
                status = "a_commander"
            else:
                status = "ok"

            summary["status"] = status
            rows.append(summary)
        return rows

    def simulation(
        self,
        dataframe,
        warehouse=None,
        current_stock=None,
        lead_time=None,
        min_stock=None,
        reference_date=None,
        months=3,
        persist_settings=False,
    ):
        if not warehouse:
            raise ValueError("Veuillez sélectionner un entrepôt.")

        if persist_settings:
            if current_stock is not None:
                self.update_stock(warehouse, current_stock)
            if lead_time is not None:
                self.update_delivery_time(warehouse, lead_time)
            if min_stock is not None:
                self.update_min_stock(warehouse, min_stock)

        stock = float(
            current_stock if current_stock is not None else self.get_stock(warehouse)
        )
        delivery = int(
            lead_time if lead_time is not None else self.get_delivery_time(warehouse)
        )
        min_stock_value = float(
            min_stock if min_stock is not None else self.get_min_stock(warehouse)
        )

        forecast_service = ForecastingService()
        prophet_response = forecast_service.forecast(
            dataframe=dataframe,
            months=months,
            warehouse=warehouse,
        )
        inventory = simulate_inventory(
            forecast_points=prophet_response.get("forecast", []),
            current_stock=stock,
            min_stock=min_stock_value,
            lead_time=delivery,
            reference_date=reference_date or date.today().isoformat(),
            months=months,
        )

        return {
            **inventory,
            "forecast": prophet_response.get("forecast", []),
            "history": prophet_response.get("history", []),
            "MAE": prophet_response.get("MAE"),
            "RMSE": prophet_response.get("RMSE"),
            "mape": prophet_response.get("mape"),
            "model_used": prophet_response.get("model_used"),
            "days_since_last_data": prophet_response.get("days_since_last_data"),
            "history_months": prophet_response.get("history_months"),
            "low_data_warning": prophet_response.get("low_data_warning"),
            "incomplete_month_dropped": prophet_response.get("incomplete_month_dropped"),
            "remaining_stock": inventory["remaining_days"],
            "forecast_date": inventory["order_date"],
        }
