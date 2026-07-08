"""
Core database configuration for StadiumOps AI.
Provides real-time state persistence for tournament operations.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from typing import Generator

SQLALCHEMY_DATABASE_URL = "sqlite:///./stadiumops.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """Dependency injection to securely yield a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()