import re

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB

from data_store import DataStore
from dashboard import DashboardService
from forecasting import ForecastingService


class AssistantService:
    def __init__(self):
        self.intro = (
            "Bonjour ! Je peux vous aider à analyser vos données de stock, "
            "à suggérer des actions de réapprovisionnement et à expliquer les prévisions."
        )

        self.data_store = DataStore()
        self.dashboard_service = DashboardService()
        self.forecast_service = ForecastingService()

        self.intent_examples = {
            "stock_status": [
                "Quel est l'état du stock ?",
                "Quel entrepôt est en rupture ?",
                "Quels dépôts sont critiques ?",
                "Montre moi les entrepôts à surveiller",
            ],
            "forecast": [
                "Quelle est la prévision pour les 3 prochains mois ?",
                "Que prévois-tu pour les ventes ?",
                "Donne-moi le forecast des ventes.",
                "Comment vont évoluer les ventes ?",
            ],
            "replenishment": [
                "Que dois-je commander pour PK9 ?",
                "Quel est le besoin de réapprovisionnement ?",
                "Quand faut-il commander ?",
                "Combien dois-je commander ?",
            ],
            "import_help": [
                "Comment importer les données ?",
                "Quels fichiers puis-je charger ?",
                "J'ai besoin d'aide pour l'import",
                "Comment mettre à jour le modèle ?",
            ],
            "greeting": [
                "Bonjour",
                "Salut",
                "Hello",
                "Bonsoir",
            ],
        }

        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2))
        self.model = MultinomialNB()
        self._train_intent_model()

    def _train_intent_model(self):
        examples = []
        labels = []

        for intent, phrases in self.intent_examples.items():
            for phrase in phrases:
                examples.append(phrase)
                labels.append(intent)

        X = self.vectorizer.fit_transform(examples)
        self.model.fit(X, labels)

    def _extract_warehouse(self, text: str) -> str | None:
        match = re.search(r"\b[A-Za-z]{1,3}\d{1,3}\b", text.upper())
        return match.group(0) if match else None

    def _forecast_summary(self, warehouse: str | None, months: int = 3) -> str:
        try:
            data = self.data_store.load_cleaned_data()
        except FileNotFoundError:
            return "Aucune donnée nettoyée n'est disponible. Importez d'abord vos fichiers de ventes."

        if warehouse:
            data = data[data["Entrepôt"] == warehouse]
            if data.empty:
                return f"Je ne trouve aucune donnée pour l'entrepôt {warehouse}. Vérifiez le nom ou importez les ventes correspondantes."

        try:
            forecast = self.forecast_service.forecast(dataframe=data, months=months)
        except Exception as exc:
            return f"Impossible de calculer la prévision Prophet pour le moment : {exc}."

        total_prediction = sum(item["prediction"] for item in forecast.get("forecast", []))
        dates = [item["date"] for item in forecast.get("forecast", [])]
        if not dates:
            return "Le modèle n'a généré aucune prévision. Vérifiez vos données et ré-entraînez le modèle."

        range_label = f"sur {months} mois"
        warehouse_label = f" pour l'entrepôt {warehouse}" if warehouse else " pour tous les entrepôts"

        return (
            f"La prévision Prophet{warehouse_label} {range_label} indique environ "
            f"{round(total_prediction, 2)} unités sur la période. "
            f"La première date prévue est {dates[0]} et la dernière date prévue est {dates[-1]}."
        )

    def _stock_status(self) -> str:
        try:
            data = self.data_store.load_cleaned_data()
        except FileNotFoundError:
            return "Aucune donnée nettoyée n'est disponible. Importez d'abord vos fichiers de ventes."

        rows = self.dashboard_service.stock_status_rows(dataframe=data)
        if not rows:
            return "Aucun entrepôt n'est disponible dans les données. Importez d'abord vos fichiers."

        critical = [row["warehouse"] for row in rows if row["status"] != "ok"]
        if not critical:
            return "Tous les entrepôts sont stables pour le moment."

        details = ", ".join(critical[:3])
        summary = (
            f"Actuellement, {len(critical)} entrepôt(s) nécessite(nt) une attention. "
            f"Les premiers dépôts concernés sont : {details}."
        )
        return summary

    def _replenishment_advice(self, warehouse: str | None) -> str:
        try:
            data = self.data_store.load_cleaned_data()
        except FileNotFoundError:
            return "Aucune donnée nettoyée n'est disponible. Importez d'abord vos fichiers de ventes."

        if warehouse:
            rows = self.dashboard_service.dashboard_summary(dataframe=data, warehouse=warehouse)
            if rows["quantity_to_order"] <= 0:
                return f"Selon les dernières données, l'entrepôt {warehouse} n'a pas besoin de commande supplémentaire pour le moment."
            return (
                f"L'entrepôt {warehouse} devrait commander environ {rows['quantity_to_order']} unités "
                f"en tenant compte du stock actuel et du délai de livraison."
            )

        status_rows = self.dashboard_service.stock_status_rows(dataframe=data)
        critical_rows = [row for row in status_rows if row["status"] != "ok"]
        if not critical_rows:
            return "Aucun entrepôt critique n'a été détecté. Tous les stocks sont dans une plage saine."

        top = sorted(critical_rows, key=lambda row: row["quantity_to_order"], reverse=True)[:3]
        return (
            "Entrepôts prioritaires pour le réapprovisionnement : "
            + ", ".join(f"{row['warehouse']} ({row['quantity_to_order']} unités)" for row in top)
            + "."
        )

    def respond(self, message: str) -> str:
        input_text = message.strip()
        if not input_text:
            return "Veuillez saisir une question ou un sujet à propos de vos stocks."

        features = self.vectorizer.transform([input_text])
        intent = self.model.predict(features)[0]
        warehouse = self._extract_warehouse(input_text)

        if intent == "greeting":
            return self.intro
        if intent == "stock_status":
            return self._stock_status()
        if intent == "forecast":
            return self._forecast_summary(warehouse)
        if intent == "replenishment":
            return self._replenishment_advice(warehouse)
        if intent == "import_help":
            return (
                "Importez vos fichiers CSV ou Excel depuis l'onglet Données. "
                "Le système analyse automatiquement les ventes et met à jour le modèle Prophet."
            )

        return (
            "Je peux vous aider à comprendre les prévisions, les niveaux de stock et "
            "la planification des commandes. Posez-moi une question spécifique sur vos données."
        )
