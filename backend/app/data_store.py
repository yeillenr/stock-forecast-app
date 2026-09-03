from __future__ import annotations

import os
from datetime import timedelta

import pandas as pd


APP_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(APP_DIR)

MOVEMENT_COLUMNS = {
    "date physique",
    "quantité",
    "entrepôt",
}


class DataStore:
    def __init__(self):
        self.import_folder = os.path.join(BACKEND_DIR, "data", "imports")
        self.cleaned_folder = os.path.join(BACKEND_DIR, "data", "cleaned")
        self.stock_folder = os.path.join(BACKEND_DIR, "data", "stock")

        os.makedirs(self.import_folder, exist_ok=True)
        os.makedirs(self.cleaned_folder, exist_ok=True)
        os.makedirs(self.stock_folder, exist_ok=True)

    def _normalize_columns(self, columns):
        return {str(c).strip().lower() for c in columns}

    def classify_dataset(self, df):
        columns = self._normalize_columns(df.columns)
        if MOVEMENT_COLUMNS.issubset(columns):
            return "movements"
        raise ValueError(
            "Fichier non reconnu. Colonnes attendues : Date physique, Quantité, Entrepôt "
            "(plus Réception / Stock en sortie si disponibles)."
        )

    def validate_sales_files(self, datasets):
        if len(datasets) == 0:
            raise ValueError("Aucun fichier de mouvements fourni.")

        for filename, df in datasets.items():
            cols = self._normalize_columns(df.columns)
            if not MOVEMENT_COLUMNS.issubset(cols):
                raise ValueError(
                    f"{filename} ne correspond pas à un fichier de mouvements D365 valide."
                )

    def merge_movements(self, datasets):
        return pd.concat(list(datasets.values()), ignore_index=True)

    def clean_data(self, df):
        df = df.copy()
        df.columns = df.columns.str.strip()
        df["Date physique"] = pd.to_datetime(
            df["Date physique"],
            dayfirst=True,
            errors="coerce",
        )
        df = df.dropna(subset=["Date physique"])
        df["Entrepôt"] = df["Entrepôt"].astype(str).str.strip()
        df = df[df["Entrepôt"].ne("") & df["Entrepôt"].ne("nan")]
        df["Quantité"] = pd.to_numeric(df["Quantité"], errors="coerce")
        df = df.dropna(subset=["Quantité"])
        return df.sort_values("Date physique")

    def _series_or_empty(self, df, column):
        if column in df.columns:
            return df[column].astype(str).str.strip().str.lower()
        return pd.Series([""] * len(df), index=df.index)

    def classify_rows(self, df):
        rec = self._series_or_empty(df, "Réception")
        out = self._series_or_empty(df, "Stock en sortie")
        ref = self._series_or_empty(df, "Référence")
        qty = df["Quantité"]

        kind = pd.Series(["other"] * len(df), index=df.index)
        kind = kind.mask(out.eq("vendu"), "sale")
        kind = kind.mask(rec.eq("acheté"), "purchase")
        transfer = ref.str.contains("transfert", na=False)
        kind = kind.mask(transfer & (qty >= 0), "transfer_in")
        kind = kind.mask(transfer & (qty < 0), "transfer_out")
        return kind

    def prepare_sales(self, df):
        classified = df.copy()
        classified["kind"] = self.classify_rows(classified)
        sales = classified[classified["kind"] == "sale"].copy()
        sales["Quantité"] = sales["Quantité"].abs()
        return sales

    def prepare_all_movements(self, df):
        movements = df.copy()
        movements["kind"] = self.classify_rows(movements)
        movements["Quantité"] = movements["Quantité"].abs()
        return movements

    def aggregate_daily_sales(self, sales):
        return (
            sales.groupby(["Date physique", "Entrepôt"], as_index=False)["Quantité"]
            .sum()
        )

    def incomplete_month_start(self, dataframe, date_col="Date physique"):
        if dataframe is None or dataframe.empty:
            return None
        last = pd.Timestamp(dataframe[date_col].max()).normalize()
        month_end = (last + pd.offsets.MonthEnd(0)).normalize()
        if last < month_end - timedelta(days=1):
            return pd.Timestamp(year=last.year, month=last.month, day=1)
        return None

    def drop_incomplete_last_month(self, dataframe, date_col="Date physique"):
        cutoff = self.incomplete_month_start(dataframe, date_col)
        if cutoff is None:
            return dataframe.copy(), None
        kept = dataframe[dataframe[date_col] < cutoff].copy()
        return kept, cutoff

    def reconstruct_stock(self, movements):
        if movements is None or movements.empty:
            return {}

        signed = movements.copy()
        sign = signed["kind"].map(
            {
                "purchase": 1.0,
                "transfer_in": 1.0,
                "sale": -1.0,
                "transfer_out": -1.0,
            }
        ).fillna(0.0)
        signed["delta"] = signed["Quantité"] * sign

        daily = (
            signed.groupby(["Date physique", "Entrepôt"], as_index=False)["delta"]
            .sum()
            .sort_values(["Entrepôt", "Date physique"])
        )
        daily["stock"] = daily.groupby("Entrepôt")["delta"].cumsum()

        latest = daily.groupby("Entrepôt").tail(1)
        return {
            row["Entrepôt"]: round(float(row["stock"]), 2)
            for _, row in latest.iterrows()
        }

    def save_cleaned_data(self, df):
        path = os.path.join(self.cleaned_folder, "cleaned_data.csv")
        df.to_csv(path, index=False)
        return path

    def save_movements(self, df):
        path = os.path.join(self.cleaned_folder, "movements.csv")
        df.to_csv(path, index=False)
        return path

    def load_cleaned_data(self):
        path = os.path.join(self.cleaned_folder, "cleaned_data.csv")
        if not os.path.exists(path):
            raise FileNotFoundError("Aucune donnée nettoyée disponible.")
        df = pd.read_csv(path)
        df["Date physique"] = pd.to_datetime(df["Date physique"])
        return df

    def load_movements(self):
        path = os.path.join(self.cleaned_folder, "movements.csv")
        if not os.path.exists(path):
            return None
        df = pd.read_csv(path)
        df["Date physique"] = pd.to_datetime(df["Date physique"])
        return df
