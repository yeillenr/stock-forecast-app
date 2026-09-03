"""
Sélection hors-ligne des hyperparamètres Prophet par validation
croissante mensuelle (pas de buckets journaliers).

À exécuter depuis backend/ :
    python analysis/select_hyperparameters.py
"""

import itertools
import json
import sys

sys.path.insert(0, "app")

from prophet import Prophet

from data_store import DataStore
from forecasting import (
    DEFAULT_CHANGEPOINT_PRIOR_SCALE,
    DEFAULT_SEASONALITY_PRIOR_SCALE,
    MAPE_REJECT,
    MIN_MONTHS_YEARLY,
    ForecastingService,
)

CHANGEPOINT_CANDIDATES = [0.05, 0.1, 0.2]
SEASONALITY_CANDIDATES = [1, 10]
SEASONALITY_MODES = ["additive", "multiplicative"]
HORIZON_MONTHS = 3
MIN_TRAIN_MONTHS = 12
MIN_MONTHS_FOR_CV = 16
OUTPUT_PATH = "model_hyperparameters.json"


def build_model(n_obs, changepoint_prior_scale, seasonality_prior_scale, seasonality_mode):
    yearly = 3 if n_obs >= MIN_MONTHS_YEARLY else False
    return Prophet(
        yearly_seasonality=yearly,
        weekly_seasonality=False,
        daily_seasonality=False,
        changepoint_prior_scale=changepoint_prior_scale,
        seasonality_prior_scale=seasonality_prior_scale,
        seasonality_mode=seasonality_mode,
        n_changepoints=min(5, max(0, n_obs // 6)),
        changepoint_range=0.8,
    )


def clip(prediction):
    for col in ("yhat", "yhat_lower", "yhat_upper"):
        if col in prediction.columns:
            prediction[col] = prediction[col].clip(lower=0)
    return prediction


def monthly_cv(prophet_df, changepoint, seasonality, mode):
    errors = []
    for cutoff in range(MIN_TRAIN_MONTHS, len(prophet_df) - HORIZON_MONTHS + 1):
        train = prophet_df.iloc[:cutoff]
        test = prophet_df.iloc[cutoff : cutoff + HORIZON_MONTHS]
        model = build_model(len(train), changepoint, seasonality, mode)
        model.fit(train)
        future = test[["ds"]]
        prediction = clip(model.predict(future))
        y_true = test["y"].reset_index(drop=True)
        y_hat = prediction["yhat"].reset_index(drop=True)
        mae = float(abs(y_true - y_hat).mean())
        mape = float((abs(y_true - y_hat) / y_true.replace(0, float("nan"))).mean() * 100)
        errors.append({"mae": mae, "mape": mape, "horizon": HORIZON_MONTHS})
    if not errors:
        raise ValueError("pas assez de fenêtres de CV")
    mape_values = [e["mape"] for e in errors if e["mape"] == e["mape"]]
    return {
        "mae": sum(e["mae"] for e in errors) / len(errors),
        "mape": sum(mape_values) / len(mape_values) if mape_values else None,
        "windows": len(errors),
    }


def select_for_warehouse(prophet_df):
    best = None
    results = []
    for changepoint, seasonality, mode in itertools.product(
        CHANGEPOINT_CANDIDATES, SEASONALITY_CANDIDATES, SEASONALITY_MODES
    ):
        try:
            metrics = monthly_cv(prophet_df, changepoint, seasonality, mode)
        except Exception as exc:
            print(f"    échec cp={changepoint} sp={seasonality} mode={mode} : {exc}")
            continue
        result = {
            "changepoint_prior_scale": changepoint,
            "seasonality_prior_scale": seasonality,
            "seasonality_mode": mode,
            **metrics,
        }
        results.append(result)
        if best is None or result["mae"] < best["mae"]:
            best = result
    if best and best.get("mape") is not None and best["mape"] > MAPE_REJECT:
        print(
            f"  meilleure config MAPE={best['mape']:.1f} % > {MAPE_REJECT} % : "
            "Prophet sera recalé derrière une baseline en production."
        )
    return best, results


def main():
    store = DataStore()
    data = store.load_cleaned_data()
    forecasting = ForecastingService()
    warehouses = sorted(data["Entrepôt"].dropna().unique().tolist())
    all_results = {}

    for warehouse in warehouses:
        print(f"\n=== {warehouse} ===")
        subset = data[data["Entrepôt"] == warehouse]
        prophet_df, dropped = forecasting.prepare_data(subset, drop_incomplete=True)
        print(f"  mois complets={len(prophet_df)} mois incomplet écarté={dropped}")

        if len(prophet_df) < MIN_MONTHS_FOR_CV:
            print("  Historique trop court pour la CV mensuelle -> défauts Prophet.")
            all_results[warehouse] = {
                "changepoint_prior_scale": DEFAULT_CHANGEPOINT_PRIOR_SCALE,
                "seasonality_prior_scale": DEFAULT_SEASONALITY_PRIOR_SCALE,
                "cv_skipped": True,
                "history_months": len(prophet_df),
            }
            continue

        best, results = select_for_warehouse(prophet_df)
        for row in results:
            print(
                f"  cp={row['changepoint_prior_scale']:<4} sp={row['seasonality_prior_scale']:<4} "
                f"mode={row['seasonality_mode']:<14} MAE={row['mae']:.1f} MAPE={row.get('mape')}"
            )
        if best is None:
            all_results[warehouse] = {
                "changepoint_prior_scale": DEFAULT_CHANGEPOINT_PRIOR_SCALE,
                "seasonality_prior_scale": DEFAULT_SEASONALITY_PRIOR_SCALE,
                "cv_skipped": True,
                "history_months": len(prophet_df),
            }
            continue
        print(f"  -> {best}")
        all_results[warehouse] = {
            "changepoint_prior_scale": best["changepoint_prior_scale"],
            "seasonality_prior_scale": best["seasonality_prior_scale"],
            "seasonality_mode": best["seasonality_mode"],
            "cv_mae": best["mae"],
            "cv_mape": best.get("mape"),
            "cv_skipped": False,
            "history_months": len(prophet_df),
        }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"\nRésultats enregistrés dans {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
