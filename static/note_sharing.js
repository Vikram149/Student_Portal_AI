(() => {
    "use strict";


    // =============================================
    // FIND PAGE ELEMENTS
    // =============================================

    const findElement = (id) => {
        return document.getElementById(id);
    };


    const dialog =
        findElement("note-sharing-dialog");


    // Stop if this page does not contain the dialog.
    if (!dialog) {
        return;
    }


    const form =
        findElement("note-sharing-form");

    const controls =
        findElement("sharing-controls");

    const sharingMode =
        findElement("sharing-mode");

    const studentSection =
        findElement("sharing-students");

    const searchInput =
        findElement("sharing-search");

    const searchResults =
        findElement("sharing-results");

    const selectedStudentsBox =
        findElement("sharing-selected");

    const selectionCount =
        findElement("sharing-selection-count");

    const saveButton =
        findElement("sharing-save");

    const cancelButton =
        findElement("sharing-cancel");

    const closeButton =
        findElement("sharing-close");

    const dialogMessage =
        findElement("sharing-message");

    const searchStatus =
        findElement("sharing-search-status");

    const noteTitle =
        findElement("sharing-note-title");

    const dashboardFeedback =
        findElement("note-sharing-feedback");


    // =============================================
    // CURRENT DIALOG STATE
    // =============================================

    let currentNoteId = null;

    let buttonThatOpenedDialog = null;

    /*
     * Map structure:
     *
     * student ID -> username
     *
     * Example:
     * 2 -> "Test1"
     */
    let selectedStudents = new Map();

    let currentSearchMatches = [];

    let settingsLoaded = false;

    let saving = false;

    let dialogGeneration = 0;

    let searchVersion = 0;

    let searchTimer = null;

    let searchController = null;

    let settingsController = null;


    // =============================================
    // DISPLAY A DIALOG MESSAGE
    // =============================================

    function showDialogMessage(
        text,
        isError = false
    ) {
        dialogMessage.textContent = text;

        dialogMessage.classList.toggle(
            "sharing-error",
            isError
        );
    }


    // =============================================
    // SEND AN API REQUEST
    // =============================================

    async function apiRequest(
        url,
        options = {}
    ) {
        const response = await fetch(
            url,
            {
                credentials: "same-origin",
                cache: "no-store",

                ...options,

                headers: {
                    "Accept": "application/json",
                    ...options.headers,
                },
            }
        );


        let data = null;


        try {
            data = await response.json();
        }
        catch {
            data = null;
        }


        /*
         * If FastAPI redirected the request to login,
         * the student's session probably expired.
         */
        if (
            response.status === 401 ||
            response.redirected
        ) {
            throw new Error(
                "Your session expired. Log in again, " +
                "then reopen sharing."
            );
        }


        if (!response.ok) {

            const errorMessage =
                typeof data?.detail === "string"
                    ? data.detail
                    : (
                        "Could not complete the request. " +
                        "Please try again."
                    );

            throw new Error(errorMessage);
        }


        if (!data) {
            throw new Error(
                "Unexpected server response. " +
                "Please try again."
            );
        }


        return data;
    }


    // =============================================
    // ENABLE OR DISABLE SAVE
    // =============================================

    function updateSaveButton() {

        const selectedModeNeedsStudent =
            sharingMode.value ===
                "selected_students" &&
            selectedStudents.size === 0;


        saveButton.disabled =
            !settingsLoaded ||
            saving ||
            selectedModeNeedsStudent;
    }


    // =============================================
    // SHOW SELECTED STUDENTS
    // =============================================

    function renderSelectedStudents() {

        selectedStudentsBox.replaceChildren();


        selectionCount.textContent =
            `${selectedStudents.size} of 100 ` +
            "students selected";


        for (
            const [studentId, username]
            of selectedStudents
        ) {
            const removeButton =
                document.createElement("button");


            removeButton.type = "button";

            removeButton.textContent =
                `${username} ×`;

            removeButton.setAttribute(
                "aria-label",
                `Remove ${username}`
            );


            removeButton.addEventListener(
                "click",
                () => {

                    selectedStudents.delete(
                        studentId
                    );

                    renderSelectedStudents();

                    renderSearchResults();
                }
            );


            selectedStudentsBox.append(
                removeButton
            );
        }


        updateSaveButton();
    }


    // =============================================
    // SHOW STUDENT SEARCH RESULTS
    // =============================================

    function renderSearchResults() {

        searchResults.replaceChildren();


        for (
            const student
            of currentSearchMatches
        ) {
            const label =
                document.createElement("label");

            label.className = "sharing-result";


            const checkbox =
                document.createElement("input");

            checkbox.type = "checkbox";

            checkbox.checked =
                selectedStudents.has(student.id);


            /*
             * Backend supports no more than
             * 100 selected recipients.
             */
            checkbox.disabled =
                !checkbox.checked &&
                selectedStudents.size >= 100;


            checkbox.addEventListener(
                "change",
                () => {

                    if (checkbox.checked) {

                        selectedStudents.set(
                            student.id,
                            student.username
                        );

                    }
                    else {

                        selectedStudents.delete(
                            student.id
                        );

                    }


                    renderSelectedStudents();


                    /*
                     * Update the other result checkboxes
                     * without rebuilding the entire list.
                     */
                    const checkboxes =
                        searchResults.querySelectorAll(
                            'input[type="checkbox"]'
                        );


                    for (
                        const resultCheckbox
                        of checkboxes
                    ) {
                        resultCheckbox.disabled =
                            !resultCheckbox.checked &&
                            selectedStudents.size >= 100;
                    }
                }
            );


            const usernameText =
                document.createElement("span");

            /*
             * textContent is used so usernames are
             * displayed as text, not interpreted as HTML.
             */
            usernameText.textContent =
                student.username;


            label.append(
                checkbox,
                usernameText
            );


            searchResults.append(label);
        }
    }


    // =============================================
    // CANCEL AN OLD SEARCH
    // =============================================

    function cancelOldSearch() {

        clearTimeout(searchTimer);

        if (searchController) {
            searchController.abort();
        }

        searchVersion += 1;
    }


    // =============================================
    // HANDLE SHARING MODE CHANGES
    // =============================================

    function handleSharingModeChange() {

        const isSelectedStudents =
            sharingMode.value ===
            "selected_students";


        studentSection.hidden =
            !isSelectedStudents;


        if (!isSelectedStudents) {
            cancelOldSearch();
        }


        renderSelectedStudents();


        if (
            isSelectedStudents &&
            searchInput.value.trim().length >= 2
        ) {
            scheduleStudentSearch();
        }
    }


    // =============================================
    // SEARCH FOR STUDENTS
    // =============================================

    function scheduleStudentSearch() {

        cancelOldSearch();


        currentSearchMatches = [];

        renderSearchResults();


        const query =
            searchInput.value.trim();


        if (query.length < 2) {

            searchStatus.textContent =
                "Type at least two characters " +
                "to search.";

            return;
        }


        const thisSearchVersion =
            searchVersion;

        const thisDialogGeneration =
            dialogGeneration;


        searchStatus.textContent =
            "Searching…";


        /*
         * Wait briefly before searching.
         * This avoids sending a request after
         * every single key press.
         */
        searchTimer = setTimeout(
            async () => {

                searchController =
                    new AbortController();


                try {
                    const data =
                        await apiRequest(
                            "/sharing/students?q=" +
                            encodeURIComponent(query),
                            {
                                signal:
                                    searchController.signal,
                            }
                        );


                    /*
                     * Ignore an old response if the
                     * dialog was closed or another
                     * search has already started.
                     */
                    if (
                        thisSearchVersion
                            !== searchVersion ||
                        thisDialogGeneration
                            !== dialogGeneration ||
                        !dialog.open
                    ) {
                        return;
                    }


                    currentSearchMatches =
                        data.students;


                    renderSearchResults();


                    if (data.has_more) {

                        searchStatus.textContent =
                            "Showing the first 20 matches. " +
                            "Type more characters to " +
                            "narrow the search.";

                    }
                    else if (
                        currentSearchMatches.length > 0
                    ) {

                        searchStatus.textContent =
                            "Select the students you " +
                            "want to share with.";

                    }
                    else {

                        searchStatus.textContent =
                            "No matching students found.";

                    }
                }
                catch (error) {

                    if (
                        error.name !== "AbortError" &&
                        thisSearchVersion
                            === searchVersion &&
                        thisDialogGeneration
                            === dialogGeneration
                    ) {
                        searchStatus.textContent =
                            error.message;
                    }
                }
            },
            300
        );
    }


    // =============================================
    // UPDATE THE NOTE CARD STATUS
    // =============================================

    function updateNoteSharingBadge(data) {

    const badge =
        findElement(
            `note-sharing-status-${data.note_id}`
        );


    if (!badge) {
        return;
    }


    if (data.sharing_mode === "private") {

        badge.textContent = "🔒";

        badge.title = "Private";

        badge.setAttribute(
            "aria-label",
            "Private"
        );

    }
    else if (
        data.sharing_mode === "all_students"
    ) {

        badge.textContent = "🌐";

        badge.title =
            "Shared with all students";

        badge.setAttribute(
            "aria-label",
            "Shared with all students"
        );

    }
    else {

        const recipients =
            data.recipients || [];


        badge.textContent = "👥";


        const recipientNames =
            recipients
                .map((student) => student.username)
                .join(", ");


        const description =
            recipientNames
                ? `Shared with ${recipientNames}`
                : "Shared with selected students";


        badge.title = description;

        badge.setAttribute(
            "aria-label",
            description
        );
    }
}


    // =============================================
    // OPEN THE SHARING DIALOG
    // =============================================

    async function openSharingDialog(button) {

        dialogGeneration += 1;


        const thisDialogGeneration =
            dialogGeneration;


        currentNoteId =
            Number(button.dataset.noteId);

        buttonThatOpenedDialog =
            button;


        selectedStudents =
            new Map();

        currentSearchMatches = [];

        settingsLoaded = false;

        saving = false;


        searchInput.value = "";

        sharingMode.value = "private";

        controls.disabled = true;

        noteTitle.textContent = "";

        dashboardFeedback.textContent = "";


        searchStatus.textContent =
            "Type at least two characters " +
            "to search.";


        handleSharingModeChange();

        renderSearchResults();


        showDialogMessage(
            "Loading current sharing settings…"
        );


        dialog.showModal();


        settingsController =
            new AbortController();


        try {
            const data =
                await apiRequest(
                    `/notes/${currentNoteId}/sharing`,
                    {
                        signal:
                            settingsController.signal,
                    }
                );


            if (
                thisDialogGeneration
                    !== dialogGeneration ||
                !dialog.open
            ) {
                return;
            }


            noteTitle.textContent =
                data.title;


            sharingMode.value =
                data.sharing_mode;


            selectedStudents =
                new Map(
                    data.recipients.map(
                        (student) => [
                            student.id,
                            student.username,
                        ]
                    )
                );


            settingsLoaded = true;

            controls.disabled = false;


            updateNoteSharingBadge(data);

            handleSharingModeChange();


            showDialogMessage(
                "Changes take effect when you " +
                "choose Save changes."
            );
        }
        catch (error) {

            if (
                error.name !== "AbortError" &&
                thisDialogGeneration
                    === dialogGeneration
            ) {
                showDialogMessage(
                    error.message,
                    true
                );
            }
        }
    }


    // =============================================
    // CLOSE THE SHARING DIALOG
    // =============================================

    function closeSharingDialog() {

        if (!saving) {
            dialog.close();
        }
    }


    closeButton.addEventListener(
        "click",
        closeSharingDialog
    );


    cancelButton.addEventListener(
        "click",
        closeSharingDialog
    );


    /*
     * Escape can close the dialog unless
     * a save request is currently running.
     */
    dialog.addEventListener(
        "cancel",
        (event) => {

            if (saving) {
                event.preventDefault();
            }
        }
    );


    /*
     * Clean up requests and place keyboard
     * focus back on the Share button.
     */
    dialog.addEventListener(
        "close",
        () => {

            dialogGeneration += 1;

            cancelOldSearch();


            if (settingsController) {
                settingsController.abort();
            }


            settingsLoaded = false;


            if (buttonThatOpenedDialog) {
                buttonThatOpenedDialog.focus();
            }
        }
    );


    // =============================================
    // DIALOG CONTROL EVENTS
    // =============================================

    sharingMode.addEventListener(
        "change",
        handleSharingModeChange
    );


    searchInput.addEventListener(
        "input",
        scheduleStudentSearch
    );


    /*
     * Prevent Enter in the search box from
     * accidentally submitting the entire form.
     */
    searchInput.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Enter") {
                event.preventDefault();
            }
        }
    );


    // Connect every Share button to its note.

    const shareButtons =
        document.querySelectorAll(
            ".note-share-button"
        );


    for (const button of shareButtons) {

        button.addEventListener(
            "click",
            () => {
                openSharingDialog(button);
            }
        );
    }


    // =============================================
    // SAVE SHARING SETTINGS
    // =============================================

    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            if (
                !settingsLoaded ||
                saving
            ) {
                return;
            }


            if (
                sharingMode.value ===
                    "selected_students" &&
                selectedStudents.size === 0
            ) {
                showDialogMessage(
                    "Select at least one student.",
                    true
                );

                return;
            }


            /*
             * Recipients are sent only for the
             * selected_students mode.
             *
             * Private and all_students must send
             * an empty recipient list.
             */
            const requestBody = {
                sharing_mode:
                    sharingMode.value,

                recipient_user_ids:
                    sharingMode.value ===
                        "selected_students"
                        ? Array.from(
                            selectedStudents.keys()
                        )
                        : [],
            };


            saving = true;

            cancelOldSearch();

            controls.disabled = true;

            closeButton.disabled = true;

            cancelButton.disabled = true;

            updateSaveButton();


            showDialogMessage(
                "Saving sharing settings…"
            );


            try {
                const data =
                    await apiRequest(
                        `/notes/${currentNoteId}/sharing`,
                        {
                            method: "PUT",

                            headers: {
                                "Content-Type":
                                    "application/json",
                            },

                            body:
                                JSON.stringify(
                                    requestBody
                                ),
                        }
                    );


                updateNoteSharingBadge(data);


                dashboardFeedback.textContent =
                    `Sharing settings saved for ` +
                    `“${data.title}”.`;


                saving = false;

                dialog.close();
            }
            catch (error) {

                showDialogMessage(
                    error.message +
                    " You can retry or reopen " +
                    "the dialog to check the " +
                    "saved setting.",
                    true
                );
            }
            finally {

                saving = false;

                controls.disabled =
                    !settingsLoaded;

                closeButton.disabled = false;

                cancelButton.disabled = false;

                updateSaveButton();
            }
        }
    );

})();