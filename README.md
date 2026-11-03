# Geldium AI Collections Intelligence Platform

A React + FastAPI decision-support prototype built to demonstrate the four deliverables from the Tata iQ / Forage data analytics simulation. It turns the Geldium customer delinquency analysis into an interactive dashboard, while explicitly distinguishing observed data from unvalidated rules and future model plans.

> **Important:** This is an educational demonstration, not a production credit-risk or collections system. No predictive model has been trained. The simulator uses transparent illustrative rules only. Do not use it to make real customer, credit, collections, penalty, account-restriction or legal-escalation decisions.

## Included capabilities

- Executive dashboard with descriptive customer counts, historical label distribution, monthly payment-status counts and segment comparisons.
- CSV upload and re-analysis through the FastAPI endpoint (10 MB / 10,000-row demonstration limits).
- Customer explorer with search, outcome filtering, record detail drawer and CSV export.
- Explainable risk simulator with adjustable inputs, visible rule triggers, support recommendations and an explicit human-oversight statement.
- Human-review queue with backend-saved review status and a recent activity trail in SQLite; it does not perform a financial action.
- Four-stage workflow view: data intake → assessment → support routing → learning and monitoring.
- Interactive pre-deployment checklist covering data readiness, model evaluation, fairness, privacy and pilot controls. Progress is stored by the backend in SQLite.
- Automated readiness scan for API availability, sample-data schema and quality warnings, SQLite access, and governance gaps; results are explicitly scoped to this demo.
- Responsible AI page covering fairness, explainability, privacy, compliance review and observed dataset-quality issues.
- Performance scorecard covering business and customer KPIs for a future controlled pilot.
- Responsive layout for desktop and tablet/mobile demonstrations.

## Data used

The app includes a CSV copy of the supplied `Delinquency_prediction_dataset.xlsx` in `backend/data/delinquency_sample.csv`. The workbook has 500 rows and 19 fields. The dataset-level descriptive checks in the earlier EDA work found:

- 80 of 500 records labelled delinquent (16.0%); 420 labelled not delinquent.
- 70 missing cells across 64 records.
- 141 records where the number of `Missed` entries across `Month_1`–`Month_6` exceeds `Missed_Payments`.
- 4 `Credit_Utilization` values greater than 1.0 if the field is stored as a proportion.
- Employment labels include inconsistent forms such as `EMP`, `Employed` and `employed`.
- Earlier EDA reported weak pairwise numeric correlations with the delinquency label. Candidate features therefore remain unproven.

These are descriptive findings for the supplied sample only. Card-type and location rate differences are unadjusted comparisons, not causal effects or a basis for treating any individual as high risk.

## Technology stack

- React 18 + Vite
- Recharts for data visualization
- Lucide React for interface icons
- Python 3.12 + FastAPI
- Pandas for CSV processing and exploratory summaries
- Docker for a single-service deployment (React static build served by FastAPI)

## Run locally (Windows, macOS or Linux)

### 1. Start the API

From the project root:

```bash
python -m venv .venv
```

Activate the environment:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

Install the API packages and start FastAPI:

```bash
pip install -r backend/requirements.txt
uvicorn main:app --app-dir backend --reload --port 8000
```

The API health check is available at `http://localhost:8000/api/health`.

### 2. Start the React website

Open a second terminal from the project root:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Vite proxies `/api` requests to FastAPI on port 8000.

### Optional: run the complete app in Docker

From the project root:

```bash
docker build -t geldium-collections-intelligence .
docker run --rm -p 10000:10000 geldium-collections-intelligence
```

Open `http://localhost:10000`.

## Deploy online with Render

The project is prepared for a single Render Docker Web Service, so the React UI and FastAPI endpoints share one public URL. Review status and checklist progress use a small SQLite state store (`GELDIUM_DB_PATH` can point it elsewhere). If the UI reaches an older backend that does not have the workspace routes yet, it falls back to browser-saved progress and labels that mode in the review/checklist screens; restart or redeploy the updated backend to enable shared SQLite state. This is demo persistence only: Render's free filesystem is ephemeral, so state can be cleared by a restart or redeploy. Use an external managed database and authentication before storing operational or customer data.

1. Create a GitHub repository and upload the **contents** of this folder. Keep `Dockerfile` and `render.yaml` at the repository root.
2. In Render, choose **New → Blueprint** and connect that GitHub repository.
3. Review the service details from `render.yaml`, then create the Blueprint. Render builds the Docker image and deploys the app as one service.
4. Open the Render URL after deployment. The dashboard and API share that URL; `/api/health` should return `status: ok`.

Uploading files to GitHub stores the project but does not publish a live website by itself. Connect the repository to Render as described above. The included Blueprint config requests Render's free plan; free services may spin down after inactivity. Uploaded data is processed for the response and is not saved as a user dataset.

## API smoke test

Run from the project root after installing the API dependencies:

```bash
python -m backend.smoke_test
```

## API endpoints

- `GET /api/health` — service status.
- `GET /api/sample` — analyse and return the included sample dataset.
- `POST /api/analyze` — upload and analyse a CSV file. Required columns: `Customer_ID` and `Delinquent_Account`.
- `POST /api/simulate` — return an explainable illustrative rule-based routing result for the entered scenario.
- `GET /api/reviews` — saved queue states and the latest 12 review activity events.
- `PUT /api/reviews/{customer_id}` — save a review state and add an activity event (`{"reviewed": true}`).
- `DELETE /api/reviews` — clear demo review states and their activity history.
- `GET /api/validation-checklist` — backend-saved completion for the supported checklist tasks.
- `PUT /api/validation-checklist/{task_id}` — save a checklist state (`{"completed": true}`).
- `DELETE /api/validation-checklist` — clear checklist progress.
- `GET /api/operations/summary` — backend counters for reviewed customers, checklist progress and review activity.
- `GET /api/preflight` — run technical checks and report model, fairness and privacy items that still need human review.

Interactive API documentation is available at `/docs` when the API is running.

## Demonstration guide for faculty

1. Start on **Overview** and explain the supplied dataset baseline and the major quality warnings.
2. Open **Customer explorer**, search a customer ID and inspect its source fields and six monthly payment labels.
3. Open **Risk simulator**, adjust the inputs and run the assessment. Explain each visible trigger and point out that it is a demonstration rule, not a trained model.
4. Open **Human review queue**, mark a case reviewed, and inspect the server-saved recent activity trail. Explain that sensitive cases require human attention; the status is only a demo record.
5. Open **AI workflow** and describe the four-stage model: input, decision, action and learning.
6. Open **Responsible AI** and discuss fairness tests, explainability, data privacy, compliance review and why validation is still pending.
7. Finish on **Performance** and explain how business KPIs and customer outcomes would be evaluated in a controlled pilot.

## What is implemented vs. what is proposed

| Capability | Status in this prototype |
|---|---|
| Exploratory analysis of the sample dataset | Implemented |
| CSV upload, validation and descriptive summary | Implemented |
| Customer table, filters and detail view | Implemented |
| Explainable illustrative rules simulator | Implemented; thresholds are demo assumptions |
| Human-review queue statuses and recent activity | Implemented with SQLite demo persistence; not an audit-grade or authenticated workflow |
| Workflow and governance views | Implemented as strategy visualization |
| Trained Logistic Regression / Decision Tree | Not implemented; Task 2 is a conceptual plan |
| Model validation, calibration and subgroup fairness results | Not available; required before a real pilot |
| Real SMS/email, CRM or payment integrations | Not implemented |
| Authentication, managed database and production audit service | Not implemented |

## Responsible use and security notes

- Do not upload personal, confidential or real customer financial information to the public demo.
- The app has no authentication or role-based access control; it is not suitable for production or sensitive data.
- CSV contents are processed by the API and returned to the browser. The application does not intentionally write uploaded files to disk or store them in a database.
- For a production system, add authentication, encryption, audit logging, retention controls, approved data governance, security testing, legal review and model-risk management.
- Do not use age, location, employment status or other possible proxy attributes to make adverse decisions without a documented purpose and lawful review.

## Project structure

```text
Geldium_AI_Collections_Platform/
├── backend/
│   ├── data/delinquency_sample.csv
│   ├── main.py
│   ├── storage.py
│   └── requirements.txt
├── frontend/
│   ├── src/App.jsx
│   ├── src/main.jsx
│   ├── src/styles.css
│   ├── package.json
│   └── vite.config.js
├── docs/
├── reference_deliverables/   # Task 1–4 reports, slides and source data
├── Dockerfile
├── render.yaml
└── README.md
```
