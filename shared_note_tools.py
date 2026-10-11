from sqlmodel import Session, select

from models import Note, User
from database import engine
from note_access import shared_note_condition


READ_SELECTED_SHARED_NOTES_TOOL = {
    "name": "read_selected_shared_notes",
    "description": (
        "Read the shared notes selected by the student for this request. "
        "The backend supplies the selection and checks current permissions. "
        "Returns note titles, owners and note content. "
        "Use this tool before answering questions about selected shared notes. "
        "Cite each source using its title and owner's username. "
        "If content_truncated is true, explain that only part was available. "
        "This tool does not calculate exact word counts."
    ),
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
}


def read_selected_shared_notes(
    user_id: int,
    selected_note_ids: list[int],
) -> dict:

    if type(user_id) is not int or user_id <= 0:
        raise ValueError("A verified student ID is required.")

    if not selected_note_ids:
        return {"error": "No shared notes were selected."}

    if len(selected_note_ids) > 5:
        return {"error": "Select no more than five shared notes."}

    if any(
        type(note_id) is not int or note_id <= 0
        for note_id in selected_note_ids
    ):
        return {"error": "Invalid note selection."}

    selected_ids = sorted(set(selected_note_ids))

    with Session(engine) as session:
        statement = (
            select(
                Note.id,
                Note.title,
                Note.content,
                User.id,
                User.username,
            )
            .join(User, Note.user_id == User.id)
            .where(
                Note.id.in_(selected_ids),
                shared_note_condition(user_id),
            )
            .order_by(Note.id)
        )

        rows = session.exec(statement).all()

        # If any selected note is missing or inaccessible,
        # return no note content from this selection.
        returned_ids = {row[0] for row in rows}

        if returned_ids != set(selected_ids):
            return {
                "error": (
                    "One or more selected notes are unavailable. "
                    "Refresh the shared-note list and select again."
                )
            }

        return {
            "notes": [
                {
                    "note_id": note_id,
                    "title": title,
                    "owner": {
                        "id": owner_id,
                        "username": username,
                    },
                    "content": content[:4000],
                    "content_truncated": len(content) > 4000,
                }
                for (
                    note_id,
                    title,
                    content,
                    owner_id,
                    username,
                ) in rows
            ]
        }