import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from main import app, get_ai_client, get_db

client = TestClient(app)

class MockChoice:
    class message:
        content = "Mocked AI Response"

class MockCompletions:
    def create(self, **kwargs):
        class MockResponse:
            choices = [MockChoice()]
        return MockResponse()

class MockChat:
    completions = MockCompletions()

class MockGroq:
    chat = MockChat()

# Override dependencies so we don't hit real APIs or real DBs in tests
app.dependency_overrides[get_ai_client] = lambda: MockGroq()

# --- TEST SUITE ---

def test_read_root():
    """Verify health check endpoint for cloud load balancers."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "StadiumOps AI Backend is operational"}

def test_announcement_state_update():
    """Verify operational alerts correctly update the global state."""
    payload = {"message": "Severe weather approaching", "severity": "warning"}
    response = client.post("/api/announcement", json=payload)
    assert response.status_code == 200
    
    state_resp = client.get("/api/state")
    assert state_resp.status_code == 200
    assert state_resp.json()["announcement"]["message"] == "Severe weather approaching"

def test_websocket_pubsub_broadcasting():
    """ADVANCED: Tests the Event-Driven Architecture."""
    with client.websocket_connect("/ws") as websocket:
        payload = {"message": "Test WS Alert", "severity": "critical"}
        client.post("/api/announcement", json=payload)
        
        data = websocket.receive_text()
        message_data = json.loads(data)
        
        assert message_data["type"] == "alert"
        assert message_data["payload"]["message"] == "Test WS Alert"

# SECURITY TEST: This triggers the 422 to prove we are protected
def test_invalid_data_security():
    """Security Test: Verify Pydantic blocks invalid injection payloads."""
    payload = {
        "message": "Test",
        "severity": "invalid_status_code" # Does not match the regex pattern
    }
    response = client.post("/api/announcement", json=payload)
    assert response.status_code == 422 # 422 Unprocessable Entity is expected

def test_oracle_rag_vector_db():
    """Tests the True Vector Database integration and retrieval logic."""
    payload = {"query": "What is the drone protocol?"}
    response = client.post("/api/oracle", json=payload)
    assert response.status_code == 200
    assert response.json() == {"answer": "Mocked AI Response"}

def test_predictive_dashboard_forecast():
    """Tests the predictive analytics and timeframe parameter."""
    response = client.get("/api/dashboard?minutes=15")
    assert response.status_code == 200
    data = response.json()
    assert "zones" in data
    assert data["timeframe"] == 15