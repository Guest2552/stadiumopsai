import os
import logging
import time
import json
from typing import Dict, Any, Callable, List
from fastapi import FastAPI, HTTPException, Depends, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq

# --- ADVANCED DB INTEGRATION ---
from sqlalchemy.orm import Session
import models
from database import engine, get_db

# Create SQLite tables automatically on startup
models.Base.metadata.create_all(bind=engine)

# ADVANCED: In-Memory Vector Database for True RAG
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger("StadiumOps-Enterprise")

load_dotenv()

app = FastAPI(title="StadiumOps AI: FIFA 2026 Core Engine", version="5.0.0")

# SECURITY: Restrict CORS to specific frontend origins instead of wildcards ["*"]
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://stadiumopsai.vercel.app/")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["GET", "POST"], # Restrict allowed methods
    allow_headers=["Authorization", "Content-Type"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# --- ADVANCED: True Vector Database (RAG) ---
class LightweightVectorDB:
    def __init__(self):
        self.documents = []
        self.vectorizer = TfidfVectorizer(stop_words='english')
        self.vectors = None

    def ingest(self, text_corpus: str):
        self.documents = [doc.strip() for doc in text_corpus.split('- ') if doc.strip()]
        self.vectors = self.vectorizer.fit_transform(self.documents)

    def search(self, query: str, top_k: int = 1) -> str:
        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self.vectors).flatten()
        top_indices = similarities.argsort()[-top_k:][::-1]
        results = [self.documents[i] for i in top_indices if similarities[i] > 0.1]
        return "\n".join(results) if results else "No matching protocol found in the SOP."

MOCK_SOP_KB = """
- Gate Overcrowding (Density > 85%): Halt turnstile entry. Redirect fans to nearest adjacent gate via PA and App notification. Deploy 3 extra volunteers to perimeter.
- Medical Emergency (Code Blue): Dispatch nearest EMT immediately. Secure a 10-foot perimeter. Do not move patient unless in immediate physical danger.
- Lost Child (Code Yellow): Escort child to nearest Guest Services booth. Announce description of parents on staff radio channel 4. Do NOT announce child's name on public PA system.
- Drone Sighting (Airspace Breach): Halt match. Evacuate players. Security to track drone operator via RF triangulation.
"""
vector_db = LightweightVectorDB()
vector_db.ingest(MOCK_SOP_KB)

# --- Singleton Groq Client ---
class GroqClientManager:
    _instance: Groq = None
    @classmethod
    def get_client(cls) -> Groq:
        if cls._instance is None:
            cls._instance = Groq(api_key=os.getenv("GROQ_API_KEY"))
        return cls._instance

def get_ai_client() -> Groq:
    return GroqClientManager.get_client()

# --- Data Models ---
app_state: Dict[str, Any] = {"active_announcement": None}

DASHBOARD_STATES = {
    0: [{"id": "Gate 1", "name": "North Entry", "density": 35}, {"id": "Gate 2", "name": "East Entry", "density": 82}, {"id": "Gate 3", "name": "South Hub", "density": 95}, {"id": "Gate 4", "name": "West Entry", "density": 18}],
    15: [{"id": "Gate 1", "name": "North Entry", "density": 65}, {"id": "Gate 2", "name": "East Entry", "density": 90}, {"id": "Gate 3", "name": "South Hub", "density": 98}, {"id": "Gate 4", "name": "West Entry", "density": 45}],
}

# --- Strict Security Pydantic Validations ---
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    language: str = Field(default="English")
    user_location: str = Field(default="Gate 1")

class AnnouncementRequest(BaseModel):
    message: str = Field(..., min_length=1)
    severity: str = Field(default="warning", pattern="^(info|warning|critical)$") 

class RouteRequest(BaseModel):
    start: str
    destination: str
    language: str = "English"

class OracleRequest(BaseModel):
    query: str

class TranslationRequest(BaseModel):
    text: str
    target_language: str

class CCTVRequest(BaseModel):
    camera_id: str

# --- API Endpoints ---
@app.get("/")
async def read_root() -> Dict[str, str]:
    return {"status": "StadiumOps AI Backend is operational"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() 
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

@app.post("/api/announcement")
async def push_announcement(req: AnnouncementRequest):
    app_state["active_announcement"] = {"message": req.message, "severity": req.severity}
    await ws_manager.broadcast(json.dumps({"type": "alert", "payload": app_state["active_announcement"]}))
    return {"status": "Broadcast sent"}

@app.get("/api/state")
async def get_live_state():
    return {"announcement": app_state["active_announcement"]}

# ADVANCED DB INTEGRATION: Save CCTV findings to SQLite
@app.post("/api/cctv/analyze")
async def analyze_cctv(req: CCTVRequest, client: Groq = Depends(get_ai_client), db: Session = Depends(get_db)):
    try:
        prompt = f"Act as a Stadium Security Vision AI. Analyze the simulated live camera feed from {req.camera_id}. Randomly detect a realistic operational anomaly. Output a highly professional, 1-sentence security alert."
        res = client.chat.completions.create(messages=[{"role": "user", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.7)
        alert_text = res.choices[0].message.content
        
        # Insert the AI-generated incident into the SQLite Database
        new_incident = models.Incident(
            zone_id=req.camera_id, 
            severity="high", 
            summary=alert_text,
            status="open"
        )
        db.add(new_incident)
        db.commit()
        
        return {"alert": alert_text}
    except Exception as e:
        logger.error(f"Vision DB Error: {e}")
        raise HTTPException(status_code=500, detail="Vision AI Offline.")

# NEW DB ENDPOINT: Fetch all saved incidents
@app.get("/api/incidents")
async def get_incidents(db: Session = Depends(get_db)):
    """Fetches the audit log of all historical AI-detected incidents."""
    incidents = db.query(models.Incident).order_by(models.Incident.timestamp.desc()).limit(5).all()
    return {"incidents": incidents}

@app.post("/api/translate")
async def translate_text(req: TranslationRequest, client: Groq = Depends(get_ai_client)):
    prompt = f"Translate this into {req.target_language}. ONLY provide the text: {req.text}"
    res = client.chat.completions.create(messages=[{"role": "user", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.1)
    return {"translated_text": res.choices[0].message.content.strip()}

@app.post("/api/route")
async def calculate_smart_route(req: RouteRequest, client: Groq = Depends(get_ai_client)):
    prompt = f"Routing Engine. Route from '{req.start}' to '{req.destination}'. Live congestion: {DASHBOARD_STATES[0]}. Avoid >80% zones. 2 sentences. MUST TRANSLATE TO: {req.language}"
    res = client.chat.completions.create(messages=[{"role": "system", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.1)
    return {"route_advice": res.choices[0].message.content}

@app.post("/api/chat")
async def fan_assistant_chat(req: ChatRequest, client: Groq = Depends(get_ai_client)):
    sys_prompt = f"You are the AI Concierge. User location: {req.user_location}. Respond strictly in {req.language}."
    res = client.chat.completions.create(messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": req.message}], model="llama-3.1-8b-instant", temperature=0.3)
    return {"reply": res.choices[0].message.content}

@app.post("/api/oracle")
async def query_sop_oracle(req: OracleRequest, client: Groq = Depends(get_ai_client)):
    try:
        retrieved_context = vector_db.search(req.query, top_k=1)
        prompt = f"Answer operator query using ONLY this retrieved context: {retrieved_context}\nQUERY: {req.query}"
        res = client.chat.completions.create(messages=[{"role": "system", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.1)
        return {"answer": res.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Vector DB unreachable.")

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