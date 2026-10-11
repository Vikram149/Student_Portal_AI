# Student Portal with Claude Study Assistant

An authenticated student study portal built with FastAPI, PostgreSQL, and Claude Haiku 4.5. Students can manage personal study notes, maintain saved AI conversations, ask Claude questions about their own notes, and securely share selected notes with other students.

This project extends a FastAPI notes portal with a tool-enabled Claude chatbot while keeping authentication, authorization, note ownership, and sharing decisions inside the backend.

## Project Status

The current version is a completed local-development prototype. The following workflows have been implemented and manually tested:

- Student registration and login
- Session-cookie and JWT-cookie authentication
- Personal note creation, editing, and deletion
- PostgreSQL-backed chatbot conversations
- Chat history search, rename, download, and deletion
- Markdown-formatted Claude responses
- Cross-chat retrieval limited to the authenticated student
- Claude tools for searching, reading, and counting words in personal notes
- Note sharing with all students or selected students
- Recipient-side shared-note selection
- Shared-note source attribution
- Immediate blocking of future retrieval after access is revoked

## Main Features

### Authentication

- Passwords are stored as secure hashes.
- Standard login uses a signed session cookie.
- **Secure Login** uses a JWT stored in an HTTP-only cookie.
- Protected routes resolve the authenticated student on the server.
- Logout clears both supported authentication methods.

### Personal Study Notes

Students can:

- Create study notes
- Edit notes they own
- Delete notes they own
- View notes as sticky-note cards
- See a compact sharing-status symbol on every note
- Configure sharing without giving recipients edit or delete permission

### Claude Study Assistant

The chatbot opens beside the notes dashboard in a split-screen workspace. It supports:

- Enter to send
- Shift + Enter for a new line
- Markdown-formatted responses
- Sanitized HTML rendering
- Copy controls for messages and code blocks
- Saved PostgreSQL conversations
- Conversation title search
- New chat, rename, download, and delete actions
- A collapsible chat-history drawer

### Personal Note Tools

Claude can request the following backend tools for the authenticated student's own notes:

| Tool | Purpose |
| --- | --- |
| `count_word_in_notes` | Counts case-insensitive whole-word occurrences in owned note titles and content. |
| `search_notes` | Searches owned notes using a literal query and returns limited previews. |
| `read_note` | Reads one complete owned note by ID, subject to a content limit. |

Exact counting is performed by Python rather than estimated by the language model.

### Controlled Note Sharing

Each note has one of three sharing modes:

| Sharing mode | Access |
| --- | --- |
| `private` | Only the owner can retrieve the note. |
| `all_students` | Other authenticated students can use the note as a shared source. |
| `selected_students` | Only students selected by the owner can retrieve the note. |

The note owner can change or disable sharing at any time. Recipients receive read-only access and cannot edit, delete, or reconfigure the owner's note.

### Shared Notes in Claude

A recipient can:

1. Open **Select Notes** inside the chatbot.
2. Choose a student who shared notes with them.
3. Select up to five accessible notes.
4. See the selected note title and owner.
5. Ask Claude a question using those notes as sources.

The browser sends only selected note IDs. FastAPI verifies current access before Claude is called. Claude can then request the bounded `read_selected_shared_notes` tool.

If an owner makes a selected note private, the recipient's next request is rejected before the note is sent to Claude. The unavailable source is removed from the browser selection.

## Example Sharing Scenario

Student A owns three notes:

- **Python** - private
- **SQL** - shared with all students
- **Exam Plan** - shared only with Student B

Student B can select the SQL and Exam Plan notes as Claude sources. Student C can select SQL but cannot discover or retrieve Exam Plan. Claude identifies Student A as the source when answering from either shared note.

## Architecture

```mermaid
flowchart TD
    A[Student browser] --> B[FastAPI application]
    B --> C[Authentication and authorization]
    C --> D[(PostgreSQL)]
    B --> E[Claude service]
    E --> F[Approved tool executor]
    F --> C
    F --> D
```

Claude does not receive database credentials or direct SQL access. It receives only the results returned by approved backend tools after authorization.

## Technology Stack

| Area | Technology |
| --- | --- |
| Backend | Python 3.10, FastAPI, Uvicorn |
| Templates | Jinja2 |
| Frontend | HTML, CSS, JavaScript |
| Database | PostgreSQL 18 |
| ORM | SQLModel and SQLAlchemy |
| Authentication | Session cookies, JWT, password hashing |
| AI | Anthropic SDK and Claude Haiku 4.5 |
| Markdown | Marked |
| HTML sanitization | DOMPurify |

## Database Design

### `public_user`

Stores student accounts.

- `id`
- `username`
- `password_hash`

### `note`

Stores notes and their sharing mode.

- `id`
- `title`
- `content`
- `user_id`
- `sharing_mode`
- `created_at`

### `note_share`

Stores selected-student sharing grants.

- `note_id`
- `recipient_user_id`
- `created_at`

The combination of `note_id` and `recipient_user_id` uniquely identifies a grant.

### `conversations`

Stores chatbot conversations belonging to one student.

- `id`
- `user_id`
- `title`
- `created_at`

### `messages`

Stores the messages belonging to a conversation.

- `id`
- `conversation_id`
- `role`
- `content`
- `created_at`

## Project Structure

```text
Student_portal_ai/
├── main.py
├── auth.py
├── database.py
├── models.py
├── chat_routes.py
├── claude_service.py
├── memory_service.py
├── note_tools.py
├── note_tool_definitions.py
├── tool_executor.py
├── note_access.py
├── note_sharing_routes.py
├── shared_notes_routes.py
├── shared_note_tools.py
├── requirements.txt
├── .env
├── .gitignore
├── templates/
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── edit_note.html
│   └── chat.html
└── static/
    ├── style.css
    ├── chatbot.css
    ├── chat.js
    ├── chat_drawer.js
    ├── note_sharing.css
    ├── note_sharing.js
    └── spiderman_icon.png
```

If a filename in your local project differs slightly, retain the actual filename when committing the repository.

## Local Setup

### 1. Prerequisites

Install:

- Python 3.10 or later
- PostgreSQL
- pgAdmin 4, if you want a graphical database interface
- Git

### 2. Clone the Repository

```bash
git clone <your-repository-url>
cd Student_portal_ai
```

### 3. Create a Virtual Environment

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

Windows Command Prompt:

```bat
python -m venv .venv
.venv\Scripts\activate
```

macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Create the PostgreSQL Database

Create a database named:

```text
student_portal_ai
```

The application creates missing tables during startup. Existing production tables should be changed with a proper database migration rather than relying on `create_all`.

### 6. Configure Environment Variables

Create a `.env` file in the project root. Use the variable names expected by your current `database.py`, `auth.py`, and Claude service.

Example configuration:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/student_portal_ai

SESSION_SECRET=replace_with_a_long_random_secret
JWT_SECRET=replace_with_another_long_random_secret
JWT_ALGORITHM=HS256

ANTHROPIC_API_KEY=replace_with_your_anthropic_api_key
ANTHROPIC_MODEL=replace_with_your_claude_haiku_4_5_model_id
```

If your `database.py` uses separate variables such as database host, port, name, username, and password, keep those exact names instead of `DATABASE_URL`.

Never commit `.env`, database passwords, API keys, JWT secrets, or session secrets.

### 7. Start the Application

```bash
python -m uvicorn main:app --reload --port 8001
```

Open:

- Portal: `http://127.0.0.1:8001/login`
- Swagger UI: `http://127.0.0.1:8001/docs`

## Main Routes

| Route | Purpose |
| --- | --- |
| `GET /login` | Display the login page. |
| `POST /login` | Authenticate a student. |
| `GET /register` | Display registration. |
| `POST /register` | Create a student account. |
| `POST /logout` | Clear login state. |
| `GET /dashboard` | Display the authenticated student's notes. |
| `POST /add-note` | Create an owned note. |
| `GET/POST /edit-note/{note_id}` | Display or update an owned note. |
| `POST /delete-note/{note_id}` | Delete an owned note. |
| `GET/PUT /notes/{note_id}/sharing` | Read or update sharing for an owned note. |
| `GET /sharing/students` | Search students for selected sharing. |
| `GET /shared-notes/students` | List students with notes accessible to the recipient. |
| `GET /shared-notes` | List accessible notes from a selected owner. |
| `GET /shared-notes/{note_id}` | Read one currently accessible shared note. |
| `GET/POST /conversations` | List or create owned conversations. |
| `GET /conversations/{id}/messages` | Read an owned conversation. |
| `PATCH /conversations/{id}` | Rename an owned conversation. |
| `DELETE /conversations/{id}` | Delete an owned conversation. |
| `POST /chat` | Generate and save a Claude response. |

## Authorization Rules

- The backend derives `user_id` from the authenticated cookie.
- The browser and Claude cannot choose a different authenticated user ID.
- Note updates require both the note ID and owner ID to match.
- Conversation operations require both the conversation ID and owner ID to match.
- Cross-chat retrieval is filtered by the authenticated student's conversations.
- Personal-note tools query only notes owned by the authenticated student.
- Shared-note queries require `all_students` access or a matching `note_share` grant.
- Sharing configuration can be updated only by the note owner.
- Shared-note selections are validated before Claude is called and again during tool execution.

## Tool-Calling Workflow

```mermaid
sequenceDiagram
    participant S as Student
    participant F as FastAPI
    participant C as Claude
    participant T as Tool executor
    participant D as PostgreSQL

    S->>F: Send question and selected note IDs
    F->>D: Verify ownership and sharing access
    F->>C: Send question and permitted tool definitions
    C->>F: Request an approved tool
    F->>T: Execute with authenticated user context
    T->>D: Run scoped query
    D-->>T: Return authorized records
    T-->>C: Return structured tool result
    C-->>F: Produce attributed answer
    F-->>S: Save and display response
```

## Testing Performed

The completed manual tests include:

- Standard and Secure Login
- Message persistence
- Conversation ownership isolation
- Cross-chat isolation between students
- Exact whole-word counting
- Owned-note summarization
- Private, all-student, and selected-student sharing
- Recipient browsing of accessible notes
- Owner-only sharing updates
- Validation when selected sharing has no recipients
- Claude summarization with note title and owner attribution
- Revocation after the owner changes a note back to private

Swagger UI was used for API-level testing, and the portal was tested by switching between owner and recipient accounts.

## Security Notes

This repository demonstrates application-level access control but is not a production security certification.

Before public deployment, add or verify:

- HTTPS and secure cookies
- CSRF protection for state-changing form routes
- Rate limiting
- Production logging and monitoring
- Database backups and recovery procedures
- Dependency and secret scanning
- Automated authorization tests
- Database migrations
- Restricted CORS configuration
- Production-safe error handling

## GitHub Safety Checklist

Commit:

- Python source files
- Templates and static assets
- `requirements.txt`
- `README.md`
- `.gitignore`
- Optional screenshots and architecture documentation

Do not commit:

- `.env`
- `.venv/`
- `__pycache__/`
- API keys
- Database passwords
- Session or JWT secrets
- Local test databases
- Editor-specific temporary files

Recommended `.gitignore` entries:

```gitignore
.env
.venv/
venv/
__pycache__/
*.py[cod]
.pytest_cache/
.vscode/
.idea/
*.log
```

## Current Limitations

- The project is currently configured for local development.
- Retrieval uses SQL queries and declared tools rather than vector embeddings.
- Shared-note selection is limited to five notes per request.
- Literal search may miss conceptually related wording.
- Large-scale concurrent usage has not yet been benchmarked.
- Public deployment, monitoring, backups, and rate limiting are not included.

## RAG Scope

RAG practice is intentionally planned as a separate project rather than being added to this Student Portal. The current portal uses access-controlled SQL retrieval and Claude tool calling. Keeping the RAG project separate will make it easier to learn embeddings, chunking, vector databases, similarity search, and retrieval evaluation without complicating this completed portal.

## Author

**Sai Vikram Sake**  
M.S. in Data Science

## License

No open-source license has been selected yet. Add a `LICENSE` file before allowing reuse or redistribution outside the project.
