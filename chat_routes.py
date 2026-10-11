from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth import require_current_user
from database import engine
from models import Conversation, Message, User

from typing import Literal

from anthropic import APIError
from pydantic import BaseModel, Field

from claude_service import get_claude_reply, ToolCallError
from memory_service import find_past_questions

from typing import Annotated

from shared_note_tools import read_selected_shared_notes


# Group the chatbot routes together
router = APIRouter(tags=["Student Chatbot"])


# Find a conversation only if it belongs to this student
def get_owned_conversation(
    session: Session,
    conversation_id: int,
    user_id: int,
) -> Conversation:
    statement = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.user_id == user_id,
    )

    conversation = session.exec(statement).first()

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


# Create a conversation for the logged-in student
@router.post("/conversations", status_code=201)
def create_conversation(
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        conversation = Conversation(
            title="New Chat",
            user_id=current_user.id,
        )

        session.add(conversation)
        session.commit()
        session.refresh(conversation)

        return {
            "id": conversation.id,
            "title": conversation.title,
            "created_at": conversation.created_at,
        }


# List only the logged-in student's conversations
@router.get("/conversations")
def list_conversations(
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        statement = (
            select(Conversation)
            .where(
                Conversation.user_id == current_user.id
            )
            .order_by(
                Conversation.created_at.desc(),
                Conversation.id.desc(),
            )
        )

        conversations = session.exec(statement).all()

        return [
            {
                "id": conversation.id,
                "title": conversation.title,
                "created_at": conversation.created_at,
            }
            for conversation in conversations
        ]


# Open a conversation after verifying ownership
@router.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: int,
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        conversation = get_owned_conversation(
            session=session,
            conversation_id=conversation_id,
            user_id=current_user.id,
        )

        statement = (
            select(Message)
            .where(
                Message.conversation_id == conversation.id
            )
            .order_by(Message.id)
        )

        messages = session.exec(statement).all()

        return {
            "id": conversation.id,
            "title": conversation.title,
            "messages": [
                {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "created_at": message.created_at,
                }
                for message in messages
            ],
        }
        
        
# Validate the latest message from the browser
class ChatMessageInput(BaseModel):
    role: Literal["user"]
    content: str = Field(
        min_length=1,
        max_length=10000,
    )


class ChatRequest(BaseModel):
    conversation_id: int = Field(gt=0)

    messages: list[ChatMessageInput] = Field(
        min_length=1,
        max_length=1,
    )

    selected_shared_note_ids: list[
        Annotated[int, Field(strict=True, gt=0)]
    ] = Field(
        default_factory=list,
        max_length=5,
    )


# Send a message in a conversation owned by this student
@router.post("/chat")
def chat(
    body: ChatRequest,
    current_user: User = Depends(require_current_user),
):
    question = body.messages[0].content.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Please enter a question.",
        )

    # Verify ownership before reading any history
    with Session(engine) as session:
        conversation = get_owned_conversation(
            session=session,
            conversation_id=body.conversation_id,
            user_id=current_user.id,
        )

        statement = (
            select(Message)
            .where(
                Message.conversation_id == conversation.id
            )
            .order_by(Message.id)
        )

        saved_messages = session.exec(statement).all()

        if len(saved_messages) >= 40:
            raise HTTPException(
                status_code=400,
                detail="Conversation limit reached. Start a new chat.",
            )

        previous_message_count = len(saved_messages)

        messages = [
            {
                "role": message.role,
                "content": message.content,
            }
            for message in saved_messages
        ]

    messages.append({
        "role": "user",
        "content": question,
    })
        # Check the student's selection before contacting Claude.
    if body.selected_shared_note_ids:
        selection = read_selected_shared_notes(
            user_id=current_user.id,
            selected_note_ids=body.selected_shared_note_ids,
        )

        if "error" in selection:
            raise HTTPException(
                status_code=404,
                detail=selection["error"],
            )

    # Search only the authenticated student's other chats
    past_questions = find_past_questions(
        question=question,
        current_conversation_id=body.conversation_id,
        user_id=current_user.id,
    )

    try:
        reply = get_claude_reply(
            messages,
            past_questions=past_questions,
            user_id=current_user.id,
            selected_shared_note_ids=body.selected_shared_note_ids,
        )

    except ToolCallError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from None

    except APIError:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not get a reply from Claude. "
                "Check your API settings, credits, and connection."
            ),
        ) from None

    if not reply.strip():
        raise HTTPException(
            status_code=502,
            detail="Claude returned no text. Please try again.",
        )

    # Check ownership again before saving.
    # Lock this conversation while saving the exchange.
    with Session(engine) as session:
        statement = (
            select(Conversation)
            .where(
                Conversation.id == body.conversation_id,
                Conversation.user_id == current_user.id,
            )
            .with_for_update()
        )

        conversation = session.exec(statement).first()

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        current_message_ids = session.exec(
            select(Message.id).where(
                Message.conversation_id == conversation.id
            )
        ).all()

        # Another request may have added messages while Claude replied
        if len(current_message_ids) != previous_message_count:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This conversation changed while the reply was generated. "
                    "Reopen it before sending again."
                ),
            )

        user_message = Message(
            conversation_id=conversation.id,
            role="user",
            content=question,
        )

        assistant_message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=reply,
        )

        session.add(user_message)
        session.flush()

        session.add(assistant_message)

        if previous_message_count == 0 and conversation.title == "New Chat":
            conversation.title = question[:80]
            session.add(conversation)

        session.commit()

    return {
        "conversation_id": body.conversation_id,
        "reply": reply,
    }
    
# Validate the new title
class RenameConversationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


# Rename an owned conversation
@router.patch("/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: int,
    body: RenameConversationRequest,
    current_user: User = Depends(require_current_user),
):
    new_title = body.title.strip()

    if not new_title:
        raise HTTPException(
            status_code=400,
            detail="The title cannot be blank.",
        )

    with Session(engine) as session:
        statement = (
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
            .with_for_update()
        )

        conversation = session.exec(statement).first()

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        conversation.title = new_title

        session.add(conversation)
        session.commit()

        return {
            "id": conversation_id,
            "title": new_title,
        }


# Delete an owned conversation and its messages
@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(require_current_user),
):
    with Session(engine) as session:
        statement = (
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
            .with_for_update()
        )

        conversation = session.exec(statement).first()

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        messages = session.exec(
            select(Message).where(
                Message.conversation_id == conversation.id
            )
        ).all()

        # Remove the child records first
        for message in messages:
            session.delete(message)

        session.flush()

        # Then remove the conversation
        session.delete(conversation)
        session.commit()

        return {
            "deleted": True,
            "conversation_id": conversation_id,
        }