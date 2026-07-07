"""
Database configuration and connection management.
Utilizes SQLite for rapid hackathon prototyping with SQLAlchemy ORM.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import Generator

# SQLite database URL
SQLALCHEMY_DATABASE_URL = "sqlite:///./stadiumops.db"

# Create the SQLAlchemy engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False} # Required for SQLite in FastAPI
)

# Create a SessionLocal class for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for the database models
Base = declarative_base()

def get_db() -> Generator:
    """
    Dependency to get a database session for each request.
    Ensures the database connection is closed after the request is complete.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()