import json
import os

import pandas as pd

from prophet import Prophet

from data_store import BACKEND_DIR, DataStore

MIN_RELIABLE_MONTHS = 6
MIN_MONTHS_PROPHET = 8
MIN_MONTHS_YEARLY = 24
MAPE_REJECT = 30.0

HYPERPARAMETERS_PATH = os.path.join(BACKEND_DIR, "model_hyperparameters.json")
DEFAULT_CHANGEPOINT_PRIOR_SCALE = 0.05
DEFAULT_SEASONALITY_PRIOR_SCALE = 10.0

# Dépôts trop courts : on reprend le profil saisonnier du dépôt lié, calé sur le niveau local.
POOL_PARTNERS = {
    "DP1608": "DP1602",
}


class ForecastingService:
    def __init__(self):
        self.store = DataStore()

    def prepare_data(self, dataframe, drop_incomplete=True):
        df = dataframe.copy()
        df["Date physique"] = pd.to_datetime(df["Date physique"], errors="coerce")
        df = df.dropna(subset=["Date physique"])

        dropped = None
        if drop_incomplete:
            df, dropped = self.store.drop_incomplete_last_month(df)

        df = (
            df.groupby(pd.Grouper(key="Date physique", freq="MS"))["Quantité"]
            .sum()
            .reset_index()
        )
        df.columns = ["ds", "y"]
        df = df.sort_values("ds").reset_index(drop=True)
        return df, dropped

    def _hyperparameters_for(self, warehouse):
        defaults = {
            "changepoint_prior_scale": DEFAULT_CHANGEPOINT_PRIOR_SCALE,
            "seasonality_prior_scale": DEFAULT_SEASONALITY_PRIOR_SCALE,
            "seasonality_mode": "additive",
        }
        if not os.path.exists(HYPERPARAMETERS_PATH):
            return defaults

        with open(HYPERPARAMETERS_PATH, "r", encoding="utf-8") as f:
            all_params = json.load(f)

        params = all_params.get(warehouse) or {}
        return {**defaults, **params}

    def _build_model(self, n_obs, params):
        yearly = 3 if n_obs >= MIN_MONTHS_YEARLY else False
        n_changepoints = min(5, max(0, n_obs // 6))
        return Prophet(
            yearly_seasonality=yearly,
            weekly_seasonality=False,
            daily_seasonality=False,
            changepoint_prior_scale=params["changepoint_prior_scale"],
            seasonality_prior_scale=params["seasonality_prior_scale"],
            seasonality_mode=params.get("seasonality_mode", "additive"),
            n_changepoints=n_changepoints,
            changepoint_range=0.8,
        )

    def _clip_prediction(self, prediction):
        clipped = prediction.copy()
        for col in ("yhat", "yhat_lower", "yhat_upper"):
            if col in clipped.columns:
                clipped[col] = clipped[col].clip(lower=0)
        if "yhat_lower" in clipped.columns and "yhat_upper" in clipped.columns:
            clipped["yhat_lower"] = clipped[["yhat_lower", "yhat"]].min(axis=1)
            clipped["yhat_upper"] = clipped[["yhat_upper", "yhat"]].max(axis=1)
        return clipped

    def _accuracy_from_predictions(self, y_true, y_pred):
        y_true = pd.Series(y_true).reset_index(drop=True).astype(float)
        y_pred = pd.Series(y_pred).reset_index(drop=True).astype(float)
        mae = abs(y_true - y_pred).mean()
        rmse = ((y_true - y_pred) ** 2).mean() ** 0.5
        nonzero = y_true != 0
        mape = None
        if nonzero.any():
            mape = round(
                float((abs(y_true[nonzero] - y_pred[nonzero]) / y_true[nonzero]).mean() * 100),
                1,
            )
        return {
            "MAE": round(float(mae), 2) if pd.notna(mae) else None,
            "RMSE": round(float(rmse), 2) if pd.notna(rmse) else None,
            "mape": mape,
        }

    def _baseline_forecast(self, history, future_ds, kind):
        if history.empty:
            return [0.0] * len(future_ds)
        last = float(history["y"].iloc[-1])
        mean = float(history["y"].mean())
        values = []
        for ds in future_ds:
            if kind == "naive":
                values.append(max(last, 0.0))
            elif kind == "mean":
                values.append(max(mean, 0.0))
            else:
                prev = history[history["ds"] == (pd.Timestamp(ds) - pd.DateOffset(years=1))]
                values.append(max(float(prev["y"].iloc[0]) if len(prev) else last, 0.0))
        return values

    def _evaluate_candidates(self, prophet_df, warehouse):
        n = len(prophet_df)
        if n < 3:
            return None

        horizon = min(3, max(1, n // 5))
        split = n - horizon
        if split < 2:
            return None

        train = prophet_df.iloc[:split]
        test = prophet_df.iloc[split:]
        y_true = test["y"]

        candidates = {}
        for kind in ("naive", "mean", "seasonal_naive"):
            yhat = self._baseline_forecast(train, test["ds"], kind)
            metrics = self._accuracy_from_predictions(y_true, yhat)
            candidates[kind] = {"metrics": metrics, "kind": kind}

        prophet_metrics = None
        if n >= MIN_MONTHS_PROPHET:
            try:
                params = self._hyperparameters_for(warehouse)
                model = self._build_model(len(train), params)
                model.fit(train)
                prediction = self._clip_prediction(model.predict(test[["ds"]]))
                prophet_metrics = self._accuracy_from_predictions(y_true, prediction["yhat"])
                candidates["prophet"] = {"metrics": prophet_metrics, "kind": "prophet"}
            except Exception:
                prophet_metrics = None

        def sort_key(item):
            mae = item[1]["metrics"]["MAE"]
            return mae if mae is not None else float("inf")

        winner_name, winner = min(candidates.items(), key=sort_key)
        prophet_mape = (prophet_metrics or {}).get("mape")
        if (
            winner_name == "prophet"
            and prophet_mape is not None
            and prophet_mape > MAPE_REJECT
            and len(candidates) > 1
        ):
            rest = {k: v for k, v in candidates.items() if k != "prophet"}
            winner_name, winner = min(rest.items(), key=sort_key)

        return {
            "model_used": winner_name,
            "metrics": winner["metrics"],
            "prophet_metrics": prophet_metrics,
            "baseline_metrics": {
                k: v["metrics"] for k, v in candidates.items() if k != "prophet"
            },
        }

    def _fit_prophet(self, prophet_df, warehouse):
        params = self._hyperparameters_for(warehouse)
        model = self._build_model(len(prophet_df), params)
        model.fit(prophet_df)
        return model

    def _future_from_baseline(self, history, months, kind):
        last = history["ds"].max()
        future_ds = pd.date_range(last + pd.offsets.MonthBegin(1), periods=months, freq="MS")
        values = self._baseline_forecast(history, future_ds, kind)
        rows = []
        for ds, value in zip(future_ds, values):
            rows.append(
                {
                    "date": ds.strftime("%Y-%m-%d"),
                    "prediction": round(float(value), 2),
                    "lower": round(float(value) * 0.8, 2),
                    "upper": round(float(value) * 1.2, 2),
                }
            )
        return rows

    def _history_json(self, history):
        return [
            {
                "date": row["ds"].strftime("%Y-%m-%d"),
                "quantity": round(float(row["y"]), 2),
            }
            for _, row in history.iterrows()
        ]

    def _prophet_forecast_points(self, model, history, months, last_ds=None):
        origin = pd.Timestamp(last_ds if last_ds is not None else history["ds"].max())
        future_ds = pd.date_range(origin + pd.offsets.MonthBegin(1), periods=months, freq="MS")
        prediction = self._clip_prediction(model.predict(pd.DataFrame({"ds": future_ds})))
        return [
            {
                "date": row["ds"].strftime("%Y-%m-%d"),
                "prediction": round(float(row["yhat"]), 2),
                "lower": round(float(row["yhat_lower"]), 2),
                "upper": round(float(row["yhat_upper"]), 2),
            }
            for _, row in prediction.iterrows()
        ]

    def forecast(self, dataframe, months=3, warehouse=None):
        months = max(int(months), 1)
        full = dataframe.copy()
        subset = full
        if warehouse and "Entrepôt" in full.columns:
            subset = full[full["Entrepôt"] == warehouse]

        history, dropped = self.prepare_data(subset, drop_incomplete=True)
        evaluation = self._evaluate_candidates(history, warehouse)
        model_used = evaluation["model_used"] if evaluation else "mean"
        if evaluation is None and len(history) < 2:
            model_used = "mean"

        pooled = False
        partner = POOL_PARTNERS.get(warehouse)
        if (
            model_used != "prophet"
            and partner
            and "Entrepôt" in full.columns
            and len(history) < MIN_MONTHS_PROPHET
        ):
            partner_history, _ = self.prepare_data(
                full[full["Entrepôt"] == partner],
                drop_incomplete=True,
            )
            if len(partner_history) >= MIN_MONTHS_PROPHET:
                scale = (
                    float(history["y"].mean() / partner_history["y"].mean())
                    if len(history) and partner_history["y"].mean()
                    else 1.0
                )
                model = self._fit_prophet(partner_history, partner)
                points = self._prophet_forecast_points(
                    model, partner_history, months, last_ds=history["ds"].max()
                )
                for point in points:
                    point["prediction"] = round(point["prediction"] * scale, 2)
                    point["lower"] = round(point["lower"] * scale, 2)
                    point["upper"] = round(point["upper"] * scale, 2)
                model_used = "pooled_prophet"
                pooled = True
                forecast_points = points
            else:
                forecast_points = None
        else:
            forecast_points = None

        if forecast_points is None:
            if model_used == "prophet" and len(history) >= MIN_MONTHS_PROPHET:
                model = self._fit_prophet(history, warehouse)
                forecast_points = self._prophet_forecast_points(model, history, months)
            else:
                if model_used == "prophet":
                    model_used = "seasonal_naive"
                forecast_points = self._future_from_baseline(
                    history,
                    months,
                    model_used if model_used in {"naive", "mean", "seasonal_naive"} else "mean",
                )

        metrics = (evaluation or {}).get("metrics") or {"MAE": None, "RMSE": None, "mape": None}
        if pooled or len(history) < MIN_RELIABLE_MONTHS:
            metrics = {
                "MAE": metrics.get("MAE"),
                "RMSE": metrics.get("RMSE"),
                "mape": None,
            }
        last_date = history["ds"].max() if len(history) else None
        days_since = (
            int((pd.Timestamp.today().normalize() - last_date).days) if last_date is not None else None
        )

        return {
            "history": self._history_json(history),
            "forecast": forecast_points,
            "MAE": metrics.get("MAE"),
            "RMSE": metrics.get("RMSE"),
            "mape": metrics.get("mape"),
            "model_used": model_used,
            "pooled": pooled,
            "prophet_metrics": (evaluation or {}).get("prophet_metrics"),
            "baseline_metrics": (evaluation or {}).get("baseline_metrics"),
            "days_since_last_data": days_since,
            "history_months": len(history),
            "low_data_warning": len(history) < MIN_RELIABLE_MONTHS,
            "incomplete_month_dropped": dropped.strftime("%Y-%m-%d") if dropped is not None else None,
        }

    def evaluate(self, dataframe, warehouse=None):
        subset = dataframe
        if warehouse and "Entrepôt" in dataframe.columns:
            subset = dataframe[dataframe["Entrepôt"] == warehouse]
        history, _ = self.prepare_data(subset, drop_incomplete=True)
        evaluation = self._evaluate_candidates(history, warehouse)
        if evaluation is None:
            return {"MAE": None, "RMSE": None, "mape": None, "model_used": None}
        return {
            **evaluation["metrics"],
            "model_used": evaluation["model_used"],
            "prophet_metrics": evaluation.get("prophet_metrics"),
            "baseline_metrics": evaluation.get("baseline_metrics"),
        }
