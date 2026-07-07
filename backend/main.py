import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq
import models
from database import engine
models.Base.metadata.create_all(bind=engine)

# Configure secure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

app = FastAPI(
    title="StadiumOps AI Core API",
    description="Enterprise-grade AI routing and operational forecasting for FIFA 2026.",
    version="1.0.0"
)

# SECURITY: Restrict CORS to specific frontend origins instead of wildcards ["*"]
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["GET", "POST"], # Restrict allowed methods
    allow_headers=["Authorization", "Content-Type"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# --- Global State & Mock Data ---
app_state = {
    "active_announcement": None,
}

MOCK_SOP_KB = """
STANDARD OPERATING PROCEDURES (FIFA WORLD CUP 2026)
- Gate Overcrowding (Density > 85%): Halt turnstile entry. Redirect fans to nearest adjacent gate via PA and App notification. Deploy 3 extra volunteers to perimeter.
- Medical Emergency (Code Blue): Dispatch nearest EMT immediately. Secure a 10-foot perimeter. Do not move patient unless in immediate physical danger.
- Lost Child (Code Yellow): Escort child to nearest Guest Services booth. Announce description of parents on staff radio channel 4. Do NOT announce child's name on public PA system.
- Power Outage (Localized): Activate backup generators. Keep fans in seats. Do not evacuate unless fire or structural damage is confirmed.
"""

DASHBOARD_STATES = {
    0: [
        {"id": "Gate 1", "name": "North Entry", "density": 35},
        {"id": "Gate 2", "name": "East Entry", "density": 82},
        {"id": "Gate 3", "name": "South Hub", "density": 95}, 
        {"id": "Gate 4", "name": "West Entry", "density": 18},
        {"id": "Section 204", "name": "Upper Stand 204", "density": 30},
        {"id": "Food Court B", "name": "Food Court B", "density": 40},
    ],
    15: [
        {"id": "Gate 1", "name": "North Entry", "density": 65},
        {"id": "Gate 2", "name": "East Entry", "density": 90},
        {"id": "Gate 3", "name": "South Hub", "density": 98}, 
        {"id": "Gate 4", "name": "West Entry", "density": 45},
        {"id": "Section 204", "name": "Upper Stand 204", "density": 75},
        {"id": "Food Court B", "name": "Food Court B", "density": 85},
    ],
    30: [
        {"id": "Gate 1", "name": "North Entry", "density": 5},
        {"id": "Gate 2", "name": "East Entry", "density": 10},
        {"id": "Gate 3", "name": "South Hub", "density": 12}, 
        {"id": "Gate 4", "name": "West Entry", "density": 5},
        {"id": "Section 204", "name": "Upper Stand 204", "density": 98}, 
        {"id": "Food Court B", "name": "Food Court B", "density": 15},
    ]
}

# --- Pydantic Schemas (SECURITY: Added Field validations to prevent payload attacks) ---
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    language: str = Field(default="English", max_length=50)
    user_location: str = Field(default="Gate 1", max_length=100)

class AnnouncementRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    severity: str = Field(default="info", pattern="^(info|warning|critical)$") 

class RouteRequest(BaseModel):
    start: str = Field(..., max_length=100)
    destination: str = Field(..., max_length=100)
    language: str = Field(default="English", max_length=50)

class OracleRequest(BaseModel):
    query: str = Field(..., min_length=5, max_length=500)

class TranslationRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    target_language: str = Field(..., max_length=50)

# --- API Endpoints ---
@app.get("/", tags=["Health"])
def read_root() -> dict:
    """Verifies that the API is running and accessible."""
    return {"status": "StadiumOps AI Backend is operational"}

@app.post("/api/announcement", tags=["Operations"])
def push_announcement(req: AnnouncementRequest) -> dict:
    """Pushes a global alert banner to all connected fan devices."""
    app_state["active_announcement"] = {"message": req.message, "severity": req.severity}
    return {"status": "Broadcast sent"}

@app.get("/api/state", tags=["Client Polling"])
def get_live_state() -> dict:
    """Allows client devices to poll for the latest active announcements."""
    return {"announcement": app_state["active_announcement"]}

@app.post("/api/translate", tags=["AI Services"])
def translate_text(req: TranslationRequest) -> dict:
    """Translates operational text strictly into the target language."""
    try:
        translate_prompt = f"Translate this into {req.target_language}. ONLY provide the text: {req.text}"
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": translate_prompt}],
            model="llama-3.1-8b-instant", temperature=0.1
        )
        return {"translated_text": completion.choices[0].message.content.strip()}
    except Exception as e:
        logger.error(f"Translation Error: {e}")
        raise HTTPException(status_code=500, detail="Translation service temporarily unavailable.")

@app.post("/api/route", tags=["AI Services"])
def calculate_smart_route(req: RouteRequest) -> dict:
    """Generates a crowd-aware safe route avoiding bottlenecks."""
    try:
        route_prompt = f"""
        You are the StadiumOps Routing Engine. 
        A fan needs to get from '{req.start}' to '{req.destination}'.
        Live congestion: {DASHBOARD_STATES[0]}
        Rules: Avoid zones > 80% density. Keep it to 2 sentences. 
        MUST TRANSLATE ENTIRE RESPONSE TO: {req.language}
        """
        completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": route_prompt}],
            model="llama-3.1-8b-instant", temperature=0.1
        )
        return {"route_advice": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"Routing Error: {e}")
        raise HTTPException(status_code=500, detail="Routing engine unavailable.")

@app.post("/api/chat", tags=["AI Services"])
def fan_assistant_chat(request: ChatRequest) -> dict:
    """Handles multilingual fan queries using contextual location data."""
    try:
        sys_prompt = f"You are the AI Concierge. User location: {request.user_location}. Respond strictly in {request.language}. Be concise."
        completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": request.message}],
            model="llama-3.1-8b-instant", temperature=0.3
        )
        return {"reply": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"Chat Error: {e}")
        # SECURITY: Do not leak stack traces to client
        raise HTTPException(status_code=500, detail="AI Assistant is currently overloaded.")

@app.post("/api/oracle", tags=["Operations"])
def query_sop_oracle(req: OracleRequest) -> dict:
    """RAG endpoint for Command Center staff to query standard operating procedures."""
    try:
        oracle_prompt = f"""
        You are the Command Center SOP Oracle. Answer the operator's query using ONLY the rules below.
        If the answer is not in the text, state that no protocol was found.
        SOP DOCUMENT: {MOCK_SOP_KB}
        OPERATOR QUERY: {req.query}
        """
        completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": oracle_prompt}],
            model="llama-3.1-8b-instant", temperature=0.1
        )
        return {"answer": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"Oracle Error: {e}")
        raise HTTPException(status_code=500, detail="SOP Database unreachable.")

@app.get("/api/dashboard", tags=["Operations"])
def get_dashboard_data(minutes: int = 0) -> dict:
    """Retrieves live or predictive density data and generates an AI risk briefing."""
    try:
        zones = DASHBOARD_STATES.get(minutes, DASHBOARD_STATES[0])
        time_context = "Live Current State"
        if minutes == 15: time_context = "+15 Minutes (Pre-Kickoff Forecast)"
        elif minutes == 30: time_context = "+30 Minutes (Match Active Forecast)"

        analysis_prompt = f"""
        Analyze this stadium state: {time_context}. Densities: {zones}.
        Provide a 2-bullet executive summary: 1. Biggest Risk 2. Recommended Action
        """
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": analysis_prompt}],
            model="llama-3.1-8b-instant", temperature=0.2
        )
        
        return {
            "zones": zones,
            "ai_briefing": completion.choices[0].message.content,
            "active_announcement": app_state["active_announcement"],
            "timeframe": minutes
        }
    except Exception as e:
        logger.error(f"Dashboard Error: {e}")
        raise HTTPException(status_code=500, detail="Telemetry sync failed.")