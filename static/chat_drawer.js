const historyToggle = document.getElementById("toggle-chat-history");
const historyDrawer = document.getElementById("chat-history-drawer");
const chatbotLayout = document.querySelector(".app-layout");

function setHistoryOpen(open) {
    historyDrawer.hidden = !open;

    chatbotLayout.classList.toggle("history-open", open);

    historyToggle.setAttribute("aria-expanded", String(open));
    historyToggle.setAttribute(
        "aria-label",
        open ? "Close chat history" : "Open chat history"
    );

    historyToggle.title =
        open ? "Close chat history" : "Open chat history";
}

historyToggle.addEventListener("click", function () {
    setHistoryOpen(historyDrawer.hidden);
});

// Escape closes the drawer and returns focus to the spider button
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !historyDrawer.hidden) {
        setHistoryOpen(false);
        historyToggle.focus();
    }
});

// Close after choosing a saved conversation.
// Your existing chat.js still handles loading its messages.
document.getElementById("saved-chats").addEventListener(
    "change",
    function () {
        if (this.value) {
            setHistoryOpen(false);
            historyToggle.focus();
        }
    }
);

setHistoryOpen(false);