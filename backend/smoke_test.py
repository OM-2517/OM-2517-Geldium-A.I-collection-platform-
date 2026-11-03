"""Simple API smoke tests; run from project root with: python -m backend.smoke_test"""
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

health = client.get('/api/health')
assert health.status_code == 200 and health.json()['status'] == 'ok'

sample = client.get('/api/sample')
assert sample.status_code == 200
summary = sample.json()['summary']
assert summary['total_customers'] == 500
assert summary['delinquent_count'] == 80
assert summary['missing_cells'] == 70
assert sample.json()['quality']['payment_history_mismatches'] == 141

simulation = client.post('/api/simulate', json={
    'missed_payments': 4,
    'utilization_pct': 92,
    'dti_pct': 46,
    'credit_score': 550,
    'recent_missed_months': 3,
})
assert simulation.status_code == 200
assert simulation.json()['tone'] == 'high'
assert 'not a trained' in simulation.json()['disclaimer']

with open('backend/data/delinquency_sample.csv', 'rb') as csv_file:
    upload = client.post('/api/analyze', files={'file': ('sample.csv', csv_file, 'text/csv')})
assert upload.status_code == 200
assert upload.json()['summary']['total_customers'] == 500

print('PASS: health, sample dataset, risk simulator and CSV upload endpoints.')
