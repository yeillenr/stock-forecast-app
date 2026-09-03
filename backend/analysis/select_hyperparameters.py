"""
Analyse hors-ligne : sélection de changepoint_prior_scale et
seasonality_prior_scale par validation croisée temporelle glissante
(prophet.diagnostics.cross_validation + performance_metrics), par entrepôt.

À exécuter depuis backend/ :
    python analysis/select_hyperparameters.py

Résultat : backend/model_hyperparameters.json, relu par forecasting.py
pour fixer les hyperparamètres du modèle en production (plus de recherche
en direct dans l'app).
"""

import itertools
import json
import sys

sys.path.insert(0, "app")

from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics

from data_store import DataStore
from forecasting import ForecastingService

CHANGEPOINT_CANDIDATES = [0.05, 0.1, 0.2]
SEASONALITY_CANDIDATES = [1, 10, 25]

# horizon aligné sur l'horizon par défaut de l'app (3 mois) ; initial couvre
# au moins un cycle annuel complet, condition nécessaire pour que
# yearly_seasonality="auto" ait un signal à apprendre.
INITIAL = "365 days"
PERIOD = "30 days"
HORIZON = "90 days"

# ~12 mois (initial) + 3 mois (horizon) + au moins 1 fenêtre de recul.
MIN_MONTHS_FOR_CV = 16

OUTPUT_PATH = "model_hyperparameters.json"

DEFAULT_CHANGEPOINT_PRIOR_SCALE = 0.05
DEFAULT_SEASONALITY_PRIOR_SCALE = 10.0


def evaluate_combo(prophet_df, changepoint_prior_scale, seasonality_prior_scale):
    model = Prophet(
        yearly_seasonality="auto",
        weekly_seasonality=False,
        daily_seasonality=False,
        changepoint_prior_scale=changepoint_prior_scale,
        seasonality_prior_scale=seasonality_prior_scale,
    )
    model.fit(prophet_df)

    df_cv = cross_validation(
        model,
        initial=INITIAL,
        period=PERIOD,
        horizon=HORIZON,
        disable_tqdm=True,
    )
    df_perf = performance_metrics(df_cv)

    return {
        "rmse": float(df_perf["rmse"].mean()),
        "mape": float(df_perf["mape"].mean()) * 100 if "mape" in df_perf else None,
    }


def select_for_warehouse(prophet_df):
    best = None
    results = []

    for changepoint_scale, seasonality_scale in itertools.product(
        CHANGEPOINT_CANDIDATES, SEASONALITY_CANDIDATES
    ):
        try:
            metrics = evaluate_combo(prophet_df, changepoint_scale, seasonality_scale)
        except Exception as exc:
            print(f"    échec cp={changepoint_scale} sp={seasonality_scale} : {exc}")
            continue

        result = {
            "changepoint_prior_scale": changepoint_scale,
            "seasonality_prior_scale": seasonality_scale,
            **metrics,
        }
        results.append(result)

        if best is None or result["rmse"] < best["rmse"]:
            best = result

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
        prophet_df = forecasting.prepare_data(subset)

        if len(prophet_df) < MIN_MONTHS_FOR_CV:
            print(
                f"  Historique trop court ({len(prophet_df)} mois, minimum "
                f"{MIN_MONTHS_FOR_CV} requis pour la validation croisée) "
                "-> valeurs par défaut Prophet conservées."
            )
            all_results[warehouse] = {
                "changepoint_prior_scale": DEFAULT_CHANGEPOINT_PRIOR_SCALE,
                "seasonality_prior_scale": DEFAULT_SEASONALITY_PRIOR_SCALE,
                "cv_skipped": True,
                "history_months": len(prophet_df),
            }
            continue

        best, results = select_for_warehouse(prophet_df)

        for r in results:
            print(
                f"  cp={r['changepoint_prior_scale']:<5} sp={r['seasonality_prior_scale']:<5} "
                f"RMSE={r['rmse']:.2f} MAPE={r.get('mape')}"
            )

        if best is None:
            print("  Aucune combinaison n'a pu être évaluée -> valeurs par défaut.")
            all_results[warehouse] = {
                "changepoint_prior_scale": DEFAULT_CHANGEPOINT_PRIOR_SCALE,
                "seasonality_prior_scale": DEFAULT_SEASONALITY_PRIOR_SCALE,
                "cv_skipped": True,
                "history_months": len(prophet_df),
            }
            continue

        print(f"  -> meilleure config : {best}")

        all_results[warehouse] = {
            "changepoint_prior_scale": best["changepoint_prior_scale"],
            "seasonality_prior_scale": best["seasonality_prior_scale"],
            "cv_rmse": best["rmse"],
            "cv_mape": best.get("mape"),
            "cv_skipped": False,
            "history_months": len(prophet_df),
        }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print(f"\nRésultats enregistrés dans {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
