const openAssistant = document.getElementById("open-assistant");
const closeAssistant = document.getElementById("close-assistant");
const assistantPanel = document.getElementById("assistant-panel");
const assistantFrame = document.getElementById("assistant-frame");
const notesPage = document.querySelector(".dashboard-page");

const smallScreen = window.matchMedia("(max-width: 850px)");

function updateNotesAccess() {
    // When the chat covers the screen, prevent focus behind it
    notesPage.inert =
        !assistantPanel.hidden && smallScreen.matches;
}

function closeChatPanel() {
    assistantPanel.hidden = true;
    document.body.classList.remove("assistant-open");

    openAssistant.hidden = false;
    openAssistant.setAttribute("aria-expanded", "false");

    updateNotesAccess();
    openAssistant.focus();
}

openAssistant.addEventListener("click", function () {
    // Load the authenticated chat page only when first opened
    if (!assistantFrame.getAttribute("src")) {
        assistantFrame.src = "/assistant";
    }

    assistantPanel.hidden = false;
    document.body.classList.add("assistant-open");

    openAssistant.hidden = true;
    openAssistant.setAttribute("aria-expanded", "true");

    updateNotesAccess();
    closeAssistant.focus();
});

closeAssistant.addEventListener("click", closeChatPanel);

smallScreen.addEventListener("change", updateNotesAccess);