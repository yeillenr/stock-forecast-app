import json
import os

import pandas as pd

from prophet import Prophet

MIN_RELIABLE_MONTHS = 6

HYPERPARAMETERS_PATH = "model_hyperparameters.json"
DEFAULT_CHANGEPOINT_PRIOR_SCALE = 0.05
DEFAULT_SEASONALITY_PRIOR_SCALE = 10.0


class ForecastingService:

    # -----------------------------------------------------
    # Préparation des données
    # -----------------------------------------------------

    def prepare_data(self, dataframe):
        df = dataframe.copy()

        df["Date physique"] = pd.to_datetime(
            df["Date physique"],
            errors="coerce"
        )

        df = df.dropna(subset=["Date physique"])

        df = (
            df.groupby(
                pd.Grouper(
                    key="Date physique",
                    freq="MS"
                )
            )["Quantité"]
            .sum()
            .reset_index()
        )

        df.columns = ["ds", "y"]

        # Le split train/test doit être chronologique, pas aléatoire :
        # on garantit explicitement l'ordre plutôt que de compter sur
        # le comportement implicite de groupby/Grouper.
        df = df.sort_values("ds").reset_index(drop=True)

        return df

    # -----------------------------------------------------
    # Construction d'un modèle Prophet
    # -----------------------------------------------------

    def _build_model(self, changepoint_prior_scale, seasonality_prior_scale):
        return Prophet(
            yearly_seasonality="auto",
            weekly_seasonality=False,
            daily_seasonality=False,
            changepoint_prior_scale=changepoint_prior_scale,
            seasonality_prior_scale=seasonality_prior_scale,
        )

    # -----------------------------------------------------
    # Hyperparamètres par entrepôt, choisis hors-ligne par
    # validation croisée (voir analysis/select_hyperparameters.py)
    # -----------------------------------------------------

    def _hyperparameters_for(self, warehouse):
        if not os.path.exists(HYPERPARAMETERS_PATH):
            return DEFAULT_CHANGEPOINT_PRIOR_SCALE, DEFAULT_SEASONALITY_PRIOR_SCALE

        with open(HYPERPARAMETERS_PATH, "r", encoding="utf-8") as f:
            all_params = json.load(f)

        params = all_params.get(warehouse)
        if not params:
            return DEFAULT_CHANGEPOINT_PRIOR_SCALE, DEFAULT_SEASONALITY_PRIOR_SCALE

        return (
            params.get("changepoint_prior_scale", DEFAULT_CHANGEPOINT_PRIOR_SCALE),
            params.get("seasonality_prior_scale", DEFAULT_SEASONALITY_PRIOR_SCALE),
        )

    # -----------------------------------------------------
    # Précision (MAE / RMSE / crédibilité) à partir de
    # prédictions déjà calculées
    # -----------------------------------------------------

    def _accuracy_from_predictions(self, y_true, y_pred):
        y_true = y_true.reset_index(drop=True)
        y_pred = y_pred.reset_index(drop=True)

        mae = abs(y_true - y_pred).mean()
        rmse = ((y_true - y_pred) ** 2).mean() ** 0.5

        nonzero = y_true != 0
        if nonzero.any():
            mape = (abs(y_true[nonzero] - y_pred[nonzero]) / y_true[nonzero]).mean() * 100
            credibility_rate = round(max(0.0, 100 - float(mape)), 1)
        else:
            credibility_rate = None

        return {
            "MAE": round(float(mae), 2),
            "RMSE": round(float(rmse), 2),
            "credibility_rate": credibility_rate,
        }

    # -----------------------------------------------------
    # Entrainement avec les hyperparamètres fixés pour cet
    # entrepôt (choisis hors-ligne), puis évaluation sur un
    # split chronologique avant le ré-entrainement final sur
    # tout l'historique
    # -----------------------------------------------------

    def _fit_and_evaluate(self, dataframe, warehouse):
        prophet_df = self.prepare_data(dataframe)
        changepoint_scale, seasonality_scale = self._hyperparameters_for(warehouse)

        split = int(len(prophet_df) * 0.8)
        train = prophet_df.iloc[:split]
        test = prophet_df.iloc[split:]

        if len(train) < 2 or len(test) == 0:
            model = self._build_model(changepoint_scale, seasonality_scale)
            model.fit(prophet_df)
            return model, None

        eval_model = self._build_model(changepoint_scale, seasonality_scale)
        eval_model.fit(train)

        prediction = eval_model.predict(test[["ds"]])
        accuracy = self._accuracy_from_predictions(test["y"], prediction["yhat"])

        final_model = self._build_model(changepoint_scale, seasonality_scale)
        final_model.fit(prophet_df)

        return final_model, accuracy

    # -----------------------------------------------------
    # Prévision
    # -----------------------------------------------------

    def forecast(self, dataframe, months=3, warehouse=None):
        model, accuracy = self._fit_and_evaluate(dataframe, warehouse)

        history = self.prepare_data(dataframe)

        future = model.make_future_dataframe(
            periods=months,
            freq="MS"
        )

        prediction = model.predict(future)

        response = self.format_response(history, prediction, months)

        if accuracy is None:
            in_sample = model.predict(history[["ds"]])
            accuracy = self._accuracy_from_predictions(history["y"], in_sample["yhat"])

        response.update(accuracy)

        last_date = history["ds"].max()
        days_since_last_data = (pd.Timestamp.today().normalize() - last_date).days
        response["days_since_last_data"] = int(days_since_last_data)

        response["history_months"] = len(history)
        response["low_data_warning"] = len(history) < MIN_RELIABLE_MONTHS

        return response

    # -----------------------------------------------------
    # Format JSON
    # -----------------------------------------------------

    def format_response(self, history, prediction, months):
        history_json = []
        for _, row in history.iterrows():
            history_json.append({
                "date": row["ds"].strftime("%Y-%m-%d"),
                "quantity": round(float(row["y"]), 2)
            })

        forecast = prediction.tail(months)

        forecast_json = []
        for _, row in forecast.iterrows():
            forecast_json.append({
                "date": row["ds"].strftime("%Y-%m-%d"),
                "prediction": round(float(row["yhat"]), 2),
                "lower": round(float(row["yhat_lower"]), 2),
                "upper": round(float(row["yhat_upper"]), 2)
            })

        return {
            "history": history_json,
            "forecast": forecast_json
        }

    # -----------------------------------------------------
    # Evaluation
    # -----------------------------------------------------

    def evaluate(self, dataframe, warehouse=None):
        _, accuracy = self._fit_and_evaluate(dataframe, warehouse)

        if accuracy is None:
            return {"MAE": None, "RMSE": None, "credibility_rate": None}

        return accuracy
