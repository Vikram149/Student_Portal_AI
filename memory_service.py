import re

from sqlalchemy import or_
from sqlmodel import Session, select

from database import engine
from models import Conversation, Message


# Common words that are not useful search topics
STOP_WORDS = {
    "a", "an", "the", "is", "was", "are", "were",
    "i", "me", "my", "we", "our", "you", "your",
    "it", "its", "this", "that", "these", "those",
    "did", "do", "does", "have", "has", "had",
    "can", "could", "would", "should", "will",
    "what", "which", "when", "where", "how", "why",
    "about", "with", "from", "for", "and", "or",
    "in", "on", "to", "of", "any", "ever",
    "before", "previous", "earlier", "other",
    "chat", "chats", "conversation", "conversations",
    "talk", "talked", "discuss", "discussed",
    "remember", "tell", "please", "again",
}


def find_past_questions(
    question: str,
    current_conversation_id: int,
    user_id: int,
):
    # Extract searchable topic words
    words = re.findall(
        r"[a-zA-Z0-9]+",
        question.lower(),
    )

    keywords = list(dict.fromkeys(
        word
        for word in words
        if len(word) >= 3 and word not in STOP_WORDS
    ))[:8]

    if not keywords:
        return []

    conditions = [
        Message.content.ilike(f"%{word}%")
        for word in keywords
    ]

    with Session(engine) as session:
        statement = (
            select(Message, Conversation)
            .join(
                Conversation,
                Message.conversation_id == Conversation.id,
            )
            .where(
                # Search only this student's conversations
                Conversation.user_id == user_id,

                # The current chat is handled separately
                Conversation.id != current_conversation_id,

                # Retrieve actual user questions
                Message.role == "user",

                # Match at least one topic word
                or_(*conditions),
            )
            .order_by(Message.id.desc())
            .limit(50)
)
        

        results = session.exec(statement).all()

        # Prefer messages matching more topic words
        ranked_results = sorted(
            results,
            key=lambda row: sum(
                word in row[0].content.lower()
                for word in keywords
            ),
            reverse=True,
        )

        return [
            {
                "conversation_id": conversation.id,
                "title": conversation.title,
                "message_id": message.id,
                "user_message": message.content,
            }
            for message, conversation in ranked_results[:6]
        ]