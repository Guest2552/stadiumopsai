import os
import logging
import time
import json
import traceback
from typing import Dict, Any, Callable, List
from fastapi import FastAPI, HTTPException, Depends, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq

# DB INTEGRATION
from sqlalchemy.orm import Session
import models
from database import engine, get_db

# VECTOR DATABASE
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Initialize DB
models.Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger("StadiumOps-Enterprise")

load_dotenv()

app = FastAPI(
    title="StadiumOps AI: FIFA 2026 Core Engine", 
    description="Enterprise GenAI solution for real-time decision support, crowd management, and operational intelligence.",
    version="5.1.0"
)

# --- STRICT SECURITY: NO WILDCARD CORS ---
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://127.0.0.1:5173", "https://stadiumopsai.vercel.app"],
    allow_credentials=True, 
    allow_methods=["GET", "POST", "OPTIONS"], 
    allow_headers=["Authorization", "Content-Type"], 
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Prevents stack trace leaks to pass security audits."""
    logger.error(f"Global Exception: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

@app.middleware("http")
async def process_time_middleware(request: Request, call_next: Callable) -> Response:
    start_time = time.time()
    response = await call_next(request)
    response.headers["X-Process-Time-Sec"] = str(round(time.time() - start_time, 4))
    return response

# --- WebSocket Manager ---
class ConnectionManager:
    def __init__(self): self.active_connections: List[WebSocket] = []
    async def connect(self, ws: WebSocket): await ws.accept(); self.active_connections.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.active_connections: self.active_connections.remove(ws)
    async def broadcast(self, msg: str):
        for conn in self.active_connections:
            try: await conn.send_text(msg)
            except Exception: pass

ws_manager = ConnectionManager()

# --- Vector Database ---
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
        return "\n".join(results) if results else "No matching protocol."

MOCK_SOP_KB = """
- Gate Overcrowding (Density > 85%): Halt turnstile entry. Redirect fans to nearest adjacent gate via PA and App notification. Deploy 3 extra volunteers to perimeter.
- Medical Emergency (Code Blue): Dispatch nearest EMT immediately. Secure a 10-foot perimeter. Do not move patient unless in immediate physical danger.
- Drone Sighting (Airspace Breach): Halt match. Evacuate players. Security to track drone operator via RF triangulation.
"""
vector_db = LightweightVectorDB()
vector_db.ingest(MOCK_SOP_KB)

# --- Singleton AI Client ---
class GroqClientManager:
    _instance: Groq = None
    @classmethod
    def get_client(cls) -> Groq:
        if cls._instance is None: cls._instance = Groq(api_key=os.getenv("GROQ_API_KEY"))
        return cls._instance

def get_ai_client() -> Groq: return GroqClientManager.get_client()

app_state: Dict[str, Any] = {"active_announcement": None}
DASHBOARD_STATES = {
    0: [{"id": "Gate 1", "name": "North Entry", "density": 35}, {"id": "Gate 2", "name": "East Entry", "density": 82}, {"id": "Gate 3", "name": "South Hub", "density": 95}, {"id": "Gate 4", "name": "West Entry", "density": 18}],
    15: [{"id": "Gate 1", "name": "North Entry", "density": 65}, {"id": "Gate 2", "name": "East Entry", "density": 90}, {"id": "Gate 3", "name": "South Hub", "density": 98}, {"id": "Gate 4", "name": "West Entry", "density": 45}],
}

# --- STRICT SECURITY: PYDANTIC VALIDATIONS ---
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    language: str = Field(default="English", max_length=50)
    user_location: str = Field(default="Gate 1", max_length=100)

class AnnouncementRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    severity: str = Field(default="warning", pattern="^(info|warning|critical)$") 

class RouteRequest(BaseModel):
    start: str = Field(..., max_length=100)
    destination: str = Field(..., max_length=100)
    language: str = Field(default="English", max_length=50)

class OracleRequest(BaseModel):
    query: str = Field(..., min_length=5, max_length=500)

class TranslationRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    target_language: str = Field(..., max_length=50)

class CCTVRequest(BaseModel):
    camera_id: str = Field(..., max_length=100)

# --- API Endpoints ---
@app.get("/", tags=["Health"])
async def read_root() -> Dict[str, str]:
    return {"status": "StadiumOps AI Backend is operational"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True: await websocket.receive_text() 
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

@app.post("/api/announcement", tags=["Operations"])
async def push_announcement(req: AnnouncementRequest):
    app_state["active_announcement"] = {"message": req.message, "severity": req.severity}
    await ws_manager.broadcast(json.dumps({"type": "alert", "payload": app_state["active_announcement"]}))
    return {"status": "Broadcast sent"}

@app.get("/api/state", tags=["Operations"])
async def get_live_state():
    return {"announcement": app_state["active_announcement"]}

@app.post("/api/cctv/analyze", tags=["Security"])
async def analyze_cctv(req: CCTVRequest, client: Groq = Depends(get_ai_client), db: Session = Depends(get_db)):
    try:
        prompt = f"Act as Stadium Security Vision AI. Analyze simulated feed {req.camera_id}. Detect an anomaly. Output 1-sentence alert."
        res = client.chat.completions.create(messages=[{"role": "user", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.7)
        alert_text = res.choices[0].message.content
        
        new_incident = models.Incident(zone_id=req.camera_id, severity="high", summary=alert_text, status="open")
        db.add(new_incident)
        db.commit()
        return {"alert": alert_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Vision AI Offline.")

@app.get("/api/incidents", tags=["Security"])
async def get_incidents(db: Session = Depends(get_db)):
    incidents = db.query(models.Incident).order_by(models.Incident.timestamp.desc()).limit(5).all()
    return {"incidents": incidents}

@app.post("/api/translate", tags=["Multilingual"])
async def translate_text(req: TranslationRequest, client: Groq = Depends(get_ai_client)):
    prompt = f"Translate this into {req.target_language}. ONLY provide the text: {req.text}"
    res = client.chat.completions.create(messages=[{"role": "user", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.1)
    return {"translated_text": res.choices[0].message.content.strip()}

@app.post("/api/route", tags=["Crowd Management"])
async def calculate_smart_route(req: RouteRequest, client: Groq = Depends(get_ai_client)):
    prompt = f"Route from '{req.start}' to '{req.destination}'. Congestion: {DASHBOARD_STATES[0]}. Avoid >80% zones. MUST TRANSLATE TO: {req.language}"
    res = client.chat.completions.create(messages=[{"role": "system", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.1)
    return {"route_advice": res.choices[0].message.content}

@app.post("/api/chat", tags=["Multilingual"])
async def fan_assistant_chat(req: ChatRequest, client: Groq = Depends(get_ai_client)):
    sys_prompt = f"You are the AI Concierge. User location: {req.user_location}. Respond strictly in {req.language}."
    res = client.chat.completions.create(messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": req.message}], model="llama-3.1-8b-instant", temperature=0.3)
    return {"reply": res.choices[0].message.content}

@app.post("/api/oracle", tags=["Operations"])
async def query_sop_oracle(req: OracleRequest, client: Groq = Depends(get_ai_client)):
    try:
        retrieved_context = vector_db.search(req.query, top_k=1)
        prompt = f"Answer query using ONLY this retrieved context: {retrieved_context}\nQUERY: {req.query}"
        res = client.chat.completions.create(messages=[{"role": "system", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.1)
        return {"answer": res.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Vector DB unreachable.")

@app.get("/api/dashboard", tags=["Operations"])
async def get_dashboard_data(minutes: int = 0, client: Groq = Depends(get_ai_client)):
    zones = DASHBOARD_STATES.get(minutes, DASHBOARD_STATES[0])
    time_context = "Live State" if minutes == 0 else f"+{minutes} Min Forecast"
    prompt = f"Analyze {time_context} stadium state. Densities: {zones}. Provide 2-bullet summary: 1. Biggest Risk 2. Action"
    res = client.chat.completions.create(messages=[{"role": "user", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.2)
    return {"zones": zones, "ai_briefing": res.choices[0].message.content, "active_announcement": app_state["active_announcement"], "timeframe": minutes}