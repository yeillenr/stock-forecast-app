import os
from io import BytesIO
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from assistant import AssistantService
from dashboard import DashboardService
from data_store import DataStore
from forecasting import ForecastingService

app = FastAPI(title="Stock Forecast API")


class WarehouseSettings(BaseModel):
    warehouse: str
    stock: float
    delivery_time: int
    min_stock: float = 0


class ForecastRequest(BaseModel):
    months: int = 3
    warehouse: Optional[str] = None


class SimulationRequest(BaseModel):
    warehouse: Optional[str] = None
    current_stock: Optional[float] = None
    lead_time: Optional[int] = None
    min_stock: Optional[float] = None
    reference_date: Optional[str] = None
    months: int = 3


class AssistantRequest(BaseModel):
    message: str


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = DataStore()
forecast = ForecastingService()
dashboard = DashboardService()
assistant = AssistantService()


def _load_data():
    try:
        return store.load_cleaned_data()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/import")
async def import_files(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    movement_datasets = {}
    skipped = []

    for file in files:
        filename = file.filename or "fichier"
        content = await file.read()
        try:
            buffer = BytesIO(content)
            if filename.lower().endswith(".csv"):
                df = pd.read_csv(buffer)
            else:
                df = pd.read_excel(buffer)
            dataset_type = store.classify_dataset(df)
        except Exception as exc:
            skipped.append(f"{filename} ({exc})")
            continue

        if dataset_type == "movements":
            os.makedirs(store.import_folder, exist_ok=True)
            dest = os.path.join(store.import_folder, filename)
            with open(dest, "wb") as handle:
                handle.write(content)
            movement_datasets[filename] = df

    if not movement_datasets:
        detail = "Aucun fichier de mouvements valide n'a été importé."
        if skipped:
            detail += " Ignorés : " + " ; ".join(skipped)
        raise HTTPException(status_code=400, detail=detail)

    try:
        store.validate_sales_files(movement_datasets)
        merged = store.merge_movements(movement_datasets)
        cleaned = store.clean_data(merged)
        movements = store.prepare_all_movements(cleaned)
        sales = store.prepare_sales(cleaned)
        daily = store.aggregate_daily_sales(sales)
        store.save_cleaned_data(daily)
        store.save_movements(movements[["Date physique", "Entrepôt", "kind", "Quantité"]])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    message = f"Mouvements importés ({len(movement_datasets)} fichier(s), {len(sales)} ventes)."
    if skipped:
        message += " Ignorés : " + " ; ".join(skipped)
    return {"success": True, "message": message, "sales_files": len(movement_datasets)}


@app.post("/forecast")
def forecast_route(request: ForecastRequest):
    data = _load_data()
    return forecast.forecast(
        dataframe=data,
        months=request.months,
        warehouse=request.warehouse,
    )


@app.get("/warehouses")
def list_warehouses():
    data = _load_data()
    return dashboard.warehouse_list(dataframe=data)


@app.get("/dashboard")
def dashboard_summary(warehouse: Optional[str] = Query(default=None)):
    data = _load_data()
    if not warehouse:
        raise HTTPException(status_code=400, detail="Paramètre warehouse requis.")
    return dashboard.dashboard_summary(dataframe=data, warehouse=warehouse)


@app.get("/stock-status")
def stock_status(warehouse: Optional[str] = Query(default=None)):
    data = _load_data()
    return dashboard.stock_status_rows(dataframe=data, warehouse=warehouse)


@app.get("/sales")
def sales(warehouse: Optional[str] = Query(default=None)):
    data = _load_data()
    return dashboard.sales_history(dataframe=data, warehouse=warehouse)


@app.post("/warehouse/settings")
def update_settings(settings: WarehouseSettings):
    dashboard.update_stock(settings.warehouse, settings.stock)
    dashboard.update_delivery_time(settings.warehouse, settings.delivery_time)
    dashboard.update_min_stock(settings.warehouse, settings.min_stock)
    return {"success": True, "message": "Paramètres enregistrés."}


@app.post("/simulation")
def simulation(request: SimulationRequest):
    data = _load_data()
    try:
        return dashboard.simulation(
            dataframe=data,
            warehouse=request.warehouse,
            current_stock=request.current_stock,
            lead_time=request.lead_time,
            min_stock=request.min_stock,
            reference_date=request.reference_date,
            months=request.months,
            persist_settings=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/metrics")
def get_metrics(warehouse: Optional[str] = Query(default=None)):
    data = _load_data()
    metrics = forecast.evaluate(dataframe=data, warehouse=warehouse)
    return metrics


@app.post("/assistant")
def assistant_route(request: AssistantRequest):
    return {"reply": assistant.respond(request.message)}
