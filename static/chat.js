// ==========================================
// Main chatbot elements
// ==========================================
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const chatMessages = document.getElementById("chat-messages");
const chatStatus = document.getElementById("chat-status");
const sendButton = document.getElementById("send-button");

const clearButton = document.getElementById("clear-chat");
const savedChats = document.getElementById("saved-chats");
const deleteButton = document.getElementById("delete-chat");
const downloadButton = document.getElementById("download-chat");
const renameButton = document.getElementById("rename-chat");
const chatSearch = document.getElementById("chat-search");


// ==========================================
// Shared-note selector elements
// ==========================================
const openSharedNotesButton =
    document.getElementById("open-shared-notes");

const sharedNotesDialog =
    document.getElementById("shared-notes-dialog");

const closeSharedNotesButton =
    document.getElementById("close-shared-notes");

const cancelSharedNotesButton =
    document.getElementById("cancel-shared-notes");

const applySharedNotesButton =
    document.getElementById("apply-shared-notes");

const refreshSharedNotesButton =
    document.getElementById("refresh-shared-notes");

const sharedNoteStudent =
    document.getElementById("shared-note-student");

const sharedNoteList =
    document.getElementById("shared-note-list");

const sharedNoteDialogStatus =
    document.getElementById("shared-note-dialog-status");

const selectedSharedNoteCount =
    document.getElementById("selected-shared-note-count");

const selectedSharedNotesContainer =
    document.getElementById("selected-shared-notes");


// ==========================================
// Application state
// ==========================================

// Complete list of saved conversations
let savedChatList = [];

// Currently displayed conversation
let conversation = [];

// Current PostgreSQL conversation ID
let conversationId = null;

// Prevent multiple requests at the same time
let isSending = false;

// Notes currently applied to chatbot requests.
//
// Structure:
// note ID -> {
//     note_id,
//     title,
//     owner: {
//         id,
//         username
//     }
// }
let selectedSharedNotes = new Map();

// Temporary selection used inside the dialog.
// Canceling the dialog will discard these changes.
let draftSelectedSharedNotes = new Map();


// ==========================================
// Reusable API error
// ==========================================
class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}


// ==========================================
// Read an API response
// ==========================================
async function readResponse(response) {
    let data;

    try {
        data = await response.json();
    } catch {
        throw new ApiError(
            "The server returned an unexpected response. " +
            "Check your FastAPI terminal.",
            response.status
        );
    }

    if (!response.ok) {
        const errorMessage =
            typeof data.detail === "string"
                ? data.detail
                : "The request failed. Please try again.";

        throw new ApiError(
            errorMessage,
            response.status
        );
    }

    return data;
}


// ==========================================
// Main chat status
// ==========================================
function setStatus(text, isError = false) {
    chatStatus.textContent = text;
    chatStatus.classList.toggle("error", isError);
}


// ==========================================
// Shared-note dialog status
// ==========================================
function setSharedNoteStatus(text, isError = false) {
    sharedNoteDialogStatus.textContent = text;
    sharedNoteDialogStatus.classList.toggle(
        "error",
        isError
    );
}


// ==========================================
// Disable controls during a chat request
// ==========================================
function setLoading(loading) {
    isSending = loading;

    sendButton.disabled = loading;
    clearButton.disabled = loading;
    messageInput.disabled = loading;
    savedChats.disabled = loading;
    deleteButton.disabled = loading;
    downloadButton.disabled = loading;
    renameButton.disabled = loading;
    chatSearch.disabled = loading;
    openSharedNotesButton.disabled = loading;

    document
        .querySelectorAll(".shared-note-chip-remove")
        .forEach(function (button) {
            button.disabled = loading;
        });

    chatMessages.setAttribute(
        "aria-busy",
        String(loading)
    );
}


// ==========================================
// Shared-note dialog loading state
// ==========================================
function setSharedDialogLoading(loading) {
    sharedNoteStudent.disabled = loading;
    refreshSharedNotesButton.disabled = loading;
    applySharedNotesButton.disabled = loading;

    sharedNoteList
        .querySelectorAll('input[type="checkbox"]')
        .forEach(function (checkbox) {
            checkbox.disabled = loading;
        });
}


// ==========================================
// Copy button
// ==========================================
function createCopyButton(
    textToCopy,
    label,
    iconOnly = false
) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "copy-button";
    button.dataset.tooltip = label;
    button.setAttribute("aria-label", label);

    const copyIcon = `
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            <rect
                x="4"
                y="8"
                width="12"
                height="13"
                rx="3"
            ></rect>

            <path
                d="M9 8V6a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1"
            ></path>
        </svg>
    `;

    function resetButton() {
        button.innerHTML = copyIcon;

        if (!iconOnly) {
            const caption = document.createElement("span");
            caption.textContent = label;
            button.appendChild(caption);
        }

        button.dataset.tooltip = label;
        button.setAttribute("aria-label", label);
    }

    resetButton();

    button.addEventListener("click", async function () {
        button.disabled = true;

        try {
            if (!navigator.clipboard) {
                throw new Error(
                    "Clipboard is unavailable."
                );
            }

            await navigator.clipboard.writeText(
                textToCopy
            );

            button.textContent = "✓";
            button.dataset.tooltip = "Copied!";
            button.setAttribute(
                "aria-label",
                "Copied!"
            );

        } catch {
            button.textContent = "!";
            button.dataset.tooltip = "Copy failed";
            button.setAttribute(
                "aria-label",
                "Copy failed"
            );

            setStatus(
                "Could not copy automatically. " +
                "Select the text and press Ctrl + C.",
                true
            );
        }

        setTimeout(function () {
            resetButton();
            button.disabled = false;
        }, 1500);
    });

    return button;
}


// ==========================================
// Display a chat message
// ==========================================
function addMessage(role, text) {
    const messageItem = document.createElement("div");

    messageItem.classList.add(
        "message-item",
        role
    );

    const bubble = document.createElement("div");

    bubble.classList.add(
        "message",
        role
    );

    const canRenderMarkdown =
        role === "assistant" &&
        typeof window.marked !== "undefined" &&
        typeof window.DOMPurify !== "undefined";

    if (canRenderMarkdown) {
        const formattedHTML = marked.parse(text, {
            gfm: true,
            breaks: true,
            async: false
        });

        const cleanHTML = DOMPurify.sanitize(
            formattedHTML,
            {
                ALLOWED_TAGS: [
                    "p",
                    "br",
                    "strong",
                    "em",
                    "del",
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                    "h5",
                    "h6",
                    "ul",
                    "ol",
                    "li",
                    "blockquote",
                    "pre",
                    "code",
                    "hr",
                    "a",
                    "table",
                    "thead",
                    "tbody",
                    "tr",
                    "th",
                    "td"
                ],
                ALLOWED_ATTR: [
                    "href",
                    "title",
                    "start"
                ]
            }
        );

        bubble.classList.add(
            "markdown-content"
        );

        bubble.innerHTML = cleanHTML;

        // Add a separate copy button to code blocks
        bubble
            .querySelectorAll("pre")
            .forEach(function (pre) {
                const code = pre.querySelector("code");

                if (!code) {
                    return;
                }

                const codeText = code.textContent;

                const codePanel =
                    document.createElement("div");

                codePanel.className = "code-panel";

                const toolbar =
                    document.createElement("div");

                toolbar.className = "code-toolbar";

                toolbar.appendChild(
                    createCopyButton(
                        codeText,
                        "Copy code"
                    )
                );

                pre.replaceWith(codePanel);
                codePanel.appendChild(toolbar);
                codePanel.appendChild(pre);
            });

    } else {
        bubble.textContent = text;
    }

    const actions = document.createElement("div");
    actions.className = "message-actions";

    actions.appendChild(
        createCopyButton(
            text,
            "Copy message",
            true
        )
    );

    messageItem.appendChild(bubble);
    messageItem.appendChild(actions);

    chatMessages.appendChild(messageItem);

    chatMessages.scrollTop =
        chatMessages.scrollHeight;

    return messageItem;
}


// ==========================================
// Saved conversation list
// ==========================================
function renderSavedChats() {
    const searchText =
        chatSearch.value.trim().toLowerCase();

    const matchingChats =
        savedChatList.filter(function (chat) {
            return chat.title
                .toLowerCase()
                .includes(searchText);
        });

    savedChats.replaceChildren();

    const placeholder =
        document.createElement("option");

    placeholder.value = "";

    placeholder.textContent =
        matchingChats.length === 0
            ? "No matching conversations"
            : "Choose a saved conversation";

    savedChats.appendChild(placeholder);

    for (const chat of matchingChats) {
        const option =
            document.createElement("option");

        option.value = String(chat.id);

        option.textContent =
            `${chat.title} — Chat ${chat.id}`;

        savedChats.appendChild(option);
    }

    const currentChatIsVisible =
        matchingChats.some(function (chat) {
            return chat.id === conversationId;
        });

    savedChats.value =
        currentChatIsVisible
            ? String(conversationId)
            : "";
}


async function refreshSavedChats() {
    try {
        const response =
            await fetch("/conversations");

        const chats =
            await readResponse(response);

        if (!Array.isArray(chats)) {
            throw new Error(
                "Invalid conversation list."
            );
        }

        savedChatList = chats;

        renderSavedChats();

        return true;

    } catch {
        return false;
    }
}


// ==========================================
// Shared-note helper functions
// ==========================================

// Return a safe owner name
function getSharedNoteOwnerName(note) {
    if (
        note &&
        note.owner &&
        typeof note.owner.username === "string"
    ) {
        return note.owner.username;
    }

    return "Unknown student";
}


// Format the database date for display
function formatSharedNoteDate(dateValue) {
    if (!dateValue) {
        return "";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString();
}


// Copy a Map without sharing the same Map object
function copySharedNoteMap(sourceMap) {
    return new Map(
        Array.from(sourceMap.entries())
    );
}


// ==========================================
// Display applied shared-note chips
// ==========================================
function renderSelectedSharedNotes() {
    selectedSharedNotesContainer.replaceChildren();

    if (selectedSharedNotes.size === 0) {
        const empty =
            document.createElement("span");

        empty.className = "no-shared-notes";
        empty.textContent =
            "No shared notes selected";

        selectedSharedNotesContainer.appendChild(
            empty
        );

        return;
    }

    for (
        const [noteId, note]
        of selectedSharedNotes.entries()
    ) {
        const chip =
            document.createElement("span");

        chip.className = "shared-note-chip";

        const chipText =
            document.createElement("span");

        chipText.className =
            "shared-note-chip-text";

        const ownerName =
            getSharedNoteOwnerName(note);

        chipText.textContent =
            `${note.title} — ${ownerName}`;

        chipText.title =
            `"${note.title}" shared by ${ownerName}`;

        const removeButton =
            document.createElement("button");

        removeButton.type = "button";

        removeButton.className =
            "shared-note-chip-remove";

        removeButton.textContent = "×";

        removeButton.title =
            `Remove ${note.title}`;

        removeButton.setAttribute(
            "aria-label",
            `Remove shared note ${note.title}`
        );

        removeButton.disabled = isSending;

        removeButton.addEventListener(
            "click",
            function () {
                selectedSharedNotes.delete(noteId);
                renderSelectedSharedNotes();
                messageInput.focus();
            }
        );

        chip.appendChild(chipText);
        chip.appendChild(removeButton);

        selectedSharedNotesContainer.appendChild(
            chip
        );
    }
}


// Clear all currently applied shared notes
function clearSelectedSharedNotes() {
    selectedSharedNotes.clear();
    draftSelectedSharedNotes.clear();
    renderSelectedSharedNotes();
}


// ==========================================
// Update selection count and checkbox states
// ==========================================
function updateSharedNoteSelectionState() {
    const selectionCount =
        draftSelectedSharedNotes.size;

    selectedSharedNoteCount.textContent =
        `${selectionCount} of 5 notes selected`;

    const limitReached = selectionCount >= 5;

    sharedNoteList
        .querySelectorAll(".shared-note-option")
        .forEach(function (option) {
            const checkbox =
                option.querySelector(
                    'input[type="checkbox"]'
                );

            if (!checkbox) {
                return;
            }

            option.classList.toggle(
                "selected",
                checkbox.checked
            );

            const shouldDisable =
                limitReached && !checkbox.checked;

            checkbox.disabled = shouldDisable;

            option.classList.toggle(
                "disabled",
                shouldDisable
            );
        });
}


// ==========================================
// Render notes from one selected student
// ==========================================
function renderSharedNoteChoices(notes) {
    sharedNoteList.replaceChildren();

    if (!Array.isArray(notes) || notes.length === 0) {
        const empty =
            document.createElement("div");

        empty.className = "shared-note-empty";

        empty.textContent =
            "This student currently has no notes available to you.";

        sharedNoteList.appendChild(empty);
        updateSharedNoteSelectionState();

        return;
    }

    for (const note of notes) {
        const noteId = Number(note.note_id);

        if (!Number.isInteger(noteId)) {
            continue;
        }

        const label =
            document.createElement("label");

        label.className = "shared-note-option";

        const checkbox =
            document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.value = String(noteId);

        checkbox.checked =
            draftSelectedSharedNotes.has(noteId);

        checkbox.setAttribute(
            "aria-label",
            `Select ${note.title}`
        );

        const details =
            document.createElement("span");

        details.className =
            "shared-note-details";

        const title =
            document.createElement("span");

        title.className =
            "shared-note-title";

        title.textContent = note.title;

        const owner =
            document.createElement("span");

        owner.className =
            "shared-note-owner";

        owner.textContent =
            `Shared by ${getSharedNoteOwnerName(note)}`;

        details.appendChild(title);
        details.appendChild(owner);

        const formattedDate =
            formatSharedNoteDate(note.created_at);

        if (formattedDate) {
            const date =
                document.createElement("span");

            date.className =
                "shared-note-date";

            date.textContent =
                `Created ${formattedDate}`;

            details.appendChild(date);
        }

        checkbox.addEventListener(
            "change",
            function () {
                if (checkbox.checked) {
                    if (
                        draftSelectedSharedNotes.size >= 5
                    ) {
                        checkbox.checked = false;

                        setSharedNoteStatus(
                            "You can select a maximum of five shared notes.",
                            true
                        );

                        updateSharedNoteSelectionState();
                        return;
                    }

                    draftSelectedSharedNotes.set(
                        noteId,
                        {
                            note_id: noteId,
                            title: note.title,
                            owner: note.owner,
                            created_at: note.created_at
                        }
                    );

                } else {
                    draftSelectedSharedNotes.delete(
                        noteId
                    );
                }

                setSharedNoteStatus("");
                updateSharedNoteSelectionState();
            }
        );

        label.appendChild(checkbox);
        label.appendChild(details);

        sharedNoteList.appendChild(label);
    }

    updateSharedNoteSelectionState();
}


// ==========================================
// Load notes shared by one student
// ==========================================
async function loadNotesForStudent(ownerId) {
    sharedNoteList.replaceChildren();

    if (!ownerId) {
        const empty =
            document.createElement("div");

        empty.className = "shared-note-empty";

        empty.textContent =
            "Choose a student to view notes shared with you.";

        sharedNoteList.appendChild(empty);

        setSharedNoteStatus("");
        updateSharedNoteSelectionState();

        return;
    }

    setSharedDialogLoading(true);

    setSharedNoteStatus(
        "Loading shared notes…"
    );

    try {
        const response = await fetch(
            `/shared-notes?owner_id=${encodeURIComponent(ownerId)}` +
            "&offset=0&limit=100"
        );

        const data =
            await readResponse(response);

        if (!Array.isArray(data.notes)) {
            throw new Error(
                "The server returned an invalid shared-note list."
            );
        }

        renderSharedNoteChoices(data.notes);

        setSharedNoteStatus(
            data.notes.length === 0
                ? "No available notes were found for this student."
                : ""
        );

    } catch (error) {
        sharedNoteList.replaceChildren();

        const empty =
            document.createElement("div");

        empty.className = "shared-note-empty";

        empty.textContent =
            "The shared notes could not be loaded.";

        sharedNoteList.appendChild(empty);

        setSharedNoteStatus(
            error instanceof Error
                ? error.message
                : "Could not load shared notes.",
            true
        );

    } finally {
        setSharedDialogLoading(false);
        updateSharedNoteSelectionState();
    }
}


// ==========================================
// Load students who shared notes
// ==========================================
async function loadSharedStudents() {
    const previousStudentId =
        sharedNoteStudent.value;

    setSharedDialogLoading(true);

    setSharedNoteStatus(
        "Loading students…"
    );

    try {
        const response = await fetch(
            "/shared-notes/students?offset=0&limit=100"
        );

        const data =
            await readResponse(response);

        if (!Array.isArray(data.students)) {
            throw new Error(
                "The server returned an invalid student list."
            );
        }

        sharedNoteStudent.replaceChildren();

        const placeholder =
            document.createElement("option");

        placeholder.value = "";

        placeholder.textContent =
            data.students.length === 0
                ? "No students have shared notes with you"
                : "Choose a student";

        sharedNoteStudent.appendChild(placeholder);

        for (const student of data.students) {
            const option =
                document.createElement("option");

            option.value = String(student.id);
            option.textContent = student.username;

            sharedNoteStudent.appendChild(option);
        }

        const studentIds =
            data.students.map(function (student) {
                return String(student.id);
            });

        let studentToSelect = "";

        // Preserve the currently viewed student
        if (
            previousStudentId &&
            studentIds.includes(previousStudentId)
        ) {
            studentToSelect = previousStudentId;
        }

        // Otherwise show the owner of the first selected note
        if (
            !studentToSelect &&
            draftSelectedSharedNotes.size > 0
        ) {
            const firstSelected =
                draftSelectedSharedNotes
                    .values()
                    .next()
                    .value;

            const selectedOwnerId =
                firstSelected &&
                firstSelected.owner
                    ? String(firstSelected.owner.id)
                    : "";

            if (
                selectedOwnerId &&
                studentIds.includes(selectedOwnerId)
            ) {
                studentToSelect = selectedOwnerId;
            }
        }

        sharedNoteStudent.value =
            studentToSelect;

        if (data.students.length === 0) {
            sharedNoteList.replaceChildren();

            const empty =
                document.createElement("div");

            empty.className = "shared-note-empty";

            empty.textContent =
                "No students currently have notes available to you.";

            sharedNoteList.appendChild(empty);

            setSharedNoteStatus(
                "A note appears here only when another student shares it with you."
            );

        } else {
            setSharedNoteStatus("");

            await loadNotesForStudent(
                studentToSelect
            );
        }

    } catch (error) {
        sharedNoteStudent.replaceChildren();

        const placeholder =
            document.createElement("option");

        placeholder.value = "";
        placeholder.textContent =
            "Could not load students";

        sharedNoteStudent.appendChild(placeholder);

        sharedNoteList.replaceChildren();

        const empty =
            document.createElement("div");

        empty.className = "shared-note-empty";

        empty.textContent =
            "The shared-student list could not be loaded.";

        sharedNoteList.appendChild(empty);

        setSharedNoteStatus(
            error instanceof Error
                ? error.message
                : "Could not load shared students.",
            true
        );

    } finally {
        setSharedDialogLoading(false);
        updateSharedNoteSelectionState();
    }
}


// ==========================================
// Validate selected notes before sending
// ==========================================
async function validateSelectedSharedNotes() {
    if (selectedSharedNotes.size === 0) {
        return 0;
    }

    const selectedIds =
        Array.from(selectedSharedNotes.keys());

    const results = await Promise.all(
        selectedIds.map(async function (noteId) {
            const response = await fetch(
                `/shared-notes/${noteId}`
            );

            if (response.status === 404) {
                return {
                    noteId,
                    available: false
                };
            }

            const note =
                await readResponse(response);

            return {
                noteId,
                available: true,
                note
            };
        })
    );

    let removedCount = 0;

    for (const result of results) {
        if (!result.available) {
            selectedSharedNotes.delete(
                result.noteId
            );

            removedCount += 1;
            continue;
        }

        selectedSharedNotes.set(
            result.noteId,
            {
                note_id: result.note.note_id,
                title: result.note.title,
                owner: result.note.owner,
                created_at: result.note.created_at
            }
        );
    }

    renderSelectedSharedNotes();

    return removedCount;
}


// ==========================================
// Open Shared Notes dialog
// ==========================================
openSharedNotesButton.addEventListener(
    "click",
    async function () {
        if (isSending) {
            return;
        }

        draftSelectedSharedNotes =
            copySharedNoteMap(
                selectedSharedNotes
            );

        setSharedNoteStatus("");
        updateSharedNoteSelectionState();

        if (!sharedNotesDialog.open) {
            sharedNotesDialog.showModal();
        }

        try {
            const removedCount =
                await validateSelectedSharedNotes();

            draftSelectedSharedNotes =
                copySharedNoteMap(
                    selectedSharedNotes
                );

            if (removedCount > 0) {
                setSharedNoteStatus(
                    `${removedCount} unavailable shared note` +
                    `${removedCount === 1 ? " was" : "s were"} removed.`,
                    true
                );
            }

        } catch (error) {
            setSharedNoteStatus(
                error instanceof Error
                    ? error.message
                    : "Could not verify selected notes.",
                true
            );
        }

        await loadSharedStudents();
    }
);


// ==========================================
// Student changed inside dialog
// ==========================================
sharedNoteStudent.addEventListener(
    "change",
    async function () {
        await loadNotesForStudent(
            sharedNoteStudent.value
        );
    }
);


// ==========================================
// Refresh shared students and notes
// ==========================================
refreshSharedNotesButton.addEventListener(
    "click",
    async function () {
        await loadSharedStudents();
    }
);


// ==========================================
// Apply dialog selection
// ==========================================
applySharedNotesButton.addEventListener(
    "click",
    function () {
        selectedSharedNotes =
            copySharedNoteMap(
                draftSelectedSharedNotes
            );

        renderSelectedSharedNotes();

        sharedNotesDialog.close();

        setStatus(
            selectedSharedNotes.size > 0
                ? `${selectedSharedNotes.size} shared note` +
                  `${selectedSharedNotes.size === 1 ? "" : "s"} selected as sources.`
                : ""
        );

        messageInput.focus();
    }
);


// ==========================================
// Cancel or close dialog
// ==========================================
function closeSharedNotesDialog() {
    draftSelectedSharedNotes =
        copySharedNoteMap(
            selectedSharedNotes
        );

    if (sharedNotesDialog.open) {
        sharedNotesDialog.close();
    }

    messageInput.focus();
}


cancelSharedNotesButton.addEventListener(
    "click",
    closeSharedNotesDialog
);


closeSharedNotesButton.addEventListener(
    "click",
    closeSharedNotesDialog
);


// Clicking the dark backdrop closes the dialog
sharedNotesDialog.addEventListener(
    "click",
    function (event) {
        if (event.target === sharedNotesDialog) {
            closeSharedNotesDialog();
        }
    }
);


// Escape closes the dialog without applying changes
sharedNotesDialog.addEventListener(
    "cancel",
    function () {
        draftSelectedSharedNotes =
            copySharedNoteMap(
                selectedSharedNotes
            );
    }
);


// ==========================================
// Send a question
// ==========================================
chatForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();

        if (isSending) {
            return;
        }

        const question =
            messageInput.value.trim();

        if (!question) {
            setStatus(
                "Please type a question first.",
                true
            );

            return;
        }

        if (question.length > 10000) {
            setStatus(
                "Please keep your question under 10,000 characters.",
                true
            );

            return;
        }

        if (conversation.length >= 40) {
            setStatus(
                "Conversation limit reached. " +
                "Click New Chat to continue.",
                true
            );

            return;
        }

        const userMessage = {
            role: "user",
            content: question
        };

        const userBubble =
            addMessage("user", question);

        messageInput.value = "";

        setLoading(true);
        setStatus("Checking note access…");

        try {
            // Check that the student still has permission.
            const removedCount =
                await validateSelectedSharedNotes();

            if (removedCount > 0) {
                throw new Error(
                    `${removedCount} selected shared note` +
                    `${removedCount === 1 ? " is" : "s are"} ` +
                    "no longer available and were removed. " +
                    "Review your sources and send the question again."
                );
            }

            setStatus("Claude is thinking…");

            // Create a database conversation for the first question
            if (conversationId === null) {
                const createResponse =
                    await fetch(
                        "/conversations",
                        {
                            method: "POST"
                        }
                    );

                const newConversation =
                    await readResponse(
                        createResponse
                    );

                if (
                    !Number.isInteger(
                        newConversation.id
                    )
                ) {
                    throw new Error(
                        "The server did not return a conversation ID."
                    );
                }

                conversationId =
                    newConversation.id;
            }

            const selectedNoteIds =
                Array.from(
                    selectedSharedNotes.keys()
                );

            // FastAPI retrieves previous chat messages
            // from PostgreSQL.
            const response = await fetch(
                "/chat",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        conversation_id:
                            conversationId,

                        messages: [
                            userMessage
                        ],

                        selected_shared_note_ids:
                            selectedNoteIds
                    })
                }
            );

            const data =
                await readResponse(response);

            if (
                typeof data.reply !== "string" ||
                !data.reply.trim()
            ) {
                throw new Error(
                    "No answer was received. Please try again."
                );
            }

            conversation.push(
                userMessage,
                {
                    role: "assistant",
                    content: data.reply
                }
            );

            addMessage(
                "assistant",
                data.reply
            );

            setStatus(
                conversation.length >= 40
                    ? "Conversation limit reached. " +
                      "Click New Chat to continue."
                    : ""
            );

            const listLoaded =
                await refreshSavedChats();

            if (!listLoaded) {
                setStatus(
                    "Your reply was received, but the saved-chat " +
                    "list could not refresh. Reload the page to try again.",
                    true
                );
            }

        } catch (error) {
            userBubble.remove();
            messageInput.value = question;

            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Could not send the message. Please try again.";

            const lowerMessage =
                errorMessage.toLowerCase();

            // Backend rejected a revoked/private note
            if (
                lowerMessage.includes(
                    "selected notes are unavailable"
                ) ||
                lowerMessage.includes(
                    "selected shared note"
                ) ||
                lowerMessage.includes(
                    "selected notes"
                )
            ) {
                clearSelectedSharedNotes();

                setStatus(
                    "One or more selected shared notes are no longer " +
                    "available. They were removed. Select the notes " +
                    "again and resend your question.",
                    true
                );

            } else {
                setStatus(
                    errorMessage,
                    true
                );
            }

        } finally {
            setLoading(false);
            messageInput.focus();
        }
    }
);


// ==========================================
// Start a new chat
// ==========================================
clearButton.addEventListener(
    "click",
    function () {
        if (isSending) {
            return;
        }

        conversation = [];
        conversationId = null;

        clearSelectedSharedNotes();

        savedChats.value = "";
        chatMessages.replaceChildren();
        messageInput.value = "";

        setStatus("");

        addMessage(
            "assistant",
            "Hi! What would you like to learn today?"
        );

        messageInput.focus();
    }
);


// ==========================================
// Open a saved conversation
// ==========================================
savedChats.addEventListener(
    "change",
    async function () {
        if (isSending) {
            return;
        }

        if (!savedChats.value) {
            savedChats.value =
                conversationId === null
                    ? ""
                    : String(conversationId);

            return;
        }

        const selectedId =
            Number(savedChats.value);

        setLoading(true);

        setStatus(
            "Loading conversation…"
        );

        try {
            const response = await fetch(
                `/conversations/${selectedId}/messages`
            );

            const data =
                await readResponse(response);

            if (!Array.isArray(data.messages)) {
                throw new Error(
                    "The server returned invalid chat history."
                );
            }

            const loadedMessages =
                data.messages.map(
                    function (message) {
                        return {
                            role: message.role,
                            content: message.content
                        };
                    }
                );

            conversationId = data.id;
            conversation = loadedMessages;

            // Sources are request-specific.
            // Do not silently carry them into another chat.
            clearSelectedSharedNotes();

            chatMessages.replaceChildren();
            messageInput.value = "";

            for (const message of conversation) {
                addMessage(
                    message.role,
                    message.content
                );
            }

            if (conversation.length === 0) {
                addMessage(
                    "assistant",
                    "This conversation is empty. " +
                    "Ask your first question!"
                );
            }

            setStatus(
                conversation.length >= 40
                    ? "Conversation limit reached. " +
                      "Click New Chat to continue."
                    : ""
            );

        } catch (error) {
            savedChats.value =
                conversationId === null
                    ? ""
                    : String(conversationId);

            setStatus(
                error instanceof Error
                    ? error.message
                    : "Could not open this conversation.",
                true
            );

        } finally {
            setLoading(false);
            messageInput.focus();
        }
    }
);


// ==========================================
// Initialize chatbot
// ==========================================
async function initializeChat() {
    renderSelectedSharedNotes();

    setLoading(true);

    setStatus(
        "Loading saved chats…"
    );

    const listLoaded =
        await refreshSavedChats();

    if (listLoaded) {
        setStatus("");

    } else {
        setStatus(
            "Could not load saved chats. " +
            "Check that FastAPI is running, then reload the page.",
            true
        );
    }

    setLoading(false);
}


initializeChat();


// ==========================================
// Enter sends; Shift + Enter creates new line
// ==========================================
messageInput.addEventListener(
    "keydown",
    function (event) {
        if (event.isComposing) {
            return;
        }

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {
            event.preventDefault();

            if (
                !isSending &&
                !event.repeat
            ) {
                chatForm.requestSubmit();
            }
        }
    }
);


// ==========================================
// Delete selected conversation
// ==========================================
deleteButton.addEventListener(
    "click",
    async function () {
        if (isSending) {
            return;
        }

        if (conversationId === null) {
            setStatus(
                "Select a saved conversation to delete.",
                true
            );

            return;
        }

        const confirmed =
            window.confirm(
                "Permanently delete this conversation and all " +
                "its messages? This cannot be undone."
            );

        if (!confirmed) {
            return;
        }

        const idToDelete =
            conversationId;

        setLoading(true);

        setStatus(
            "Deleting conversation…"
        );

        try {
            const response = await fetch(
                `/conversations/${idToDelete}`,
                {
                    method: "DELETE"
                }
            );

            await readResponse(response);

            conversation = [];
            conversationId = null;

            clearSelectedSharedNotes();

            savedChats.value = "";
            chatMessages.replaceChildren();
            messageInput.value = "";

            savedChatList =
                savedChatList.filter(
                    function (chat) {
                        return chat.id !== idToDelete;
                    }
                );

            renderSavedChats();

            addMessage(
                "assistant",
                "Hi! What would you like to learn today?"
            );

            const listLoaded =
                await refreshSavedChats();

            setStatus(
                listLoaded
                    ? "Conversation deleted."
                    : "Conversation deleted, but the chat list " +
                      "could not refresh. Reload the page.",
                !listLoaded
            );

        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : "Could not delete the conversation.",
                true
            );

        } finally {
            setLoading(false);
            messageInput.focus();
        }
    }
);


// ==========================================
// Download selected conversation
// ==========================================
downloadButton.addEventListener(
    "click",
    async function () {
        if (isSending) {
            return;
        }

        if (conversationId === null) {
            setStatus(
                "Select a saved conversation to download.",
                true
            );

            return;
        }

        const idToDownload =
            conversationId;

        setLoading(true);

        setStatus(
            "Preparing your download…"
        );

        try {
            const response = await fetch(
                `/conversations/${idToDownload}/messages`
            );

            const data =
                await readResponse(response);

            if (!Array.isArray(data.messages)) {
                throw new Error(
                    "The server returned invalid chat history."
                );
            }

            const lines = [
                "STUDENT CHATBOT",
                "",
                `Title: ${data.title}`,
                `Conversation ID: ${data.id}`,
                `Exported: ${new Date().toISOString()}`,
                "",
                "----------------------------------------",
                ""
            ];

            if (data.messages.length === 0) {
                lines.push(
                    "This conversation has no messages."
                );
            }

            for (const message of data.messages) {
                const speaker =
                    message.role === "user"
                        ? "You"
                        : "Claude";

                lines.push(
                    `${speaker}:`,
                    message.content,
                    "",
                    "----------------------------------------",
                    ""
                );
            }

            const text =
                lines.join("\n");

            const file =
                new Blob(
                    [text],
                    {
                        type:
                            "text/plain;charset=utf-8"
                    }
                );

            const fileUrl =
                URL.createObjectURL(file);

            const link =
                document.createElement("a");

            link.href = fileUrl;

            link.download =
                `student-chat-${data.id}.txt`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(function () {
                URL.revokeObjectURL(fileUrl);
            }, 1000);

            setStatus(
                "Download requested. Check your browser’s downloads."
            );

        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : "Could not download the conversation.",
                true
            );

        } finally {
            setLoading(false);
        }
    }
);


// ==========================================
// Rename selected conversation
// ==========================================
renameButton.addEventListener(
    "click",
    async function () {
        if (isSending) {
            return;
        }

        if (conversationId === null) {
            setStatus(
                "Select a saved conversation to rename.",
                true
            );

            return;
        }

        const idToRename =
            conversationId;

        setLoading(true);

        setStatus(
            "Loading conversation title…"
        );

        try {
            const response = await fetch(
                `/conversations/${idToRename}/messages`
            );

            const conversationData =
                await readResponse(response);

            const enteredTitle =
                window.prompt(
                    "Enter a new conversation title:",
                    conversationData.title
                );

            if (enteredTitle === null) {
                setStatus("");
                return;
            }

            const newTitle =
                enteredTitle.trim();

            if (!newTitle) {
                setStatus(
                    "The title cannot be blank.",
                    true
                );

                return;
            }

            if (
                Array.from(newTitle).length > 200
            ) {
                setStatus(
                    "Keep the title within 200 characters.",
                    true
                );

                return;
            }

            const renameResponse =
                await fetch(
                    `/conversations/${idToRename}`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            title: newTitle
                        })
                    }
                );

            const renamedChat =
                await readResponse(
                    renameResponse
                );

            savedChatList =
                savedChatList.map(
                    function (chat) {
                        if (
                            chat.id === idToRename
                        ) {
                            return {
                                ...chat,
                                title:
                                    renamedChat.title
                            };
                        }

                        return chat;
                    }
                );

            renderSavedChats();

            setStatus(
                "Conversation renamed."
            );

        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : "Could not rename the conversation.",
                true
            );

        } finally {
            setLoading(false);
        }
    }
);


// ==========================================
// Filter saved chats
// ==========================================
chatSearch.addEventListener(
    "input",
    renderSavedChats
);