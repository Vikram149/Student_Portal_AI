from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlmodel import Field, SQLModel


def current_utc_time():
    return datetime.now(timezone.utc)


# Student accounts
class User(SQLModel, table=True):
    __tablename__ = "public_user"

    id: int | None = Field(
        default=None,
        primary_key=True,
    )

    username: str = Field(
        index=True,
        unique=True,
    )

    password_hash: str


# Each note belongs to one student
class Note(SQLModel, table=True):
    __tablename__ = "note"

    __table_args__ = (
        CheckConstraint(
            "sharing_mode IN "
            "('private', 'all_students', 'selected_students')",
            name="check_note_sharing_mode",
        ),
    )

    id: int | None = Field(
        default=None,
        primary_key=True,
    )

    title: str
    content: str

    user_id: int = Field(
        foreign_key="public_user.id",
        index=True,
    )

    # Every new note starts private.
    sharing_mode: str = Field(
        default="private",
        sa_column=Column(
            String(20),
            nullable=False,
            server_default="private",
        ),
    )

    created_at: datetime = Field(
        default_factory=current_utc_time,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
        ),
    )


# Students selected by a note owner as recipients
class NoteShare(SQLModel, table=True):
    __tablename__ = "note_share"

    # Together, these fields form the primary key.
    # A student cannot receive duplicate grants for the same note.
    note_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("note.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )

    recipient_user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("public_user.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
            index=True,
        ),
    )

    created_at: datetime = Field(
        default_factory=current_utc_time,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
        ),
    )


# Each conversation belongs to one student
class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: int | None = Field(
        default=None,
        primary_key=True,
    )

    user_id: int = Field(
        foreign_key="public_user.id",
        index=True,
    )

    title: str = Field(
        default="New Chat",
        max_length=200,
    )

    created_at: datetime = Field(
        default_factory=current_utc_time,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
        ),
    )


# Each message belongs to one conversation
class Message(SQLModel, table=True):
    __tablename__ = "messages"

    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant')",
            name="check_message_role",
        ),
    )

    id: int | None = Field(
        default=None,
        primary_key=True,
    )

    conversation_id: int = Field(
        foreign_key="conversations.id",
        index=True,
    )

    role: str = Field(max_length=20)

    content: str = Field(
        sa_column=Column(Text, nullable=False),
    )

    created_at: datetime = Field(
        default_factory=current_utc_time,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
        ),
    )