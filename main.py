import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from starlette.middleware.sessions import SessionMiddleware

from auth import (
    JWT_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    create_access_token,
    get_current_user,
    get_user_by_username,
    hash_password,
    verify_password,
)
from database import create_db_and_tables, engine
from models import Note, User
from chat_routes import router as chat_router
from note_sharing_routes import router as note_sharing_router
from shared_notes_routes import router as shared_notes_router


# --------------------------------------------------
# Application settings
# --------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SESSION_SECRET = os.getenv("SESSION_SECRET", "")

if len(SESSION_SECRET) < 32:
    raise ValueError(
        "Set SESSION_SECRET in .env to your generated random secret."
    )

# False for our local HTTP development server.
# Set True when deploying behind HTTPS.
COOKIE_SECURE = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(
    title="Student Portal AI",
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie=SESSION_COOKIE_NAME,
    max_age=1800,
    same_site="lax",
    https_only=COOKIE_SECURE,
)

app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static",
)

templates = Jinja2Templates(
    directory=str(BASE_DIR / "templates")
)


def redirect_to(url: str):
    return RedirectResponse(url=url, status_code=303)


# --------------------------------------------------
# Home
# --------------------------------------------------
@app.get("/")
def home():
    return redirect_to("/login")


# --------------------------------------------------
# Registration
# --------------------------------------------------
@app.get("/register")
def show_register(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="register.html",
        context={"error": None},
    )


@app.post("/register")
def register(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    username = username.strip()

    def registration_error(message: str):
        return templates.TemplateResponse(
            request=request,
            name="register.html",
            context={"error": message},
            status_code=400,
        )

    if not username or len(username) > 100:
        return registration_error(
            "Enter a username between 1 and 100 characters."
        )

    if len(password) < 8 or len(password) > 128:
        return registration_error(
            "Use a password between 8 and 128 characters."
        )

    if get_user_by_username(username):
        return registration_error("Username already exists.")

    new_user = User(
        username=username,
        password_hash=hash_password(password),
    )

    with Session(engine) as session:
        session.add(new_user)

        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return registration_error("Username already exists.")

    return redirect_to("/login?registered=1")


# --------------------------------------------------
# Login
# --------------------------------------------------
@app.get("/login")
def show_login(
    request: Request,
    registered: int | None = None,
):
    success = (
        "Registration successful. Please log in."
        if registered == 1
        else None
    )

    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "error": None,
            "success": success,
        },
    )


@app.post("/login")
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    secure_login: str | None = Form(None),
):
    user = get_user_by_username(username.strip())

    if user is None or not verify_password(
        password,
        user.password_hash,
    ):
        return templates.TemplateResponse(
            request=request,
            name="login.html",
            context={
                "error": "Invalid username or password.",
                "success": None,
            },
            status_code=401,
        )

    # Remove the previous account's session state
    request.session.clear()

    response = redirect_to("/dashboard")

    if secure_login:
        # JWT login: remove any previous session cookie
        response.delete_cookie(
            SESSION_COOKIE_NAME,
            path="/",
        )

        # Replace any previous JWT with this student's token
        response.set_cookie(
            key=JWT_COOKIE_NAME,
            value=create_access_token(user.id),
            httponly=True,
            max_age=1800,
            samesite="lax",
            secure=COOKIE_SECURE,
            path="/",
        )

    else:
        # Session login: remove any previous JWT cookie
        response.delete_cookie(
            JWT_COOKIE_NAME,
            path="/",
        )

        request.session["user_id"] = user.id

    return response


# --------------------------------------------------
# Student dashboard
# --------------------------------------------------
@app.get("/dashboard")
def dashboard(
    request: Request,
    current_user: User | None = Depends(get_current_user),
):
    if current_user is None:
        return redirect_to("/login")

    with Session(engine) as session:
        statement = (
            select(Note)
            .where(Note.user_id == current_user.id)
            .order_by(Note.id.desc())
        )

        notes = session.exec(statement).all()

    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={
            "user": current_user,
            "notes": notes,
        },
    )


# --------------------------------------------------
# Add a note
# --------------------------------------------------
@app.post("/add-note")
def add_note(
    title: str = Form(...),
    content: str = Form(...),
    current_user: User | None = Depends(get_current_user),
):
    if current_user is None:
        return redirect_to("/login")

    if not title.strip() or not content.strip():
        return redirect_to("/dashboard")

    note = Note(
        title=title.strip(),
        content=content.strip(),
        user_id=current_user.id,
    )

    with Session(engine) as session:
        session.add(note)
        session.commit()

    return redirect_to("/dashboard")


# --------------------------------------------------
# Show the edit page for an owned note
# --------------------------------------------------
@app.get("/edit-note/{note_id}")
def show_edit_note(
    note_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user),
):
    if current_user is None:
        return redirect_to("/login")

    with Session(engine) as session:
        statement = select(Note).where(
            Note.id == note_id,
            Note.user_id == current_user.id,
        )

        note = session.exec(statement).first()

        if note is None:
            return redirect_to("/dashboard")

    return templates.TemplateResponse(
        request=request,
        name="edit_note.html",
        context={"note": note},
    )


# --------------------------------------------------
# Update an owned note
# --------------------------------------------------
@app.post("/edit-note/{note_id}")
def update_note(
    note_id: int,
    title: str = Form(...),
    content: str = Form(...),
    current_user: User | None = Depends(get_current_user),
):
    if current_user is None:
        return redirect_to("/login")

    if not title.strip() or not content.strip():
        return redirect_to("/dashboard")

    with Session(engine) as session:
        statement = select(Note).where(
            Note.id == note_id,
            Note.user_id == current_user.id,
        )

        note = session.exec(statement).first()

        if note is None:
            return redirect_to("/dashboard")

        note.title = title.strip()
        note.content = content.strip()

        session.add(note)
        session.commit()

    return redirect_to("/dashboard")


# --------------------------------------------------
# Delete an owned note
# --------------------------------------------------
@app.post("/delete-note/{note_id}")
def delete_note(
    note_id: int,
    current_user: User | None = Depends(get_current_user),
):
    if current_user is None:
        return redirect_to("/login")

    with Session(engine) as session:
        statement = select(Note).where(
            Note.id == note_id,
            Note.user_id == current_user.id,
        )

        note = session.exec(statement).first()

        if note is not None:
            session.delete(note)
            session.commit()

    return redirect_to("/dashboard")


# --------------------------------------------------
# Logout: clear both authentication methods
# --------------------------------------------------
@app.post("/logout")
def logout(request: Request):
    request.session.clear()

    response = redirect_to("/login")

    response.delete_cookie(JWT_COOKIE_NAME, path="/")
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")

    return response

app.include_router(chat_router)
app.include_router(note_sharing_router)
app.include_router(shared_notes_router)


# Show the chatbot page only to logged-in students
@app.get("/assistant")
def assistant_page(
    request: Request,
    current_user: User | None = Depends(get_current_user),
):
    if current_user is None:
        return redirect_to("/login")

    return templates.TemplateResponse(
        request=request,
        name="chat.html",
        context={"user": current_user},
        headers={"Cache-Control": "no-store"},
    )