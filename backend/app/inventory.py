from __future__ import annotations

from datetime import date, timedelta

import pandas as pd


def _days_in_month(stamp):
    stamp = pd.Timestamp(stamp)
    return int(stamp.days_in_month)


def expand_monthly_forecast(forecast_points, start_date):
    """Étale chaque mois prévu en demande journalière constante, bornée à 0."""
    rows = []
    cursor = pd.Timestamp(start_date).normalize()
    for point in forecast_points:
        month_start = pd.Timestamp(point.get("date", cursor)).normalize().replace(day=1)
        if month_start < cursor.replace(day=1):
            month_start = cursor.replace(day=1)
        days = _days_in_month(month_start)
        prediction = max(float(point.get("prediction") or 0), 0.0)
        lower = max(float(point.get("lower") or prediction), 0.0)
        upper = max(float(point.get("upper") or prediction), 0.0)
        if lower > prediction:
            lower = prediction
        if upper < prediction:
            upper = prediction
        for offset in range(days):
            day = (month_start + timedelta(days=offset)).date()
            if day < start_date:
                continue
            rows.append(
                {
                    "date": day,
                    "p50": prediction / days,
                    "p90_demand": lower / days,
                    "p10_demand": upper / days,
                }
            )
        cursor = month_start + pd.offsets.MonthBegin(1)
    return rows


def run_path(daily_rows, current_stock, min_stock, demand_key):
    stock = float(current_stock)
    min_stock = float(min_stock)
    for index, row in enumerate(daily_rows):
        stock -= float(row[demand_key])
        if stock < min_stock:
            return {
                "remaining_days": index,
                "stockout_date": row["date"].isoformat(),
            }
    last = daily_rows[-1]["date"] if daily_rows else None
    return {
        "remaining_days": len(daily_rows),
        "stockout_date": last.isoformat() if last else None,
    }


def simulate_inventory(
    forecast_points,
    current_stock,
    min_stock,
    lead_time,
    reference_date,
    months,
):
    if isinstance(reference_date, str):
        start = date.fromisoformat(reference_date)
    else:
        start = reference_date or date.today()

    lead_time = max(int(lead_time or 0), 0)
    daily = expand_monthly_forecast(forecast_points, start)
    if not daily:
        return {
            "predicted_demand": 0,
            "adjusted_demand": 0,
            "quantity_to_order": 0,
            "remaining_days": 0,
            "risk": "unknown",
            "stockout_date": None,
            "stockout_date_p10": None,
            "stockout_date_p50": None,
            "stockout_date_p90": None,
            "order_date": None,
            "order_in_days": 0,
        }

    p10 = run_path(daily, current_stock, min_stock, "p10_demand")
    p50 = run_path(daily, current_stock, min_stock, "p50")
    p90 = run_path(daily, current_stock, min_stock, "p90_demand")

    predicted = round(sum(max(float(p.get("prediction") or 0), 0.0) for p in forecast_points), 2)
    adjusted = round(sum(max(float(p.get("upper") or p.get("prediction") or 0), 0.0) for p in forecast_points), 2)
    days_of_forecast = max(months * 30, 1)
    safety = round((predicted / days_of_forecast) * lead_time, 2)
    target = round(predicted + safety + float(min_stock), 2)
    quantity = round(max(target - float(current_stock), 0), 2)

    remaining = int(p50["remaining_days"])
    order_in_days = max(remaining - lead_time, 0)
    order_date = (start + timedelta(days=order_in_days)).isoformat()

    if remaining <= lead_time:
        risk = "high"
    elif remaining <= lead_time + 15:
        risk = "medium"
    else:
        risk = "low"

    return {
        "predicted_demand": int(round(predicted)),
        "adjusted_demand": int(round(adjusted)),
        "quantity_to_order": int(round(quantity)),
        "remaining_days": remaining,
        "risk": risk,
        "stockout_date": p50["stockout_date"],
        "stockout_date_p10": p10["stockout_date"],
        "stockout_date_p50": p50["stockout_date"],
        "stockout_date_p90": p90["stockout_date"],
        "order_date": order_date,
        "order_in_days": int(order_in_days),
    }
