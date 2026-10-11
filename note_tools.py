import re

from sqlmodel import Session, select

from database import engine
from models import Note


# Count a whole word across this student's notes
def count_word_in_notes(user_id: int, word: str) -> dict:
    word = word.strip()

    # This tool accepts one word, such as Python or FastAPI
    if not re.fullmatch(r"\w+", word):
        return {
            "error": "Provide one word containing letters, numbers, or underscores."
        }

    pattern = re.compile(
        rf"(?<!\w){re.escape(word)}(?!\w)",
        flags=re.IGNORECASE,
    )

    total_occurrences = 0
    matching_notes = 0

    with Session(engine) as session:
        # Retrieve only the authenticated student's notes
        statement = select(Note).where(
            Note.user_id == user_id
        )

        notes = session.exec(statement).all()

        for note in notes:
            # Count title and content separately
            title_count = len(pattern.findall(note.title))
            content_count = len(pattern.findall(note.content))

            note_count = title_count + content_count

            total_occurrences += note_count

            if note_count > 0:
                matching_notes += 1

        return {
            "word": word,
            "total_notes": len(notes),
            "matching_notes": matching_notes,
            "total_occurrences": total_occurrences,
            "searched_fields": ["title", "content"],
            "matching_rule": "Whole word, case-insensitive",
        }


# Find notes by a word or phrase in their title or content
def search_notes(user_id: int, query: str) -> dict:
    query = query.strip()

    if not query or len(query) > 200:
        return {
            "error": "Provide a search phrase between 1 and 200 characters."
        }

    # Escape SQL wildcard characters for literal text matching
    escaped_query = (
        query
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )

    search_pattern = f"%{escaped_query}%"

    with Session(engine) as session:
        statement = (
            select(Note)
            .where(
                Note.user_id == user_id,
                (
                    Note.title.ilike(search_pattern, escape="\\")
                    | Note.content.ilike(search_pattern, escape="\\")
                ),
            )
            .order_by(Note.id.desc())
            .limit(11)
        )

        notes = session.exec(statement).all()

        return {
            "query": query,
            "has_more": len(notes) > 10,
            "notes": [
                {
                    "note_id": note.id,
                    "title": note.title,
                    "preview": note.content[:400],
                    "preview_truncated": len(note.content) > 400,
                }
                for note in notes[:10]
            ],
        }


# Read one note after checking student ownership
def read_note(user_id: int, note_id: int) -> dict:
    with Session(engine) as session:
        statement = select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
        )

        note = session.exec(statement).first()

        if note is None:
            return {
                "error": "Note not found."
            }

        # Keep the initial tool response reasonably sized
        content_limit = 12000

        return {
            "note_id": note.id,
            "title": note.title,
            "content": note.content[:content_limit],
            "content_truncated": len(note.content) > content_limit,
        }