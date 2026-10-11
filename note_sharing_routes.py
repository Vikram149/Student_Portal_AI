from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from auth import require_current_user
from database import engine
from models import Note, NoteShare, User


router = APIRouter(tags=["Note Sharing"])

StudentID = Annotated[int, Field(strict=True, gt=0)]


class SharingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sharing_mode: Literal[
        "private",
        "all_students",
        "selected_students",
    ]

    recipient_user_ids: list[StudentID] = Field(
        default_factory=list,
        max_length=100,
    )


def get_owned_note(
    session: Session,
    note_id: int,
    user_id: int,
):
    # Lock this note until the transaction finishes.
    statement = (
        select(Note)
        .where(
            Note.id == note_id,
            Note.user_id == user_id,
        )
        .with_for_update()
    )

    note = session.exec(statement).first()

    if note is None:
        raise HTTPException(
            status_code=404,
            detail="Note not found.",
        )

    return note


def sharing_details(
    session: Session,
    note: Note,
):
    recipients = session.exec(
        select(User)
        .join(
            NoteShare,
            NoteShare.recipient_user_id == User.id,
        )
        .where(NoteShare.note_id == note.id)
        .order_by(User.username, User.id)
    ).all()

    return {
        "note_id": note.id,
        "title": note.title,
        "sharing_mode": note.sharing_mode,
        "recipients": [
            {
                "id": student.id,
                "username": student.username,
            }
            for student in recipients
        ],
    }


# Find students the owner can select as recipients.
# Return only IDs and usernames.
@router.get("/sharing/students")
def search_students(
    q: str = Query(min_length=2, max_length=100),
    current_user: User = Depends(require_current_user),
):
    query = q.strip()

    if len(query) < 2:
        raise HTTPException(
            status_code=400,
            detail="Enter at least two characters.",
        )

    # Treat SQL wildcard characters as literal text.
    escaped = (
        query.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )

    with Session(engine) as session:
        students = session.exec(
            select(User)
            .where(
                User.id != current_user.id,
                User.username.ilike(
                    f"%{escaped}%",
                    escape="\\",
                ),
            )
            .order_by(User.username, User.id)
            .limit(21)
        ).all()

        return {
            "students": [
                {
                    "id": student.id,
                    "username": student.username,
                }
                for student in students[:20]
            ],
            "has_more": len(students) > 20,
        }


# Only the owner can inspect the note's recipient list.
@router.get("/notes/{note_id}/sharing")
def get_note_sharing(
    note_id: int,
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        note = get_owned_note(
            session,
            note_id,
            current_user.id,
        )

        return sharing_details(session, note)


# Replace the sharing setting and the complete recipient list.
@router.put("/notes/{note_id}/sharing")
def update_note_sharing(
    note_id: int,
    body: SharingUpdate,
    current_user: User = Depends(require_current_user),
):
    recipient_ids = sorted(set(body.recipient_user_ids))

    with Session(engine) as session:
        note = get_owned_note(
            session,
            note_id,
            current_user.id,
        )

        if body.sharing_mode == "selected_students":
            if not recipient_ids:
                raise HTTPException(
                    status_code=400,
                    detail="Select at least one student.",
                )

            if current_user.id in recipient_ids:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "You already own this note. "
                        "Select another student."
                    ),
                )

            existing_ids = session.exec(
                select(User.id).where(
                    User.id.in_(recipient_ids)
                )
            ).all()

            if set(existing_ids) != set(recipient_ids):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "One or more selected students "
                        "no longer exist."
                    ),
                )

        elif recipient_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Recipient IDs are only allowed for "
                    "selected_students sharing."
                ),
            )

        # Clear previous recipients when replacing permissions.
        old_shares = session.exec(
            select(NoteShare).where(
                NoteShare.note_id == note.id
            )
        ).all()

        for old_share in old_shares:
            session.delete(old_share)

        # Complete deletions before inserting the new list.
        session.flush()

        note.sharing_mode = body.sharing_mode
        session.add(note)

        if body.sharing_mode == "selected_students":
            for recipient_id in recipient_ids:
                session.add(
                    NoteShare(
                        note_id=note.id,
                        recipient_user_id=recipient_id,
                    )
                )

        session.flush()

        result = sharing_details(session, note)

        # The mode and recipient list are saved together.
        session.commit()

        return result