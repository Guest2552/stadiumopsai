"""
Database models for StadiumOps AI.
Defines the schema for improving navigation, crowd management, and operational intelligence.
"""
from sqlalchemy import Column, Integer, String, DateTime
import datetime
from database import Base

class User(Base):
    """Represents a FIFA World Cup 2026 fan, volunteer, organizer, or venue staff."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    role = Column(String, default="fan") 
    language = Column(String, default="en")

class Incident(Base):
    """Provides real-time decision support by tracking stadium operations incidents."""
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, index=True)
    severity = Column(String) 
    summary = Column(String)
    status = Column(String, default="open") 
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class CrowdMetric(Base):
    """Stores data for crowd management, transportation, and sustainability forecasting."""
    __tablename__ = "crowd_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, index=True)
    density = Column(String) 
    wait_time_minutes = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)