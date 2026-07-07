"""
Database models for StadiumOps AI.
Defines the schema for Users, Incidents, and Crowd Metrics.
"""
from sqlalchemy import Column, Integer, String, DateTime
import datetime
from database import Base

class User(Base):
    """Represents a stadium fan, volunteer, or admin."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    role = Column(String, default="fan") # Options: fan, volunteer, admin
    language = Column(String, default="en")

class Incident(Base):
    """Represents an operational incident reported in the stadium."""
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, index=True)
    severity = Column(String) # low, medium, high
    summary = Column(String)
    status = Column(String, default="open") # open, resolved
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class CrowdMetric(Base):
    """Stores historical and live crowd density metrics for AI forecasting."""
    __tablename__ = "crowd_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, index=True)
    density = Column(String) # Percentage 0-100
    wait_time_minutes = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)