import pandas as pd

from prophet import Prophet

CHANGEPOINT_SCALE_CANDIDATES = [0.05, 0.1, 0.2]
MIN_RELIABLE_MONTHS = 6


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

        return df

    # -----------------------------------------------------
    # Construction d'un modèle Prophet
    # -----------------------------------------------------

    def _build_model(self, changepoint_prior_scale):
        return Prophet(
            yearly_seasonality="auto",
            weekly_seasonality=False,
            daily_seasonality=False,
            changepoint_prior_scale=changepoint_prior_scale,
            seasonality_prior_scale=10,
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
    # Sélection du meilleur modèle par backtest, puis
    # ré-entrainement de la config gagnante sur tout
    # l'historique pour la prévision finale
    # -----------------------------------------------------

    def _select_best_model(self, dataframe):
        prophet_df = self.prepare_data(dataframe)

        split = int(len(prophet_df) * 0.8)
        train = prophet_df.iloc[:split]
        test = prophet_df.iloc[split:]

        if len(train) < 2 or len(test) == 0:
            model = self._build_model(CHANGEPOINT_SCALE_CANDIDATES[0])
            model.fit(prophet_df)
            return model, None

        best = None
        for scale in CHANGEPOINT_SCALE_CANDIDATES:
            candidate = self._build_model(scale)
            candidate.fit(train)

            prediction = candidate.predict(test[["ds"]])
            y_true = test["y"]
            y_pred = prediction["yhat"]
            rmse = float(((y_true - y_pred) ** 2).mean() ** 0.5)

            if best is None or rmse < best["rmse"]:
                best = {
                    "scale": scale,
                    "rmse": rmse,
                    "y_true": y_true,
                    "y_pred": y_pred,
                }

        accuracy = self._accuracy_from_predictions(best["y_true"], best["y_pred"])

        final_model = self._build_model(best["scale"])
        final_model.fit(prophet_df)

        return final_model, accuracy

    # -----------------------------------------------------
    # Prévision
    # -----------------------------------------------------

    def forecast(self, dataframe, months=3):
        model, accuracy = self._select_best_model(dataframe)

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

    def evaluate(self, dataframe):
        _, accuracy = self._select_best_model(dataframe)

        if accuracy is None:
            return {"MAE": None, "RMSE": None, "credibility_rate": None}

        return accuracy
