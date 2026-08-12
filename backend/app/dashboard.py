import json
import os
from datetime import date, timedelta

import pandas as pd

from forecasting import ForecastingService


class DashboardService:

    def __init__(self):
        self.settings_file = "settings.json"
        if not os.path.exists(self.settings_file):
            with open(self.settings_file, "w") as f:
                json.dump({}, f)

    # -----------------------------------
    # SETTINGS
    # -----------------------------------

    def load_settings(self):
        with open(self.settings_file, "r") as f:
            return json.load(f)

    def save_settings(self, settings):
        with open(self.settings_file, "w") as f:
            json.dump(settings, f, indent=4)

    # -----------------------------------
    # STOCK UTILISATEUR
    # -----------------------------------

    def update_stock(self, warehouse, stock):
        settings = self.load_settings()
        if warehouse not in settings:
            settings[warehouse] = {}
        settings[warehouse]["stock"] = stock
        self.save_settings(settings)

    # -----------------------------------

    def update_delivery_time(self, warehouse, delay):
        settings = self.load_settings()
        if warehouse not in settings:
            settings[warehouse] = {}
        settings[warehouse]["delivery_time"] = delay
        self.save_settings(settings)

    # -----------------------------------

    def get_stock(self, warehouse):
        settings = self.load_settings()
        return settings.get(warehouse, {}).get("stock", 0)

    # -----------------------------------

    def get_delivery_time(self, warehouse):
        settings = self.load_settings()
        return settings.get(warehouse, {}).get("delivery_time", 0)

    # -----------------------------------
    # HISTORIQUE DES VENTES
    # -----------------------------------

    def sales_history(self, dataframe, warehouse):
        df = dataframe.copy()
        df = df[df["Entrepôt"] == warehouse]
        sales = (
            df.groupby("Date physique")["Quantité"]
            .sum()
            .reset_index()
        )
        return sales.to_dict(orient="records")

    # -----------------------------------
    # CONSOMMATION MOYENNE
    # -----------------------------------

    def average_consumption(self, dataframe, warehouse):
        df = dataframe.copy()
        df = df[df["Entrepôt"] == warehouse]

        if df.empty:
            return 0.0

        average = df["Quantité"].mean()

        if pd.isna(average):
            return 0.0

        return round(float(average), 2)

    # -----------------------------------
    # AUTONOMIE
    # -----------------------------------

    def autonomy(self, dataframe, warehouse):
        stock = float(self.get_stock(warehouse))
        average = self.average_consumption(dataframe, warehouse)

        if average <= 0:
            return 0.0

        return round(stock / average, 1)

    # -----------------------------------
    # DATE COMMANDE
    # -----------------------------------

    def reorder_days(self, dataframe, warehouse):
        autonomy = self.autonomy(dataframe, warehouse)
        delivery = self.get_delivery_time(warehouse)
        return max(autonomy - delivery, 0)

    # -----------------------------------
    # QUANTITE CONSEILLEE
    # -----------------------------------

    def quantity_to_order(self, dataframe, warehouse):
        stock = float(self.get_stock(warehouse))
        average = self.average_consumption(dataframe, warehouse)
        delivery = float(self.get_delivery_time(warehouse))

        if average <= 0:
            return 0.0

        target = average * (delivery + 30)
        quantity = target - stock

        return round(max(quantity, 0), 2)

    # -----------------------------------
    # RESUME DASHBOARD
    # -----------------------------------

    def dashboard_summary(self, dataframe, warehouse):
        return {
            "warehouse": warehouse,
            "stock": self.get_stock(warehouse),
            "average_consumption": self.average_consumption(dataframe, warehouse),
            "autonomy": self.autonomy(dataframe, warehouse),
            "delivery_time": self.get_delivery_time(warehouse),
            "order_in_days": self.reorder_days(dataframe, warehouse),
            "quantity_to_order": self.quantity_to_order(dataframe, warehouse)
        }

    # -----------------------------------
    # STATUT DE STOCK PAR ENTREPÔT
    # -----------------------------------

    def warehouse_list(self, dataframe):
        if "Entrepôt" not in dataframe.columns:
            return []

        return sorted(dataframe["Entrepôt"].dropna().unique().tolist())

    # -----------------------------------
    # STATUT DE STOCK PAR ENTREPÔT
    # -----------------------------------

    def stock_status_rows(self, dataframe):
        warehouses = dataframe["Entrepôt"].dropna().unique().tolist()

        rows = []
        for warehouse in sorted(warehouses):
            summary = self.dashboard_summary(
                dataframe,
                warehouse,
            )
            stock = summary["stock"]
            order_in_days = summary["order_in_days"]

            if stock <= 0:
                status = "rupture"
            elif order_in_days <= 0:
                status = "critique"
            elif order_in_days <= 30:
                status = "a_commander"
            else:
                status = "ok"

            summary["status"] = status
            rows.append(summary)

        return rows

    # -----------------------------------
    # SIMULATION D'APPROVISIONNEMENT
    # -----------------------------------

    def simulation(
        self,
        dataframe,
        warehouse=None,
        current_stock=None,
        lead_time=None,
        months=3,
    ):
        if not warehouse:
            return {
                "predicted_demand": 0,
                "adjusted_demand": 0,
                "quantity_to_order": 0,
                "remaining_stock": 0,
                "risk": "unknown",
                "forecast_date": None,
                "forecast": [],
            }

        if current_stock is not None:
            self.update_stock(warehouse, current_stock)

        if lead_time is not None:
            self.update_delivery_time(warehouse, lead_time)

        stock = float(
            current_stock
            if current_stock is not None
            else self.get_stock(warehouse)
        )

        delivery = int(
            lead_time
            if lead_time is not None
            else self.get_delivery_time(warehouse)
        )

        forecast_service = ForecastingService()
        filtered_data = dataframe
        if "Entrepôt" in dataframe.columns and warehouse:
            filtered_data = dataframe[dataframe["Entrepôt"] == warehouse]

        try:
            prophet_response = forecast_service.forecast(
                dataframe=filtered_data,
                months=months,
            )
        except Exception as exc:
            return {
                "predicted_demand": 0,
                "adjusted_demand": 0,
                "quantity_to_order": 0,
                "remaining_stock": 0,
                "risk": "unknown",
                "forecast_date": None,
                "forecast": [],
                "error": str(exc),
            }

        forecast_points = prophet_response.get("forecast", [])
        # Prévision moyenne
        predicted = round(
            sum(point.get("prediction", 0) for point in forecast_points),
            2,
        )

        # Prévision pessimiste (borne supérieure)
        upper_demand = round(
            sum(point.get("upper", point.get("prediction", 0))
                for point in forecast_points),
            2,
        )

        # Prévision optimiste (borne inférieure)
        lower_demand = round(
            sum(point.get("lower", point.get("prediction", 0))
                for point in forecast_points),
            2,
        )

        # Incertitude globale de Prophet
        uncertainty = upper_demand - predicted

        # Demande ajustée
        adjusted = upper_demand

        days_of_forecast = max(months * 30, 1)
        daily_forecast = adjusted / days_of_forecast
        safety_stock = round(daily_forecast * delivery, 2)
        target = round(predicted + safety_stock, 2)
        qty = round(max(target - stock, 0), 2)

        if daily_forecast > 0:
            remaining_days = int(stock / daily_forecast)
        else:
            remaining_days = 0

        confidence = 100

        if predicted > 0:
            confidence = max(
                0,
                round(
                    100 - (uncertainty / predicted) * 100,
                    1,
                ),
            )

        if remaining_days <= delivery or confidence < 60:
            risk = "high"
        elif remaining_days <= delivery + 15 or confidence < 80:
            risk = "medium"
        else:
            risk = "low"
        forecast_date = (
            date.today() + timedelta(days=remaining_days)
        ).isoformat()

        return {
            "predicted_demand": int(predicted),
            "adjusted_demand": int(adjusted),
            "quantity_to_order": int(qty),
            "remaining_stock": int(remaining_days),
            "risk": risk,
            "forecast_date": forecast_date,
            "lower_demand": int(lower_demand),
            "upper_demand": int(upper_demand),
            "forecast_uncertainty": round(uncertainty, 2),
            "confidence": confidence,
        }
