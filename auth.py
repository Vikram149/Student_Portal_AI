import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlmodel import Session, select

from database import engine
from models import User


# Load the integration project's settings
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

JWT_SECRET = os.getenv("JWT_SECRET", "")

if len(JWT_SECRET) < 32:
    raise ValueError(
        "Set JWT_SECRET in .env to the random secret you generated."
    )

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 30

# Different cookie names keep this app separate from the old portal
SESSION_COOKIE_NAME = "portal_ai_session"
JWT_COOKIE_NAME = "portal_ai_access_token"


# Password hashing
password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(
    entered_password: str,
    stored_hash: str,
) -> bool:
    return password_hasher.verify(
        entered_password,
        stored_hash,
    )


# Find a student by username
def get_user_by_username(username: str) -> User | None:
    with Session(engine) as session:
        statement = select(User).where(
            User.username == username
        )

        return session.exec(statement).first()


# Generate a JWT after a successful login
def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "user_id": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


# Identify the student using the session or JWT cookie
def get_current_user(request: Request) -> User | None:
    session_user_id = request.session.get("user_id")

    # Check the signed session first
    if type(session_user_id) is int and session_user_id > 0:
        with Session(engine) as session:
            user = session.get(User, session_user_id)

            if user is not None:
                return user

    # Otherwise, check the JWT cookie
    token = request.cookies.get(JWT_COOKIE_NAME)

    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={
                "require": ["user_id", "iat", "exp"],
            },
        )

    except jwt.InvalidTokenError:
        # Includes expired, malformed, or incorrectly signed tokens
        return None

    user_id = payload.get("user_id")

    if type(user_id) is not int or user_id <= 0:
        return None

    with Session(engine) as session:
        return session.get(User, user_id)


# Require a valid login for chatbot API routes
def require_current_user(
    current_user: User | None = Depends(get_current_user),
) -> User:
    if current_user is None:
        raise HTTPException(
            status_code=401,
            detail="Please log in to continue.",
        )

    return current_user