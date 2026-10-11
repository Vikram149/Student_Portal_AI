from sqlalchemy import and_, or_
from sqlmodel import select

from models import Note, NoteShare


def shared_note_condition(user_id: int):
    """Notes belonging to others that this student may read."""

    if type(user_id) is not int or user_id <= 0:
        raise ValueError("A verified student ID is required.")

    selected_note_ids = select(NoteShare.note_id).where(
        NoteShare.recipient_user_id == user_id
    )

    return and_(
        # Own notes remain in the student's normal dashboard.
        Note.user_id != user_id,

        or_(
            Note.sharing_mode == "all_students",

            and_(
                Note.sharing_mode == "selected_students",
                Note.id.in_(selected_note_ids),
            ),
        ),
    )