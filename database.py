import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL
from sqlmodel import SQLModel, create_engine

# Register all table definitions with SQLModel
from models import User, Note, Conversation, Message


# Load this project's .env file
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


# Read settings by their names—not their actual values
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_name = os.getenv("DB_NAME")

if not db_user or not db_password or not db_name:
    raise ValueError(
        "Set DB_USER, DB_PASSWORD, and DB_NAME in .env."
    )

# Prevent accidentally using either original project's database
if db_name != "student_portal_ai":
    raise ValueError(
        "This integration project must use DB_NAME=student_portal_ai."
    )


# Build the connection URL
database_url = URL.create(
    drivername="postgresql+psycopg",
    username=db_user,
    password=db_password,
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", "5432")),
    database=db_name,
)


# Manage database connections
engine = create_engine(
    database_url,
    pool_pre_ping=True,
)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


# Run setup only when this file is executed directly
if __name__ == "__main__":
    create_db_and_tables()
    print("Connected to student_portal_ai. All four tables are ready.")