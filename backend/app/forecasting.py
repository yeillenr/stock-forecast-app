import os
import joblib
import pandas as pd

from prophet import Prophet
from sklearn.metrics import r2_score


class ForecastingService:

    def __init__(self):
        self.model_path = "models/prophet_model.pkl"
        os.makedirs("models", exist_ok=True)

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

        return df

    # -----------------------------------------------------
    # Entrainement
    # -----------------------------------------------------

    def train_model(self, dataframe):
        prophet_df = self.prepare_data(dataframe)

        split = int(len(prophet_df) * 0.8)

        train = prophet_df.iloc[:split]
        test = prophet_df.iloc[split:]

        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=0.2,
            seasonality_prior_scale=10
        )

        model.fit(train)

        joblib.dump(model, self.model_path)

        return True

    # -----------------------------------------------------
    # Chargement
    # -----------------------------------------------------

    def load_model(self):
        if not os.path.exists(self.model_path):
            raise Exception(
                "Le modèle n'a pas encore été entraîné."
            )

        return joblib.load(self.model_path)

    # -----------------------------------------------------
    # Prévision
    # -----------------------------------------------------

    def forecast(self, dataframe, months=3):
        model = self.load_model()

        history = self.prepare_data(dataframe)

        future = model.make_future_dataframe(
            periods=months,
            freq="MS"
        )

        prediction = model.predict(future)

        return self.format_response(history, prediction, months)

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

    def evaluate(self, dataframe):
        model = self.load_model()

        prophet_df = self.prepare_data(dataframe)

        prediction = model.predict(
            prophet_df[["ds"]]
        )

        y_true = prophet_df["y"]
        y_pred = prediction["yhat"]

        mae = abs(y_true - y_pred).mean()

        rmse = ((y_true - y_pred) ** 2).mean() ** 0.5

        r2 = r2_score(y_true, y_pred)

        return {
            "MAE": round(float(mae), 2),
            "RMSE": round(float(rmse), 2),
            "R2": round(float(r2), 4)
        }
