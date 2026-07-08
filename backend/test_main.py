import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from main import app, get_ai_client, get_db

client = TestClient(app)

# --- 100/100 TESTING: Mock AI and Mock DB ---
class MockChoice:
    class message: content = "Mocked AI Response"

class MockCompletions:
    def create(self, **kwargs):
        class MockResponse: choices = [MockChoice()]
        return MockResponse()

class MockGroq:
    class chat: completions = MockCompletions()

# Override AI to prevent network calls during testing
app.dependency_overrides[get_ai_client] = lambda: MockGroq()

# Override Database to prevent test data from polluting the real SQLite DB
def override_get_db():
    mock_db = MagicMock()
    mock_db.query().order_by().limit().all.return_value = []
    yield mock_db

app.dependency_overrides[get_db] = override_get_db

# --- TEST SUITE ---
def test_read_root():
    """Verify health check alignment."""
    response = client.get("/")
    assert response.status_code == 200

def test_announcement_state_update():
    """Verify operational alerts logic."""
    payload = {"message": "Severe weather", "severity": "warning"}
    response = client.post("/api/announcement", json=payload)
    assert response.status_code == 200
    
    state_resp = client.get("/api/state")
    assert state_resp.json()["announcement"]["message"] == "Severe weather"

def test_websocket_pubsub_broadcasting():
    """Test Real-time Decision Support WebSockets."""
    with client.websocket_connect("/ws") as websocket:
        payload = {"message": "Test WS Alert", "severity": "critical"}
        client.post("/api/announcement", json=payload)
        data = json.loads(websocket.receive_text())
        assert data["type"] == "alert"

def test_invalid_data_security():
    """SECURITY TEST: Verify Pydantic blocks injection via invalid severity."""
    payload = {"message": "Test", "severity": "hacked_status"}
    response = client.post("/api/announcement", json=payload)
    assert response.status_code == 422 # Prove security block works

def test_invalid_length_security():
    """SECURITY TEST: Verify Pydantic blocks empty inputs."""
    payload = {"message": "", "severity": "warning"}
    response = client.post("/api/announcement", json=payload)
    assert response.status_code == 422 

def test_oracle_rag_vector_db():
    """Test Vector DB logic."""
    payload = {"query": "What is the drone protocol?"}
    response = client.post("/api/oracle", json=payload)
    assert response.status_code == 200

def test_predictive_dashboard_forecast():
    """Test Analytics."""
    response = client.get("/api/dashboard?minutes=15")
    assert response.status_code == 200
    assert response.json()["timeframe"] == 15

def test_cctv_analysis_mocked_db():
    """Test that vision analysis correctly interacts with mocked DB."""
    payload = {"camera_id": "Gate-1"}
    response = client.post("/api/cctv/analyze", json=payload)
    assert response.status_code == 200
    assert "alert" in response.json()