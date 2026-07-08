import pytest
import json
from fastapi.testclient import TestClient
from main import app, get_ai_client

# Initialize the test client for FastAPI
client = TestClient(app)

# --- ADVANCED: Dependency Override for AI Client ---
# This intercepts FastAPI's 'Depends' system and injects a fake Groq client.
# This guarantees tests run in 0.01 seconds and never make external internet calls.
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

# Override the production AI client with our Mock client for testing
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
    
    # Poll the state to ensure the variables updated
    state_resp = client.get("/api/state")
    assert state_resp.status_code == 200
    assert state_resp.json()["announcement"]["message"] == "Severe weather approaching"

def test_websocket_pubsub_broadcasting():
    """
    ADVANCED: Tests the Event-Driven Architecture.
    Opens a live WebSocket, triggers a REST API broadcast, and verifies the WS catches it.
    """
    with client.websocket_connect("/ws") as websocket:
        # Trigger an announcement via the standard REST API
        payload = {"message": "Test WS Alert: Evacuate Gate 3", "severity": "critical"}
        client.post("/api/announcement", json=payload)
        
        # The websocket should instantly receive the broadcast payload
        data = websocket.receive_text()
        message_data = json.loads(data)
        
        assert message_data["type"] == "alert"
        assert message_data["payload"]["message"] == "Test WS Alert: Evacuate Gate 3"
        assert message_data["payload"]["severity"] == "critical"

def test_cctv_vision_endpoint():
    """Tests the Multimodal CCTV Anomaly detection endpoint."""
    payload = {"camera_id": "Gate-3-Cam"}
    response = client.post("/api/cctv/analyze", json=payload)
    assert response.status_code == 200
    assert response.json() == {"alert": "Mocked AI Response"}

def test_oracle_rag_vector_db():
    """Tests the True Vector Database integration and retrieval logic."""
    payload = {"query": "What is the Code Blue medical protocol?"}
    response = client.post("/api/oracle", json=payload)
    assert response.status_code == 200
    # Because we mocked the AI, it should return our static mock string
    assert response.json() == {"answer": "Mocked AI Response"}

def test_predictive_dashboard_forecast():
    """Tests the predictive analytics and timeframe parameter."""
    response = client.get("/api/dashboard?minutes=15")
    assert response.status_code == 200
    
    data = response.json()
    assert "zones" in data
    assert data["timeframe"] == 15
    assert data["ai_briefing"] == "Mocked AI Response"

def test_invalid_data_security():
    """Security Test: Verify Pydantic blocks invalid injection payloads."""
    payload = {
        "message": "Test",
        "severity": "invalid_status_code" # Does not match the regex pattern
    }
    response = client.post("/api/announcement", json=payload)
    assert response.status_code == 422 # 422 Unprocessable Entity is expected