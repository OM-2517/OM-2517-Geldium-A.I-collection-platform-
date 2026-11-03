@echo off
setlocal
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo Creating Python environment...
  py -m venv .venv
)
echo Installing API dependencies...
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
start "Geldium API" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --reload --port 8000"
cd frontend
echo Installing React dependencies...
call npm install
start "Geldium Website" cmd /k "npm run dev"
echo.
echo API:     http://localhost:8000/api/health
echo Website: http://localhost:5173
echo Close the two terminal windows to stop the application.
endlocal
