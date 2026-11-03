from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

try:
    from . import storage
except ImportError:  # Supports `uvicorn main:app --app-dir backend` for local use.
    import storage

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "delinquency_sample.csv"
STATIC_DIR = BASE_DIR / "static"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

REQUIRED_COLUMNS = {
    "Customer_ID",
    "Delinquent_Account",
}

app = FastAPI(
    title="Geldium AI Collections Intelligence API",
    description="A responsible decision-support prototype for exploratory collections analytics.",
    version="1.0.0",
)
_KNOWN_CUSTOMER_IDS: set[str] | None = None

allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


class RiskRequest(BaseModel):
    missed_payments: int = Field(ge=0, le=24)
    utilization_pct: float = Field(ge=0, le=200)
    dti_pct: float = Field(ge=0, le=200)
    credit_score: int = Field(ge=300, le=900)
    recent_missed_months: int = Field(ge=0, le=6)


class ReviewUpdate(BaseModel):
    reviewed: bool


class ValidationUpdate(BaseModel):
    completed: bool


VALIDATION_TASK_IDS = [
    "data-definitions", "reconcile-payments", "missingness", "utilization", "labels", "identity",
    "baseline", "holdout", "calibration", "fairness", "explainability", "privacy", "pilot", "monitoring",
]


def _safe_number(value: Any) -> float | None:
    try:
        if pd.isna(value):
            return None
        number = float(value)
        if number != number or number in (float("inf"), float("-inf")):
            return None
        return number
    except (TypeError, ValueError):
        return None


def _normalise_target(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _segment_summary(df: pd.DataFrame, field: str) -> list[dict[str, Any]]:
    if field not in df.columns or "Delinquent_Account" not in df.columns:
        return []
    working = df[[field, "Delinquent_Account"]].copy()
    working["Delinquent_Account"] = _normalise_target(working["Delinquent_Account"])
    working[field] = working[field].fillna("Not recorded").astype(str)
    grouped = working.groupby(field, dropna=False)["Delinquent_Account"].agg(["count", "sum", "mean"]).reset_index()
    grouped = grouped.sort_values("count", ascending=False)
    return [
        {
            "label": str(row[field]),
            "customers": int(row["count"]),
            "recorded_delinquent": int(row["sum"] or 0),
            "observed_rate_pct": round(float(row["mean"] or 0) * 100, 1),
        }
        for _, row in grouped.iterrows()
    ]


def analyse_frame(df: pd.DataFrame) -> dict[str, Any]:
    df = df.copy()
    rows, columns = df.shape
    target = _normalise_target(df.get("Delinquent_Account", pd.Series(dtype=float)))
    known_target = target.dropna()
    delinquent = int((known_target == 1).sum())
    non_delinquent = int((known_target == 0).sum())
    target_total = int(known_target.shape[0])
    delinquency_rate = round((delinquent / target_total) * 100, 1) if target_total else 0.0

    missing_by_column = df.isna().sum().to_dict()
    missing_cells = int(df.isna().sum().sum())
    rows_with_missing = int(df.isna().any(axis=1).sum())
    duplicate_ids = int(df["Customer_ID"].duplicated().sum()) if "Customer_ID" in df.columns else 0
    duplicate_rows = int(df.duplicated().sum())

    months = [f"Month_{i}" for i in range(1, 7) if f"Month_{i}" in df.columns]
    payment_mismatches = 0
    if months and "Missed_Payments" in df.columns:
        missed_months = df[months].fillna("").astype(str).apply(lambda col: col.str.strip().str.lower().eq("missed")).sum(axis=1)
        total_missed = pd.to_numeric(df["Missed_Payments"], errors="coerce")
        payment_mismatches = int((missed_months > total_missed).fillna(False).sum())

    utilization_above_100 = 0
    if "Credit_Utilization" in df.columns:
        utilization = pd.to_numeric(df["Credit_Utilization"], errors="coerce")
        utilization_above_100 = int((utilization > 1).sum())

    employment_labels = []
    if "Employment_Status" in df.columns:
        employment_labels = sorted(
            {str(x) for x in df["Employment_Status"].dropna().unique()},
            key=lambda value: value.lower(),
        )

    payment_counts = []
    for month in months:
        counts = df[month].fillna("Not recorded").astype(str).value_counts()
        payment_counts.append(
            {
                "month": month.replace("Month_", "M"),
                "on_time": int(counts.get("On-time", 0)),
                "late": int(counts.get("Late", 0)),
                "missed": int(counts.get("Missed", 0)),
                "not_recorded": int(counts.get("Not recorded", 0)),
            }
        )

    card_segments = _segment_summary(df, "Credit_Card_Type")
    location_segments = _segment_summary(df, "Location")

    issues = []
    if missing_cells:
        issues.append({
            "severity": "attention",
            "title": "Missing values require controlled treatment",
            "detail": f"{missing_cells} missing cells across {rows_with_missing} customer records. Review missingness by field before imputation.",
            "count": missing_cells,
        })
    if payment_mismatches:
        issues.append({
            "severity": "critical",
            "title": "Payment-history reconciliation is required",
            "detail": f"{payment_mismatches} records have more 'Missed' entries across the six monthly fields than the Missed_Payments value. Confirm the definitions and time windows before modelling.",
            "count": payment_mismatches,
        })
    if utilization_above_100:
        issues.append({
            "severity": "attention",
            "title": "Credit utilization exceeds 100% in some records",
            "detail": f"{utilization_above_100} records are above 1.0 when Credit_Utilization is interpreted as a proportion. Confirm units and investigate exceptions; do not automatically cap values.",
            "count": utilization_above_100,
        })
    if employment_labels:
        variants = [label for label in employment_labels if label.strip().lower() in {"emp", "employed"}]
        if len(variants) > 1:
            issues.append({
                "severity": "attention",
                "title": "Employment labels are inconsistent",
                "detail": "The source includes variants such as EMP, Employed and employed. Confirm their meaning, then standardize categories using an approved mapping.",
                "count": len(variants),
            })
    if duplicate_ids or duplicate_rows:
        issues.append({
            "severity": "critical",
            "title": "Duplicate records need investigation",
            "detail": f"{duplicate_ids} duplicate customer IDs and {duplicate_rows} fully duplicated rows detected.",
            "count": duplicate_ids + duplicate_rows,
        })

    records = []
    for _, row in df.iterrows():
        record = {}
        for col, value in row.items():
            if pd.isna(value):
                record[str(col)] = None
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                record[str(col)] = round(float(value), 4)
            else:
                record[str(col)] = str(value)
        records.append(record)

    return {
        "summary": {
            "total_customers": int(rows),
            "delinquent_count": delinquent,
            "non_delinquent_count": non_delinquent,
            "target_records": target_total,
            "delinquency_rate_pct": delinquency_rate,
            "missing_cells": missing_cells,
            "rows_with_missing": rows_with_missing,
            "columns": int(columns),
            "duplicate_customer_ids": duplicate_ids,
            "duplicate_rows": duplicate_rows,
        },
        "quality": {
            "missing_by_column": {str(k): int(v) for k, v in missing_by_column.items() if int(v) > 0},
            "payment_history_mismatches": payment_mismatches,
            "utilization_above_100": utilization_above_100,
            "employment_labels": employment_labels,
            "issues": issues,
        },
        "segments": {
            "credit_card_type": card_segments,
            "location": location_segments,
        },
        "payment_history": payment_counts,
        "records": records,
        "source_note": "Exploratory, descriptive analysis of the uploaded dataset. Segment rates are unadjusted and are not validated risk predictions or evidence of causation.",
    }


def simulate_risk(payload: RiskRequest) -> dict[str, Any]:
    points = 0
    reasons: list[str] = []
    if payload.missed_payments >= 3:
        points += 2
        reasons.append("Three or more missed payments recorded")
    elif payload.missed_payments >= 1:
        points += 1
        reasons.append("At least one missed payment recorded")

    if payload.utilization_pct >= 80:
        points += 2
        reasons.append("Credit utilization at or above the illustrative 80% review trigger")
    elif payload.utilization_pct >= 60:
        points += 1
        reasons.append("Credit utilization at or above the illustrative 60% review trigger")

    if payload.dti_pct >= 40:
        points += 1
        reasons.append("Debt-to-income ratio at or above the illustrative 40% review trigger")

    if payload.credit_score <= 580:
        points += 1
        reasons.append("Credit score at or below the illustrative 580 review trigger")

    if payload.recent_missed_months >= 2:
        points += 1
        reasons.append("Two or more recent monthly 'Missed' statuses")

    if points <= 1:
        band = "Routine review"
        tone = "low"
        recommendation = "Continue standard, respectful servicing. Keep payment information accessible and offer self-service support; do not infer that the customer has no financial difficulty."
        oversight = "Routine communications may be scheduled under existing consent and contact-preference rules."
    elif points <= 3:
        band = "Support outreach"
        tone = "medium"
        recommendation = "Consider a supportive outreach conversation to understand the customer's situation and explain available assistance. Confirm contact preferences and verify source data first."
        oversight = "A trained collections associate should review the context before any tailored arrangement is offered."
    else:
        band = "Priority human review"
        tone = "high"
        recommendation = "Prioritize a human review of data accuracy, recent payment events and possible hardship needs. Offer appropriate assistance; do not trigger punitive escalation from this score."
        oversight = "Human approval is required. The illustrative score must not trigger penalties, account restrictions, credit decisions or legal escalation."

    return {
        "points": points,
        "band": band,
        "tone": tone,
        "reasons": reasons or ["No illustrative review trigger was met"],
        "recommendation": recommendation,
        "oversight": oversight,
        "disclaimer": "Demonstration-only rules, not a trained or validated predictive model. Thresholds are illustrative and have not been approved by Geldium. Do not use for real customer decisions.",
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    storage.operations_summary(len(VALIDATION_TASK_IDS))
    return {"status": "ok", "service": "Geldium Collections Intelligence", "mode": "demo", "state_store": "sqlite"}


@app.get("/api/sample")
def sample_data() -> dict[str, Any]:
    if not DATA_PATH.exists():
        raise HTTPException(status_code=500, detail="Sample dataset is not available on the server.")
    df = pd.read_csv(DATA_PATH)
    return analyse_frame(df)


@app.post("/api/analyze")
async def analyze_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MB demo upload limit.")
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read this CSV: {exc}") from exc
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"CSV is missing required columns: {', '.join(sorted(missing))}")
    if len(df) == 0:
        raise HTTPException(status_code=400, detail="The uploaded CSV contains no data rows.")
    if len(df) > 10000:
        raise HTTPException(status_code=400, detail="For this demonstration, upload no more than 10,000 rows.")
    return analyse_frame(df)


@app.post("/api/simulate")
def risk_simulation(payload: RiskRequest) -> dict[str, Any]:
    return simulate_risk(payload)


@app.get("/api/reviews")
def get_review_state() -> dict[str, Any]:
    """Return saved review flags and a short activity history for the demo queue."""
    return storage.list_reviews()


@app.put("/api/reviews/{customer_id}")
def update_review_state(customer_id: str, payload: ReviewUpdate) -> dict[str, Any]:
    global _KNOWN_CUSTOMER_IDS
    customer_id = customer_id.strip()
    if not customer_id or len(customer_id) > 120:
        raise HTTPException(status_code=400, detail="Customer ID must contain 1 to 120 characters.")
    if _KNOWN_CUSTOMER_IDS is None:
        if not DATA_PATH.exists():
            raise HTTPException(status_code=503, detail="The demo customer dataset is not available.")
        _KNOWN_CUSTOMER_IDS = set(pd.read_csv(DATA_PATH, usecols=["Customer_ID"])["Customer_ID"].dropna().astype(str))
    if customer_id not in _KNOWN_CUSTOMER_IDS:
        raise HTTPException(status_code=404, detail="Customer was not found in the demo dataset.")
    return storage.set_review(customer_id, payload.reviewed)


@app.delete("/api/reviews")
def reset_review_state() -> dict[str, str]:
    storage.clear_reviews()
    return {"status": "ok", "message": "Demo review statuses reset."}


@app.get("/api/validation-checklist")
def get_validation_state() -> dict[str, Any]:
    return storage.list_validation(VALIDATION_TASK_IDS)


@app.get("/api/operations/summary")
def operations_summary() -> dict[str, Any]:
    """Return service-backed workflow counters for the demo workspace."""
    return storage.operations_summary(len(VALIDATION_TASK_IDS))


@app.put("/api/validation-checklist/{task_id}")
def update_validation_state(task_id: str, payload: ValidationUpdate) -> dict[str, Any]:
    if task_id not in VALIDATION_TASK_IDS:
        raise HTTPException(status_code=404, detail="Validation task was not found.")
    return storage.set_validation(task_id, payload.completed)


@app.delete("/api/validation-checklist")
def reset_validation_state() -> dict[str, str]:
    storage.clear_validation()
    return {"status": "ok", "message": "Demo validation progress reset."}


if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        requested = STATIC_DIR / full_path
        if full_path and requested.exists() and requested.is_file():
            return FileResponse(requested)
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend has not been built.")
