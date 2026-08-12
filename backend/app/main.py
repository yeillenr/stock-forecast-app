from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import os
import pandas as pd
from typing import List, Optional

from data_store import DataStore
from forecasting import ForecastingService
from dashboard import DashboardService
from pydantic import BaseModel

app = FastAPI(title="Stock Forecast API")

class WarehouseSettings(BaseModel):
    warehouse: str
    stock: float
    delivery_time: int


class ForecastRequest(BaseModel):
    months: int = 3
    warehouse: Optional[str] = None


class SimulationRequest(BaseModel):
    warehouse: Optional[str] = None
    current_stock: Optional[float] = None
    lead_time: Optional[int] = None
    months: int = 3


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

@app.post("/import")
async def import_files(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    os.makedirs(store.import_folder, exist_ok=True)

    sales_datasets = {}

    for file in files:
        file_path = os.path.join(store.import_folder, file.filename)
        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)

        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        dataset_type = store.classify_dataset(df)
        if dataset_type == "sales":
            sales_datasets[file.filename] = df
    if not sales_datasets :
        raise HTTPException(status_code=400, detail="Aucun fichier de données valide n'a été importé.")

    response = {
        "success": True,
        "message": "",
    }

    if sales_datasets:
        try:
            store.validate_sales_files(sales_datasets)
            merged = store.merge_movements(sales_datasets)
            cleaned = store.clean_data(merged)
            sales = store.prepare_sales(cleaned)
            daily = store.aggregate_daily_sales(sales)
            store.save_cleaned_data(daily)
            response["message"] = f"Historique de ventes importé ({len(sales_datasets)} fichiers)."
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    return response

@app.post("/forecast")
def forecast_route(request: ForecastRequest):
    data = store.load_cleaned_data()
    if request.warehouse:
        data = data[data["Entrepôt"] == request.warehouse]
    return forecast.forecast(dataframe=data, months=request.months)

@app.get("/warehouses")
def list_warehouses():
    data = store.load_cleaned_data()
    return dashboard.warehouse_list(dataframe=data)

@app.get("/dashboard")
def dashboard_summary(warehouse: Optional[str] = Query(default=None)):
    data = store.load_cleaned_data()
    return dashboard.dashboard_summary(dataframe=data, warehouse=warehouse)

@app.get("/stock-status")
def stock_status():
    data = store.load_cleaned_data()
    return dashboard.stock_status_rows(dataframe=data)

@app.get("/sales")
def sales(warehouse: Optional[str] = Query(default=None)):
    data = store.load_cleaned_data()
    return dashboard.sales_history(dataframe=data, warehouse=warehouse)

@app.post("/warehouse/settings")
def update_settings(settings: WarehouseSettings):
    dashboard.update_stock(settings.warehouse, settings.stock)
    dashboard.update_delivery_time(settings.warehouse, settings.delivery_time)
    return {
        "success": True,
        "message": "Paramètres enregistrés.",
    }

@app.post("/simulation")
def simulation(request: SimulationRequest):
    data = store.load_cleaned_data()
    return dashboard.simulation(
        dataframe=data,
        warehouse=request.warehouse,
        current_stock=request.current_stock,
        lead_time=request.lead_time,
        months=request.months,
    )

@app.get("/metrics")
def get_metrics():
    metrics = forecast.evaluate(dataframe=store.load_cleaned_data())

    return {
        "MAE": metrics["MAE"],
        "RMSE": metrics["RMSE"],
        "R2": metrics["R2"]
    }
