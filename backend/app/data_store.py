from __future__ import annotations

import os
import pandas as pd


class DataStore:

    def __init__(self):

        self.import_folder = "data/imports"
        self.cleaned_folder = "data/cleaned"
        self.stock_folder = "data/stock"

        os.makedirs(self.import_folder, exist_ok=True)
        os.makedirs(self.cleaned_folder, exist_ok=True)
        os.makedirs(self.stock_folder, exist_ok=True)

    def _normalize_columns(self, columns):
        return {c.strip().lower() for c in columns}

    def classify_dataset(self, df):
        columns = self._normalize_columns(df.columns)

        required_columns = {
            "date physique",
            "stock en sortie",
            "quantité",
            "entrepôt",
        }

        if required_columns.issubset(columns):
            return "sales"

        raise ValueError("Impossible de déterminer le type de fichier importé.")

    def validate_sales_files(self, datasets):
        required_columns = {
            "date physique",
            "stock en sortie",
            "quantité",
            "entrepôt",
        }

        if len(datasets) == 0:
            raise ValueError("Aucun fichier de ventes fourni.")

        for filename, df in datasets.items():
            cols = self._normalize_columns(df.columns)
            if not required_columns.issubset(cols):
                raise ValueError(
                    f"{filename} ne correspond pas à un fichier de ventes valide."
                )

    def load_files(self):
        """
        Charge tous les fichiers présents dans data/imports.
        """

        datasets = {}

        for filename in os.listdir(self.import_folder):

            if filename.lower().endswith(".xlsx"):

                path = os.path.join(
                    self.import_folder,
                    filename
                )

                datasets[filename] = pd.read_excel(path)

        return datasets

    def merge_movements(self, datasets):
        """
        Fusionne tous les fichiers de mouvements.
        """

        merged = pd.concat(
            list(datasets.values()),
            ignore_index=True
        )

        return merged

    def clean_data(self, df):
        """
        Nettoyage des données.
        """

        df = df.copy()

        df.columns = df.columns.str.strip()

        df["Date physique"] = pd.to_datetime(
            df["Date physique"],
            dayfirst=True,
            errors="coerce"
        )

        df = df.dropna(subset=["Date physique"])

        df = df.sort_values("Date physique")

        return df

    def prepare_sales(self, df):
        """
        Conserve uniquement les mouvements correspondant
        aux ventes.
        """

        sales = df.copy()

        sales["Stock en sortie"] = (
            sales["Stock en sortie"]
            .astype(str)
            .str.strip()
            .str.lower()
        )

        sales = sales[
            sales["Stock en sortie"] == "vendu"
        ]

        sales["Quantité"] = (
            pd.to_numeric(
                sales["Quantité"],
                errors="coerce"
            )
            .abs()
        )

        sales = sales.dropna(subset=["Quantité"])

        return sales

    def aggregate_daily_sales(self, sales):
        """
        Agrège les ventes par jour et par entrepôt.
        """

        daily = (
            sales
            .groupby(
                ["Date physique", "Entrepôt"],
                as_index=False
            )["Quantité"]
            .sum()
        )

        return daily

    def save_cleaned_data(self, df):
        """
        Sauvegarde les données nettoyées.
        """

        path = os.path.join(
            self.cleaned_folder,
            "cleaned_data.csv"
        )

        df.to_csv(
            path,
            index=False
        )

        return path

    def load_cleaned_data(self):
        """
        Recharge les données nettoyées.
        """

        path = os.path.join(
            self.cleaned_folder,
            "cleaned_data.csv"
        )

        if not os.path.exists(path):
            raise FileNotFoundError(
                "Aucune donnée nettoyée disponible."
            )

        df = pd.read_csv(path)

        df["Date physique"] = pd.to_datetime(
            df["Date physique"]
        )

        return df