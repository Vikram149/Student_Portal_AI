from pydantic import BaseModel, ConfigDict, Field, ValidationError

from note_tools import (
    count_word_in_notes,
    search_notes,
    read_note,
)


# Reject unexpected fields and incorrect argument types
class ToolArguments(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
    )


class CountWordArguments(ToolArguments):
    word: str = Field(min_length=1, max_length=100)


class SearchNotesArguments(ToolArguments):
    query: str = Field(min_length=1, max_length=200)


class ReadNoteArguments(ToolArguments):
    note_id: int = Field(gt=0)


def execute_note_tool(
    tool_name: str,
    tool_input: dict,
    user_id: int,
) -> dict:
    # This ID must come from our verified login.
    # Never take it from Claude's tool input.
    if type(user_id) is not int or user_id <= 0:
        raise ValueError("A verified student ID is required.")

    # Only these three tool names are allowed
    argument_models = {
        "count_word_in_notes": CountWordArguments,
        "search_notes": SearchNotesArguments,
        "read_note": ReadNoteArguments,
    }

    argument_model = argument_models.get(tool_name)

    if argument_model is None:
        return {
            "error": "Unknown tool. Use one of the provided note tools."
        }

    # Validate before calling any database function
    try:
        arguments = argument_model.model_validate(tool_input)

    except ValidationError:
        return {
            "error": (
                "Invalid tool arguments. Follow the tool's input schema "
                "and supply only the required fields."
            )
        }

    if tool_name == "count_word_in_notes":
        return count_word_in_notes(
            user_id=user_id,
            word=arguments.word,
        )

    if tool_name == "search_notes":
        return search_notes(
            user_id=user_id,
            query=arguments.query,
        )

    if tool_name == "read_note":
        return read_note(
            user_id=user_id,
            note_id=arguments.note_id,
        )