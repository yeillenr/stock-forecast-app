import re

from data_store import DataStore
from dashboard import DashboardService
from forecasting import ForecastingService


class AssistantService:
    def __init__(self):
        self.intro = (
            "Bonjour ! Je peux vous aider à analyser vos stocks, "
            "expliquer les prévisions et suggérer un réapprovisionnement."
        )
        self.data_store = DataStore()
        self.dashboard_service = DashboardService()
        self.forecast_service = ForecastingService()

    def _extract_warehouse(self, text: str) -> str | None:
        match = re.search(r"\b[A-Za-z]{1,3}\d{1,3}\b", text.upper())
        return match.group(0) if match else None

    def _detect_intent(self, text: str) -> str:
        t = text.lower()
        rules = [
            ("greeting", ["bonjour", "salut", "hello", "bonsoir"]),
            ("import_help", ["import", "importer", "fichier", "colonne", "excel", "csv"]),
            ("forecast", ["prévision", "prevision", "forecast", "prophet", "demande"]),
            ("replenishment", ["commander", "commande", "réappro", "reappro", "quantité à"]),
            ("stock_status", ["stock", "rupture", "critique", "entrepôt", "entrepot", "dépôt", "depot"]),
        ]
        scores = []
        for intent, words in rules:
            score = sum(1 for word in words if word in t)
            scores.append((score, intent))
        best_score, best_intent = max(scores)
        if best_score == 0:
            return "unknown"
        return best_intent

    def _forecast_summary(self, warehouse: str | None, months: int = 3) -> str:
        try:
            data = self.data_store.load_cleaned_data()
        except FileNotFoundError:
            return "Aucune donnée n'est disponible. Importez d'abord vos fichiers de mouvements."

        if warehouse:
            if data[data["Entrepôt"] == warehouse].empty:
                return f"Je ne trouve aucune donnée pour l'entrepôt {warehouse}."

        try:
            forecast = self.forecast_service.forecast(
                dataframe=data, months=months, warehouse=warehouse
            )
        except Exception as exc:
            return f"Impossible de calculer la prévision : {exc}."

        total_prediction = sum(item["prediction"] for item in forecast.get("forecast", []))
        dates = [item["date"] for item in forecast.get("forecast", [])]
        if not dates:
            return "Le modèle n'a généré aucune prévision."

        warehouse_label = f" pour {warehouse}" if warehouse else " tous entrepôts confondus"
        model = forecast.get("model_used") or "modèle"
        mape = forecast.get("mape")
        mape_label = f" MAPE hold-out {mape} %." if mape is not None else ""
        return (
            f"Prévision ({model}){warehouse_label} sur {months} mois : environ "
            f"{round(total_prediction, 0):.0f} kg entre {dates[0]} et {dates[-1]}.{mape_label}"
        )

    def _stock_status(self) -> str:
        try:
            data = self.data_store.load_cleaned_data()
        except FileNotFoundError:
            return "Aucune donnée n'est disponible. Importez d'abord vos fichiers de mouvements."

        rows = self.dashboard_service.stock_status_rows(dataframe=data)
        if not rows:
            return "Aucun entrepôt n'est disponible."

        watched = [row["warehouse"] for row in rows if row["status"] != "ok"]
        if not watched:
            return "Tous les entrepôts sont stables pour le moment."
        details = ", ".join(watched[:4])
        return (
            f"{len(watched)} entrepôt(s) à surveiller : {details}."
        )

    def _replenishment_advice(self, warehouse: str | None) -> str:
        try:
            data = self.data_store.load_cleaned_data()
        except FileNotFoundError:
            return "Aucune donnée n'est disponible. Importez d'abord vos fichiers de mouvements."

        if warehouse:
            row = self.dashboard_service.dashboard_summary(dataframe=data, warehouse=warehouse)
            if row["quantity_to_order"] <= 0:
                return f"L'entrepôt {warehouse} n'a pas besoin de commande supplémentaire pour le moment."
            return (
                f"L'entrepôt {warehouse} devrait commander environ {row['quantity_to_order']} kg "
                f"(date de commande indicative : dans {row['order_in_days']} j)."
            )

        status_rows = self.dashboard_service.stock_status_rows(dataframe=data)
        critical_rows = [row for row in status_rows if row["status"] != "ok"]
        if not critical_rows:
            return "Aucun entrepôt critique n'a été détecté."
        top = sorted(critical_rows, key=lambda row: row["quantity_to_order"], reverse=True)[:3]
        return "Priorités de réapprovisionnement : " + ", ".join(
            f"{row['warehouse']} ({row['quantity_to_order']} kg)" for row in top
        ) + "."

    def respond(self, message: str) -> str:
        input_text = message.strip()
        if not input_text:
            return "Veuillez saisir une question sur vos stocks ou prévisions."

        intent = self._detect_intent(input_text)
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
                "Importez un Excel/CSV D365 depuis Données. Colonnes : Date physique, Quantité, Entrepôt, "
                "et si possible Réception / Stock en sortie. Les ventes, achats et transferts sont conservés. "
                "Les fichiers de rapprochement sans ces colonnes sont ignorés."
            )
        return (
            "Je peux parler des prévisions, des niveaux de stock et des commandes. "
            "Posez une question plus précise, éventuellement avec le code dépôt (ex. DP0117)."
        )
