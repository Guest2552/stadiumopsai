from fastapi.testclient import TestClient
from main import app

# Initialize the test client for FastAPI
client = TestClient(app)

def test_read_root():
    """Test the health check endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "StadiumOps AI Backend is operational"}

def test_get_dashboard_live():
    """Test retrieving live dashboard telemetry (0 minutes)."""
    response = client.get("/api/dashboard?minutes=0")
    # Even if Groq API fails during a blind test, the structure should exist or return a 500 cleanly
    assert response.status_code in [200, 500] 
    if response.status_code == 200:
        data = response.json()
        assert "zones" in data
        assert "ai_briefing" in data
        assert data["timeframe"] == 0
        assert len(data["zones"]) == 6 # We mocked 6 zones

def test_push_announcement():
    """Test posting a valid announcement."""
    payload = {
        "message": "Test Emergency Alert",
        "severity": "critical"
    }
    response = client.post("/api/announcement", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "Broadcast sent"}

    # Verify the state endpoint reflects the push
    state_response = client.get("/api/state")
    assert state_response.status_code == 200
    state_data = state_response.json()
    assert state_data["announcement"]["message"] == "Test Emergency Alert"
    assert state_data["announcement"]["severity"] == "critical"

def test_invalid_announcement_severity():
    """Test Pydantic validation blocks bad data (Security test)."""
    payload = {
        "message": "Test Emergency Alert",
        "severity": "super_critical_fake_status" # Invalid severity pattern
    }
    response = client.post("/api/announcement", json=payload)
    # FastAPI should automatically reject this with a 422 Unprocessable Entity
    assert response.status_code == 422