NOTE_TOOLS = [
    {
        "name": "count_word_in_notes",
        "description": (
            "Count occurrences of one whole word across all notes "
            "belonging to the authenticated student. "
            "Searches both titles and contents, ignoring capitalization. "
            "Returns the total number of notes, the number containing "
            "the word, and the total occurrences. "
            "Use this for exact word-count questions about saved notes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "word": {
                    "type": "string",
                    "description": (
                        "One word to count, such as Python. "
                        "Use letters, numbers, or underscores; no spaces."
                    ),
                    "minLength": 1,
                    "maxLength": 100,
                }
            },
            "required": ["word"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_notes",
        "description": (
            "Find saved notes belonging to the authenticated student "
            "using a literal word or phrase in the title or content. "
            "Search is case-insensitive and returns up to ten notes "
            "with IDs, titles, and short content previews. "
            "Use a focused topic such as Python rather than the "
            "student's entire question. "
            "Previews may be incomplete; use read_note to read a "
            "selected note. If several notes could be intended, "
            "ask the student to clarify."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "The topic or phrase to find, such as "
                        "Python or decision tree."
                    ),
                    "minLength": 1,
                    "maxLength": 200,
                }
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "read_note",
        "description": (
            "Read a saved note belonging to the authenticated student. "
            "Use a note ID returned by search_notes or explicitly "
            "provided by the student. Do not guess note IDs. "
            "Returns the title and up to 12000 characters of content. "
            "If content_truncated is true, explain that only part "
            "of the note was available when summarizing it. "
            "If the note is not found, do not invent its contents."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {
                    "type": "integer",
                    "description": "The ID of the note to read.",
                    "minimum": 1,
                }
            },
            "required": ["note_id"],
            "additionalProperties": False,
        },
    },
]