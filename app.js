const STORAGE_KEY = "solomons-order-v3";
const LEGACY_STORAGE_KEYS = ["solomons-order-v2", "solomons-order"];
const API_STATE_URL = "/api/state";

const DEFAULT_REALMS = {
    "Great Hall": { color: "yellow", icon: "🏰", hsl: "60" },
    "War Room": { color: "orange", icon: "⚔️", hsl: "30" },
    "Thy Strategy": { color: "pink", icon: "📜", hsl: "330" }
};

// Update Google OAuth client ID
const GOOGLE_CLIENT_ID = "837832619942-huonarvqldpjt1o2ahp0u37295h5bdd7.apps.googleusercontent.com";

let loadedFromKey = STORAGE_KEY;

function normalizeState(saved) {
    const stateObj = saved || {};
    if (!stateObj.tasks) stateObj.tasks = [];
    if (!stateObj.realms) stateObj.realms = {};
    stateObj.realms = { ...DEFAULT_REALMS, ...stateObj.realms };
    stateObj.counter = stateObj.counter || stateObj.tasks.length + 1 || 1;

    // Migrations
    if (stateObj.realms["Archives"]) {
        stateObj.realms["Thy Strategy"] = stateObj.realms["Archives"];
        stateObj.realms["Thy Strategy"].icon = stateObj.realms["Thy Strategy"].icon || "📜";
        delete stateObj.realms["Archives"];
    }

    stateObj.tasks.forEach(task => {
        if (task.addedToBoard === undefined) {
            task.addedToBoard = task.realm !== "War Room";
        }
        if (task.date) {
            task.realm = "Thy Strategy";
            task.column = "archive";
        } else if (task.realm === "Archives") {
            task.realm = "Thy Strategy";
            task.column = "archive";
            task.date = todayISO();
        } else if (task.realm === "Thy Strategy") {
            task.column = "archive";
            if (!task.date) task.date = todayISO();
        }
    });

    return stateObj;
}

function loadState() {
    let raw = localStorage.getItem(STORAGE_KEY);
    let sourceKey = STORAGE_KEY;

    // Try legacy keys if primary is empty
    if (!raw) {
        for (const key of LEGACY_STORAGE_KEYS) {
            const legacyRaw = localStorage.getItem(key);
            if (legacyRaw) {
                raw = legacyRaw;
                sourceKey = key;
                break;
            }
        }
    }

    loadedFromKey = sourceKey;

    try {
        if (!raw) {
            return {
                tasks: [],
                realms: { ...DEFAULT_REALMS },
                counter: 1
            };
        }

        const parsed = JSON.parse(raw);
        return normalizeState(parsed);
    } catch (e) {
        console.error("Failed to load state:", e);
        return {
            tasks: [],
            realms: { ...DEFAULT_REALMS },
            counter: 1
        };
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Also persist to server when available
    saveStateToServer();
}

function exportState() {
    try {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "solomons-order-backup.json";
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export failed", e);
        alert("Export failed. See console for details.");
    }
}

function importStateFromObject(obj) {
    try {
        const normalized = normalizeState(obj);
        state = normalized;
        saveState();
        renderAllViews();
        setActiveView("all");
        alert("Import successful! Your decrees have been restored.");
    } catch (e) {
        console.error("Import failed", e);
        alert("Import failed. Is the JSON from Export?");
    }
}

function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            importStateFromObject(data);
        } catch (e) {
            console.error("Import parse failed", e);
            alert("Could not parse JSON. Make sure it is an Export file.");
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsText(file);
}

async function saveStateToServer() {
    try {
        await fetch(API_STATE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state })
        });
    } catch (e) {
        console.warn("Server save skipped (offline?)", e);
    }
}

async function syncStateFromServer() {
    try {
        const res = await fetch(API_STATE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.tasks) {
            state = normalizeState(data);
            saveState();
            const previousView = activeView;
            renderAllViews();
            setActiveView(previousView || "all");
        }
    } catch (e) {
        console.info("Server sync skipped (no server or offline)", e);
    }
}

let state = loadState();

// If we loaded from a legacy key, persist into the current key
if (loadedFromKey !== STORAGE_KEY) {
    saveState();
}

// Recalculate colors for all tasks to match new priority/column rules
state.tasks.forEach(task => {
    task.color = getTaskColor(task.column, task.realm, task.priority || 'compulsory');
});

let editingId = null;
let activeView = "all";
let currentRealm = null;
let currentCalendarDate = new Date();

// Google Auth state
let userProfile = null;

// DOM references
const boardEl = document.getElementById("board");
const todayChecklistPanel = document.getElementById("today-checklist-panel");
const todayListEl = document.getElementById("today-list");
const todayEmptyEl = document.getElementById("today-empty");
const realmViewEl = document.getElementById("realm-view");
const realmTitleEl = document.getElementById("realm-title");
const realmTitleIconEl = document.getElementById("realm-title-icon");
const realmTaskCountEl = document.getElementById("realm-task-count");
const realmTasksGridEl = document.getElementById("realm-tasks-grid");
const realmEmptyEl = document.getElementById("realm-empty");
const realmListEl = document.getElementById("realm-list");
const mainTitleEl = document.getElementById("main-title");
const mainSubtitleEl = document.getElementById("main-subtitle");
const searchInput = document.getElementById("search-input");
const searchDropdown = document.getElementById("search-dropdown");
const searchContainer = document.getElementById("search-container");
const exportBtn = document.getElementById("export-btn");
const importInput = document.getElementById("import-input");

const modalBackdrop = document.getElementById("modal-backdrop");
const modalTitleEl = document.getElementById("modal-title");
const titleInput = document.getElementById("task-title");
const bodyInput = document.getElementById("task-body");
const tagInput = document.getElementById("task-tag");
const realmSelect = document.getElementById("task-realm");
const columnSelect = document.getElementById("task-column");
const dateRow = document.getElementById("task-date-row");
const dateInput = document.getElementById("task-date");

const newCardBtn = document.getElementById("new-card-btn");
const addTodayInlineBtn = document.getElementById("add-today-inline");
const realmAddBtn = document.getElementById("realm-add-btn");
const modalDeleteBtn = document.getElementById("modal-delete-btn");

const tabAll = document.getElementById("tab-all");
const tabToday = document.getElementById("tab-today");
const tabCalendar = document.getElementById("tab-calendar");
const calendarPanel = document.getElementById("calendar-panel");

// Delete dialog
const dialogBackdrop = document.getElementById("dialog-backdrop");
let dialogResolve = null;

// Google Auth elements
const googleSigninDiv = document.querySelector(".g_id_signin");
const userProfileEl = document.getElementById("user-profile");
const userPhotoEl = document.getElementById("user-photo");
const userNameEl = document.getElementById("user-name");

function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function todayISO() {
    return formatDateLocal(new Date());
}

// Google Auth Handler
window.handleCredentialResponse = function (response) {
    // Decode JWT token
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    userProfile = {
        name: payload.name,
        picture: payload.picture,
        email: payload.email
    };

    // Hide Google button, show profile
    googleSigninDiv.style.display = "none";
    userProfileEl.style.display = "flex";

    // Update profile display
    userPhotoEl.src = userProfile.picture;
    if (userNameEl) userNameEl.textContent = userProfile.name;

    // Save to localStorage
    localStorage.setItem("solomons-user", JSON.stringify(userProfile));

    console.log("Google login successful:", userProfile);
};

// Initialize Google Identity Services (guard against double init)
let __gisInitialized = false;
function initGoogleAuth() {
    if (__gisInitialized) return;
    if (!(window.google && google.accounts && google.accounts.id)) return;
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse
    });

    google.accounts.id.renderButton(
        document.querySelector(".google-login-container"),
        {} // Use default button format
    );

    google.accounts.id.prompt(); // Automatically prompt for login if possible
    __gisInitialized = true;
}

// Check for existing login on page load
const savedUser = localStorage.getItem("solomons-user");
if (savedUser) {
    userProfile = JSON.parse(savedUser);
    googleSigninDiv.style.display = "none";
    userProfileEl.style.display = "flex";
    userPhotoEl.src = userProfile.picture;
    if (userNameEl) userNameEl.textContent = userProfile.name;
} else {
    initGoogleAuth();
}

function updateRealmSelect() {
    realmSelect.innerHTML = '<option value="">No Realm</option>';
    Object.entries(state.realms).forEach(([name]) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        realmSelect.appendChild(option);
    });
}

/* ---------- Search Dropdown ---------- */
function showSearchResults(query) {
    const q = query.toLowerCase();
    const results = state.tasks
        .filter(task =>
            task.title.toLowerCase().includes(q) ||
            (task.body || "").toLowerCase().includes(q) ||
            (task.tag || "").toLowerCase().includes(q) ||
            (task.realm || "").toLowerCase().includes(q)
        )
        .slice(0, 8);

    searchDropdown.innerHTML = "";

    if (query.length < 2) {
        searchDropdown.style.display = "none";
        return;
    }

    if (results.length === 0) {
        const noResults = document.createElement("div");
        noResults.className = "search-result no-results";
        noResults.textContent = "No decrees found";
        searchDropdown.appendChild(noResults);
    } else {
        results.forEach(task => {
            const result = document.createElement("div");
            result.className = "search-result";
            result.dataset.taskId = task.id;
            result.innerHTML = `
                <div class="search-result-title">${task.title}</div>
                <div class="search-result-meta">
                    ${task.realm ? `<span class="search-realm">${state.realms[task.realm]?.icon} ${task.realm}</span>` : ""}
                    <span class="search-column">${getColumnDisplayName(task.column)}</span>
                    ${task.tag ? `<span class="search-tag">${task.tag}</span>` : ""}
                </div>
            `;
            result.addEventListener("click", () => jumpToTask(task));
            searchDropdown.appendChild(result);
        });
    }

    searchDropdown.style.display = "block";
}

function jumpToTask(task) {
    if (task.column !== "archive" && activeView !== "all") {
        setActiveView("all");
    }

    const highlightId = `task-${task.id}`;
    state.tasks.forEach(t => {
        const el = document.querySelector(`[data-task-id="${t.id}"]`);
        if (el) el.classList.remove("task-highlight");
    });

    setTimeout(() => {
        const el = document.querySelector(`[data-task-id="${task.id}"]`) ||
            document.querySelector(`[data-id="${task.id}"]`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("task-highlight");
            setTimeout(() => el.classList.remove("task-highlight"), 2000);
        }
    }, 300);

    searchInput.value = "";
    searchDropdown.style.display = "none";
}

function getColumnDisplayName(column) {
    const names = {
        backlog: "Backlog",
        today: "Today",
        "in-progress": "In Progress",
        done: "Done",
        archive: "Calendar"
    };
    return names[column] || column;
}

/* ---------- Delete Dialog ---------- */
function openDeleteDialog() {
    dialogBackdrop.classList.add("open");
    return new Promise(resolve => { dialogResolve = resolve; });
}

function closeDeleteDialog(confirmed = false) {
    dialogBackdrop.classList.remove("open");
    if (dialogResolve) dialogResolve(confirmed);
    dialogResolve = null;
}

document.getElementById("dialog-cancel").addEventListener("click", () => closeDeleteDialog(false));
document.getElementById("dialog-confirm").addEventListener("click", () => closeDeleteDialog(true));
dialogBackdrop.addEventListener("click", e => {
    if (e.target === dialogBackdrop) closeDeleteDialog(false);
});

/* ---------- Modal Logic ---------- */
function openModal(column = "backlog", task = null, autoRealm = null, prefilledDate = null) {
    modalBackdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    updateRealmSelect();

    if (task) {
        editingId = task.id;
        modalTitleEl.textContent = "Edit Decree";
        titleInput.value = task.title;
        bodyInput.value = task.body || "";
        tagInput.value = task.tag || "";
        columnSelect.value = task.column;
        realmSelect.value = task.realm || "";
        dateInput.value = task.date || "";
        // Set priority
        const priorityRadio = document.querySelector(`input[name="task-priority"][value="${task.priority || 'compulsory'}"]`);
        if (priorityRadio) priorityRadio.checked = true;

        // Show delete button when editing
        modalDeleteBtn.style.display = "block";
    } else {
        editingId = null;
        modalTitleEl.textContent = "New Decree";
        titleInput.value = "";
        bodyInput.value = "";
        tagInput.value = "";
        columnSelect.value = column;

        // SYNC LOGIC: If column is archive, default to Thy Strategy realm. Otherwise Great Hall.
        if (column === "archive") {
            realmSelect.value = "Thy Strategy";
        } else {
            realmSelect.value = autoRealm || "Great Hall";
        }

        dateInput.value = prefilledDate || "";
        // Default priority
        const defaultPriority = document.querySelector('input[name="task-priority"][value="compulsory"]');
        if (defaultPriority) defaultPriority.checked = true;

        // Hide delete button when creating new
        modalDeleteBtn.style.display = "none";
    }

    updateDateRowVisibility();
    titleInput.focus();
}

function closeModal() {
    modalBackdrop.classList.remove("open");
    document.body.style.overflow = "";
}

function updateDateRowVisibility() {
    // SYNC LOGIC: If Thy Strategy realm is selected, show date and treat as calendar task
    if (columnSelect.value === "archive" || realmSelect.value === "Thy Strategy") {
        dateRow.style.display = "block";
        if (!dateInput.value) dateInput.value = todayISO();
        if (realmSelect.value === "Thy Strategy") columnSelect.value = "archive";
        else realmSelect.value = "Thy Strategy";
    } else {
        dateRow.style.display = "none";
    }
}

document.getElementById("modal-close-btn").addEventListener("click", closeModal);
document.getElementById("modal-cancel-btn").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", e => {
    if (e.target === modalBackdrop) closeModal();
});

document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        if (dialogBackdrop.classList.contains("open")) closeDeleteDialog();
        else if (modalBackdrop.classList.contains("open")) closeModal();
    }
});

document.getElementById("modal-save-btn").addEventListener("click", saveTask);
modalDeleteBtn.addEventListener("click", async () => {
    if (editingId) {
        const ok = await openDeleteDialog();
        if (ok) {
            state.tasks = state.tasks.filter(t => t.id !== editingId);
            saveState();
            renderAllViews();
            closeModal();
        }
    }
});

function saveTask() {
    const title = titleInput.value.trim();
    if (!title) {
        titleInput.focus();
        titleInput.style.borderColor = "#f07b7b";
        setTimeout(() => { titleInput.style.borderColor = ""; }, 300);
        return;
    }

    const selectedPriority = document.querySelector('input[name="task-priority"]:checked');
    const priority = selectedPriority ? selectedPriority.value : 'compulsory';

    const existing = editingId ? state.tasks.find(t => t.id === editingId) : null;
    let addedToBoard = existing ? (existing.addedToBoard ?? true) : (realmSelect.value !== "War Room");

    // If realm just changed to War Room, hide it. If changed away, show it.
    if (editingId && existing && existing.realm !== realmSelect.value) {
        if (realmSelect.value === "War Room") addedToBoard = false;
        else addedToBoard = true;
    }

    const taskData = {
        id: editingId || state.counter++,
        title,
        body: bodyInput.value.trim(),
        tag: tagInput.value.trim(),
        column: columnSelect.value,
        realm: realmSelect.value || null,
        createdAt: editingId ? existing?.createdAt || Date.now() : Date.now(),
        color: getTaskColor(columnSelect.value, realmSelect.value, priority),
        date: columnSelect.value === "archive" ? (dateInput.value || todayISO()) : null,
        priority: priority,
        doneInChecklist: false,
        addedToBoard: addedToBoard
    };

    // SYNC LOGIC: Enforce Thy Strategy Realm <-> Calendar Chamber sync
    // Any task with a date MUST go to Thy Strategy and Archive column
    if (taskData.date || taskData.column === "archive" || taskData.realm === "Thy Strategy") {
        taskData.realm = "Thy Strategy";
        taskData.column = "archive";
        taskData.addedToBoard = true;
        if (!taskData.date) taskData.date = dateInput.value || todayISO();
    }

    if (editingId != null) {
        Object.assign(existing, taskData);
    } else {
        state.tasks.push(taskData);
    }

    // Refresh color for all tasks just in case
    taskData.color = getTaskColor(taskData.column, taskData.realm, taskData.priority);

    saveState();
    renderAllViews();
    closeModal();
}

function getTaskColor(column, realm, priority) {
    // Rule: Backlog is always red
    if (column === "backlog") return "red";

    // Rule: Priority colors
    if (priority === "deadline") return "red";
    if (priority === "optional") return "green";
    if (priority === "compulsory") return "yellow";

    // Fallback to realm color
    if (realm && state.realms[realm]) {
        return state.realms[realm].color;
    }

    const columnColors = {
        backlog: "red",
        today: "blue",
        "in-progress": "orange",
        done: "pink",
        archive: "yellow"
    };
    return columnColors[column] || "yellow";
}

/* ---------- Realm Management ---------- */
function renderRealmList() {
    realmListEl.innerHTML = "";

    Object.entries(state.realms).forEach(([name, config]) => {
        // Special logic for Great Hall count (view of all tasks)
        const count = name === "Great Hall"
            ? state.tasks.length
            : state.tasks.filter(t => t.realm === name).length;

        const pill = document.createElement("div");
        pill.className = `realm-pill realm-${config.color}`;
        pill.dataset.realm = name;
        pill.innerHTML = `
            <div class="realm-pill-main">
                <span class="realm-pill-dot realm-${config.color}"></span>
                <span class="realm-pill-title">${config.icon} ${name}</span>
            </div>
            <span class="realm-count">${count}</span>
        `;

        pill.addEventListener("click", () => openRealmView(name));
        pill.addEventListener("contextmenu", e => {
            e.preventDefault();
            const protectedRealms = ["Great Hall", "War Room", "Thy Strategy"];
            if (protectedRealms.includes(name)) {
                alert(`The ${name} is a permanent part of the castle and cannot be demolished.`);
                return;
            }
            if (confirm(`Delete realm "${name}"? (${count} tasks will lose this tag)`)) {
                delete state.realms[name];
                state.tasks.forEach(task => { if (task.realm === name) task.realm = null; });
                state.tasks.forEach(task => task.color = getTaskColor(task.column, task.realm, task.priority));
                saveState();
                renderAllViews();
            }
        });

        realmListEl.appendChild(pill);
    });

    const addRealmBtn = document.createElement("div");
    addRealmBtn.className = "realm-add-btn";
    addRealmBtn.innerHTML = '<span>+</span> Add Realm';
    addRealmBtn.addEventListener("click", addNewRealm);
    realmListEl.appendChild(addRealmBtn);
}

function addNewRealm() {
    const name = prompt("Realm/Tag name:");
    if (name && !state.realms[name]) {
        const colors = ["yellow", "orange", "pink", "blue", "green", "purple"];
        const color = prompt("Color:", colors[Math.floor(Math.random() * colors.length)]) || "yellow";
        const icons = ["🏰", "⚔️", "📜", "🗡️", "🛡️", "👑", "🪙", "📦"];
        const icon = prompt("Icon (or press enter):", icons[Math.floor(Math.random() * icons.length)]) || "🏷️";
        const hslColors = { yellow: "60", orange: "30", pink: "330", blue: "210", green: "140", purple: "270" };
        state.realms[name] = { color, icon, hsl: hslColors[color] };
        saveState();
        renderAllViews();
    }
}

function openRealmView(realmName) {
    activeView = `realm:${realmName}`;
    currentRealm = realmName;

    [tabAll, tabToday, tabCalendar].forEach(el => el.classList.remove("active"));
    boardEl.style.display = "none";
    todayChecklistPanel.style.display = "none";
    calendarPanel.style.display = "none";
    realmViewEl.style.display = "block";

    const config = state.realms[realmName];
    mainTitleEl.textContent = `${config.icon} ${realmName}`;
    mainSubtitleEl.textContent = `Manage tasks tagged with ${realmName}`;
    realmTitleEl.textContent = realmName;
    realmTitleIconEl.textContent = config.icon;
    realmTitleIconEl.style.background = `hsl(${config.hsl}, 50%, 25%)`;

    renderRealmTasks();
}

function renderRealmTasks() {
    // Great Hall shows ALL tasks
    const tasks = currentRealm === "Great Hall"
        ? state.tasks
        : state.tasks.filter(t => t.realm === currentRealm);

    const searchTerm = searchInput.value.trim().toLowerCase();

    const filteredTasks = tasks.filter(t => {
        return !searchTerm ||
            t.title.toLowerCase().includes(searchTerm) ||
            (t.body || "").toLowerCase().includes(searchTerm) ||
            (t.tag || "").toLowerCase().includes(searchTerm);
    });

    realmTaskCountEl.textContent = `${filteredTasks.length} tasks`;

    if (filteredTasks.length === 0) {
        realmTasksGridEl.style.display = "none";
        realmEmptyEl.style.display = "block";
        return;
    }

    realmTasksGridEl.style.display = "grid";
    realmEmptyEl.style.display = "none";
    realmTasksGridEl.innerHTML = "";

    filteredTasks.forEach(task => {
        const config = state.realms[currentRealm];
        const card = document.createElement("div");
        card.className = `realm-card realm-${config.color}`;
        card.dataset.taskId = task.id;
        const isAdded = task.realm === "War Room" ? task.addedToBoard : true;
        card.innerHTML = `
            <div class="realm-card-title">${task.title}</div>
            ${task.body ? `<div class="realm-card-body">${task.body}</div>` : ""}
            <div class="realm-card-footer">
                <span class="realm-card-tag" style="background: hsl(${config.hsl}, 20%, 20%); color: hsl(${config.hsl}, 70%, 70%);">
                    ${config.icon} ${task.tag || "No tag"}
                </span>
                <div class="realm-card-actions">
                    <button class="icon-btn realm-add-to-board ${isAdded ? 'added' : ''}" 
                            title="${isAdded ? 'Already in Chambers' : '➤ Add to All Chambers'}"
                            ${isAdded ? 'disabled style="opacity: 0.5; cursor: default;"' : ''}>
                        ${isAdded ? '✓' : '➤'}
                    </button>
                    <button class="icon-btn" title="Edit">✎</button>
                    <button class="icon-btn delete" title="Delete">🗑</button>
                </div>
            </div>
        `;

        card.querySelector(".realm-add-to-board").addEventListener("click", e => {
            e.stopPropagation();
            task.addedToBoard = true;
            task.column = "backlog";
            task.color = getTaskColor("backlog", currentRealm, task.priority);
            saveState();
            renderAllViews();
        });

        card.querySelector(".icon-btn[title='Edit']").addEventListener("click", e => {
            e.stopPropagation();
            openModal(task.column, task, currentRealm);
        });

        card.querySelector(".delete").addEventListener("click", async e => {
            e.stopPropagation();
            const ok = await openDeleteDialog();
            if (ok) {
                state.tasks = state.tasks.filter(t => t.id !== task.id);
                saveState();
                renderAllViews();
            }
        });

        card.addEventListener("click", e => {
            if (!e.target.closest(".icon-btn")) openModal(task.column, task, currentRealm);
        });

        realmTasksGridEl.appendChild(card);
    });
}

realmAddBtn.addEventListener("click", () => openModal("backlog", null, currentRealm));

/* ---------- Calendar Rendering ---------- */
function renderCalendar() {
    const grid = document.getElementById("calendar-grid");
    const monthSpan = document.getElementById("calendar-month");
    const yearSpan = document.getElementById("calendar-year");

    monthSpan.textContent = currentCalendarDate.toLocaleDateString('en-US', { month: 'long' });
    yearSpan.textContent = currentCalendarDate.getFullYear();

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();

    const monthTasks = state.tasks.filter(task =>
        (task.column === "archive" || task.realm === "Thy Strategy") && task.date &&
        task.date >= formatDateLocal(firstDay) &&
        task.date <= formatDateLocal(lastDay)
    );

    const dayCells = grid.querySelectorAll(".calendar-day");
    dayCells.forEach(cell => cell.remove());

    for (let i = 0; i < startingDayOfWeek; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "calendar-day calendar-empty";
        grid.appendChild(emptyCell);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = document.createElement("div");
        cell.className = "calendar-day";
        cell.dataset.date = dateStr;

        const dayTasks = monthTasks.filter(task => task.date === dateStr);
        if (dayTasks.length > 0) {
            cell.classList.add("calendar-has-tasks");
            cell.dataset.tasks = dayTasks.length;
        }

        // Build task pills HTML (max 3 shown)
        const maxShown = 3;
        const tasksToShow = dayTasks.slice(0, maxShown);
        const remainingCount = dayTasks.length - maxShown;

        const taskPillsHTML = tasksToShow.map(task => {
            const priorityClass = `priority-${task.priority || 'compulsory'}`;
            return `<div class="calendar-task-pill ${priorityClass}" data-task-id="${task.id}" title="${task.title}">${task.title}</div>`;
        }).join('');

        const moreIndicator = remainingCount > 0 ? `<div class="calendar-more-tasks">+${remainingCount} more</div>` : '';

        cell.innerHTML = `
            <div class="calendar-day-header">
                <span class="calendar-day-number">${day}</span>
                <button class="calendar-add-btn" title="Add task">+</button>
            </div>
            <div class="calendar-day-tasks">
                ${taskPillsHTML}
                ${moreIndicator}
            </div>
        `;

        // Add button click handler
        cell.querySelector('.calendar-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openModal("archive", null, null, dateStr);
        });

        // Task pill click handlers for editing
        cell.querySelectorAll('.calendar-task-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = parseInt(pill.dataset.taskId);
                const task = state.tasks.find(t => t.id === taskId);
                if (task) {
                    openModal(task.column, task, task.realm);
                }
            });
        });

        // Click on empty area to add task
        cell.addEventListener('click', (e) => {
            if (!e.target.closest('.calendar-task-pill') && !e.target.closest('.calendar-add-btn') && !e.target.closest('.calendar-more-tasks')) {
                openModal("archive", null, null, dateStr);
            }
        });

        // More indicator click - show all as a list at bottom
        const moreEl = cell.querySelector('.calendar-more-tasks');
        if (moreEl) {
            moreEl.addEventListener('click', (e) => {
                e.stopPropagation();
                showAllDayTasks(dateStr, dayTasks);
            });
        }

        grid.appendChild(cell);
    }
}

// Show all tasks for a day when there are more than 3
function showAllDayTasks(dateStr, tasks) {
    showDayTasksPopup(dateStr, tasks);
}

function getTaskColorForDot(task) {
    const priorityColors = {
        deadline: 'var(--priority-deadline)',
        compulsory: 'var(--priority-compulsory)',
        optional: 'var(--priority-optional)'
    };
    return priorityColors[task.priority] || priorityColors.compulsory;
}

function showDayTasks(dateStr, tasks) {
    if (tasks.length === 0) {
        // No tasks - open modal to add new task for this date
        openModal("archive", null, null, dateStr);
        return;
    }

    // Show popup with tasks for this day, allowing click to edit
    showDayTasksPopup(dateStr, tasks);
}

function showDayTasksPopup(dateStr, tasks) {
    // Remove any existing popup
    const existingPopup = document.querySelector('.day-tasks-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.className = 'day-tasks-popup';

    const priorityColors = {
        deadline: 'var(--priority-deadline)',
        compulsory: 'var(--priority-compulsory)',
        optional: 'var(--priority-optional)'
    };

    popup.innerHTML = `
        <div class="day-popup-header">
            <h4>📅 ${dateStr}</h4>
            <button class="popup-close-btn">&times;</button>
        </div>
        <div class="day-popup-tasks">
            ${tasks.map(task => `
                <div class="day-popup-task" data-task-id="${task.id}">
                    <span class="priority-indicator" style="background: ${priorityColors[task.priority || 'compulsory']}"></span>
                    <div class="task-info">
                        <span class="task-title">${task.title}</span>
                        <span class="task-priority-label">${(task.priority || 'compulsory').charAt(0).toUpperCase() + (task.priority || 'compulsory').slice(1)}</span>
                    </div>
                    <button class="edit-task-btn" title="Edit">✎</button>
                </div>
            `).join('')}
        </div>
        <button class="add-task-to-day-btn">+ Add New Decree</button>
    `;

    document.body.appendChild(popup);

    // Close button
    popup.querySelector('.popup-close-btn').addEventListener('click', () => popup.remove());

    // Edit buttons
    popup.querySelectorAll('.edit-task-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const taskId = parseInt(e.target.closest('.day-popup-task').dataset.taskId);
            const task = state.tasks.find(t => t.id === taskId);
            if (task) {
                popup.remove();
                openModal(task.column, task, task.realm);
            }
        });
    });

    // Click on task row to edit
    popup.querySelectorAll('.day-popup-task').forEach(row => {
        row.addEventListener('click', (e) => {
            if (!e.target.closest('.edit-task-btn')) {
                const taskId = parseInt(row.dataset.taskId);
                const task = state.tasks.find(t => t.id === taskId);
                if (task) {
                    popup.remove();
                    openModal(task.column, task, task.realm);
                }
            }
        });
    });

    // Add new task button
    popup.querySelector('.add-task-to-day-btn').addEventListener('click', () => {
        popup.remove();
        openModal("archive", null, null, dateStr);
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closePopup(e) {
            if (!popup.contains(e.target) && !e.target.closest('.calendar-day')) {
                popup.remove();
                document.removeEventListener('click', closePopup);
            }
        });
    }, 100);
}

document.getElementById("prev-month").addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
});

/* ---------- Tab Navigation ---------- */
function setActiveView(view) {
    activeView = view;
    currentRealm = null;

    [tabAll, tabToday, tabCalendar].forEach(el => el.classList.remove("active"));

    switch (view) {
        case "all":
            tabAll.classList.add("active");
            boardEl.style.display = "grid";
            todayChecklistPanel.style.display = "none";
            calendarPanel.style.display = "none";
            realmViewEl.style.display = "none";
            mainTitleEl.textContent = "Sticky Wall of Decrees";
            mainSubtitleEl.textContent = "Drag between chambers";
            break;
        case "today":
            tabToday.classList.add("active");
            boardEl.style.display = "none";
            todayChecklistPanel.style.display = "block";
            calendarPanel.style.display = "none";
            realmViewEl.style.display = "none";
            mainTitleEl.textContent = "Today's Scroll";
            mainSubtitleEl.textContent = "Check off completed tasks";
            break;
        case "calendar":
            tabCalendar.classList.add("active");
            boardEl.style.display = "none";
            todayChecklistPanel.style.display = "none";
            calendarPanel.style.display = "block";
            realmViewEl.style.display = "none";
            mainTitleEl.textContent = "Royal Calendar";
            mainSubtitleEl.textContent = "Archive decrees by date";
            currentCalendarDate = new Date();
            renderCalendar();
            break;
    }

    renderAllViews();
}

tabAll.addEventListener("click", () => setActiveView("all"));
tabToday.addEventListener("click", () => setActiveView("today"));
tabCalendar.addEventListener("click", () => setActiveView("calendar"));

newCardBtn.addEventListener("click", () => openModal("backlog"));
addTodayInlineBtn.addEventListener("click", () => openModal("today"));
if (exportBtn) exportBtn.addEventListener("click", exportState);
if (importInput) importInput.addEventListener("change", handleImportFile);

/* ---------- Board Rendering ---------- */
function createCardElement(task) {
    const card = document.createElement("article");
    card.className = `card card-${task.color}`;
    card.draggable = true;
    card.dataset.id = task.id;
    card.dataset.taskId = task.id;

    const realmInfo = task.realm && state.realms[task.realm] ?
        `${state.realms[task.realm].icon} ${task.realm}` : task.tag || "No tag";

    card.innerHTML = `
        <div class="card-title">${task.title}</div>
        <div class="card-body">${task.body || "No details"}</div>
        <footer class="card-footer">
            <span class="tag" title="${realmInfo}">${realmInfo}</span>
            <div class="card-actions">
                <button class="icon-btn" title="Edit">✎</button>
                <button class="icon-btn delete" title="Delete">🗑</button>
            </div>
        </footer>
    `;

    card.querySelector(".icon-btn[title='Edit']").onclick = e => {
        e.stopPropagation();
        openModal(task.column, task, task.realm);
    };

    card.querySelector(".delete").onclick = async e => {
        e.stopPropagation();
        const ok = await openDeleteDialog();
        if (ok) {
            state.tasks = state.tasks.filter(t => t.id !== task.id);
            saveState();
            renderAllViews();
        }
    };

    card.addEventListener("dragstart", handleDragStart);
    card.addEventListener("dragend", handleDragEnd);
    return card;
}

function renderBoard() {
    const columns = ["backlog", "today", "in-progress", "done"];
    columns.forEach(column => {
        const body = document.querySelector(`[data-column-body="${column}"]`);
        if (body) {
            body.innerHTML = "";
            state.tasks
                .filter(t => t.column === column)
                .filter(t => t.realm !== "War Room" || t.addedToBoard)
                .forEach(task => {
                    body.appendChild(createCardElement(task));
                });
        }
    });
}

/* ---------- Drag & Drop ---------- */
let draggedCard = null;
function handleDragStart(e) {
    draggedCard = e.target;
    e.dataTransfer.effectAllowed = "move";
}

function handleDragEnd() {
    draggedCard = null;
    document.querySelectorAll(".column").forEach(col => col.classList.remove("drag-over"));
}

document.querySelectorAll(".column").forEach(col => {
    col.addEventListener("dragover", e => {
        e.preventDefault();
        col.classList.add("drag-over");
    });
    col.addEventListener("drop", e => {
        e.preventDefault();
        col.classList.remove("drag-over");
        if (draggedCard) {
            const taskId = parseInt(draggedCard.dataset.id);
            const task = state.tasks.find(t => t.id === taskId);
            if (task) {
                task.column = col.dataset.column;
                task.color = getTaskColor(task.column, task.realm, task.priority);
                saveState();
                renderAllViews();
            }
        }
    });
    col.addEventListener("dragenter", () => col.classList.add("drag-over"));
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
});

document.querySelectorAll(".add-card-slot").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.addTo));
});

/* ---------- Other Views ---------- */
function renderTodayChecklist() {
    const today = todayISO();
    const searchTerm = searchInput.value.trim().toLowerCase();
    const todayTasks = state.tasks.filter(t =>
        (t.column === "today" || (t.column === "archive" && t.date === today)) &&
        !t.doneInChecklist &&
        (t.realm !== "War Room" || t.addedToBoard)
    ).filter(t => !searchTerm || t.title.toLowerCase().includes(searchTerm));

    todayListEl.innerHTML = "";
    if (todayTasks.length === 0) {
        todayEmptyEl.style.display = "block";
        return;
    }
    todayEmptyEl.style.display = "none";

    todayTasks.forEach(task => {
        const li = document.createElement("li");
        li.className = `today-item priority-${task.priority || 'compulsory'}`;
        li.dataset.taskId = task.id;
        const realmInfo = task.realm && state.realms[task.realm] ?
            `${state.realms[task.realm].icon} ${task.realm}` : task.tag || "";
        li.innerHTML = `
            <input type="checkbox">
            <div class="today-item-main">
                <div class="today-item-title">${task.title}</div>
                <div class="today-item-meta">${realmInfo}</div>
            </div>
        `;
        li.querySelector("input").addEventListener("change", () => {
            task.doneInChecklist = li.querySelector("input").checked;
            saveState();
            renderTodayChecklist();
        });
        todayListEl.appendChild(li);
    });
}

/* ---------- Counts & Search ---------- */
function updateCounts() {
    document.getElementById("total-count").textContent = state.tasks.filter(t => t.realm !== "War Room" || t.addedToBoard).length;
    document.getElementById("today-count").textContent = state.tasks.filter(t => t.column === "today" && (t.realm !== "War Room" || t.addedToBoard)).length;
    document.getElementById("calendar-count").textContent = state.tasks.filter(t => t.column === "archive").length;

    ["backlog", "today", "in-progress", "done"].forEach(col => {
        const el = document.querySelector(`[data-column-count="${col}"]`);
        if (el) el.textContent = state.tasks.filter(t => t.column === col && (t.realm !== "War Room" || t.addedToBoard)).length;
    });
}

columnSelect.addEventListener("change", updateDateRowVisibility);

let searchTimeout;
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        showSearchResults(searchInput.value);
        renderAllViews();
    }, 150);
});

searchInput.addEventListener("focus", () => {
    if (searchInput.value.length >= 2) {
        showSearchResults(searchInput.value);
    }
});

document.addEventListener("click", e => {
    if (!searchContainer.contains(e.target)) {
        searchDropdown.style.display = "none";
    }
});

/* ---------- Main Render ---------- */
function renderAllViews() {
    renderBoard();
    renderTodayChecklist();
    renderRealmList();
    if (activeView === "calendar") {
        renderCalendar();
    }
    updateCounts();
    if (activeView.startsWith("realm:")) renderRealmTasks();
}

// Initialize
updateRealmSelect();
initGoogleAuth(); // Initialize Google Auth
renderAllViews();
setActiveView("all");
syncStateFromServer();
// ========== GOOGLE PROFILE POPUP ==========
let profilePopup = document.getElementById('profile-popup');
let popupNameEl = document.getElementById('popup-name');
let popupEmailEl = document.getElementById('popup-email');
const userProfileBtn = document.getElementById('user-profile');
const logoutBtn = document.getElementById('logout-btn');

// Profile popup click handler (guarded in case DOM is missing during early load)
if (userProfileBtn && profilePopup) {
    userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profilePopup.classList.add('show');
    });
} else {
    console.warn('User profile elements missing; skipping popup binding');
}

// Close popup on outside click
document.addEventListener('click', () => {
    if (profilePopup) profilePopup.classList.remove('show');
    searchDropdown.style.display = 'none'; // Also close search
});

// Logout handler
if (logoutBtn && profilePopup) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('solomons-user');
        userProfile = null;
        googleSigninDiv.style.display = 'block';
        userProfileEl.style.display = 'none';
        profilePopup.classList.remove('show');
    });
}
