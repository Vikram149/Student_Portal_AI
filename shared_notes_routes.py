from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Response,
)
from sqlmodel import Session, select

from auth import require_current_user
from database import engine
from models import Note, User
from note_access import shared_note_condition


def prevent_response_caching(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/shared-notes",
    tags=["Shared Notes"],
    dependencies=[Depends(prevent_response_caching)],
)


# Students who have at least one note accessible to the viewer.
@router.get("/students")
def list_shared_note_owners(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        statement = (
            select(User.id, User.username)
            .join(Note, Note.user_id == User.id)
            .where(shared_note_condition(current_user.id))
            .distinct()
            .order_by(User.username, User.id)
            .offset(offset)
            .limit(limit + 1)
        )

        rows = session.exec(statement).all()

        return {
            "students": [
                {
                    "id": owner_id,
                    "username": username,
                }
                for owner_id, username in rows[:limit]
            ],
            "has_more": len(rows) > limit,
            "offset": offset,
            "limit": limit,
        }


# List accessible shared notes, optionally from one owner.
@router.get("")
def list_shared_notes(
    owner_id: int | None = Query(default=None, gt=0),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        statement = (
            select(
                Note.id,
                Note.title,
                Note.created_at,
                User.id,
                User.username,
            )
            .join(User, Note.user_id == User.id)
            .where(shared_note_condition(current_user.id))
        )

        if owner_id is not None:
            statement = statement.where(
                Note.user_id == owner_id
            )

        statement = (
            statement
            .order_by(Note.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )

        rows = session.exec(statement).all()

        return {
            "notes": [
                {
                    "note_id": note_id,
                    "title": title,
                    "created_at": created_at,
                    "owner": {
                        "id": student_id,
                        "username": username,
                    },
                }
                for (
                    note_id,
                    title,
                    created_at,
                    student_id,
                    username,
                ) in rows[:limit]
            ],
            "has_more": len(rows) > limit,
            "offset": offset,
            "limit": limit,
        }


# Read one shared note after checking its current permissions.
@router.get("/{note_id}")
def read_shared_note(
    note_id: int,
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        statement = (
            select(
                Note.id,
                Note.title,
                Note.content,
                Note.created_at,
                User.id,
                User.username,
            )
            .join(User, Note.user_id == User.id)
            .where(
                Note.id == note_id,
                shared_note_condition(current_user.id),
            )
        )

        row = session.exec(statement).first()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Note not found.",
            )

        (
            returned_note_id,
            title,
            content,
            created_at,
            owner_id,
            username,
        ) = row

        return {
            "note_id": returned_note_id,
            "title": title,
            "content": content,
            "created_at": created_at,
            "owner": {
                "id": owner_id,
                "username": username,
            },
        }