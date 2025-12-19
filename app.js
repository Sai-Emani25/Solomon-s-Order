const STORAGE_KEY = "solomons-order-v3";

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {
                tasks: [],
                realms: {
                    "Great Hall": { color: "yellow", icon: "🏰", hsl: "60" },
                    "War Room": { color: "orange", icon: "⚔️", hsl: "30" },
                    "Archives": { color: "pink", icon: "📜", hsl: "330" }
                },
                counter: 1
            };
        }
        const state = JSON.parse(raw);
        if (!state.realms) {
            state.realms = {
                "Great Hall": { color: "yellow", icon: "🏰", hsl: "60" },
                "War Room": { color: "orange", icon: "⚔️", hsl: "30" },
                "Archives": { color: "pink", icon: "📜", hsl: "330" }
            };
        }
        return state;
    } catch (e) {
        return {
            tasks: [],
            realms: {
                "Great Hall": { color: "yellow", icon: "🏰", hsl: "60" },
                "War Room": { color: "orange", icon: "⚔️", hsl: "30" },
                "Archives": { color: "pink", icon: "📜", hsl: "330" }
            },
            counter: 1
        };
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let editingId = null;
let activeView = "all";
let currentRealm = null;
let currentCalendarDate = new Date(); // Calendar state

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

const tabAll = document.getElementById("tab-all");
const tabToday = document.getElementById("tab-today");
const tabCalendar = document.getElementById("tab-calendar");
const calendarPanel = document.getElementById("calendar-panel");

// Delete dialog
const dialogBackdrop = document.getElementById("dialog-backdrop");
let dialogResolve = null;

function todayISO() {
    return new Date().toISOString().slice(0, 10);
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
    const results = state.tasks
        .filter(task => 
            task.title.toLowerCase().includes(query.toLowerCase()) ||
            (task.body || "").toLowerCase().includes(query.toLowerCase()) ||
            (task.tag || "").toLowerCase().includes(query.toLowerCase()) ||
            (task.realm || "").toLowerCase().includes(query.toLowerCase())
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
    // Jump to task location
    if (task.column !== "archive" && activeView !== "all") {
        setActiveView("all");
    }
    
    // Highlight the task
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
function openModal(column = "backlog", task = null, autoRealm = null) {
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
    } else {
        editingId = null;
        modalTitleEl.textContent = "New Decree";
        titleInput.value = "";
        bodyInput.value = "";
        tagInput.value = "";
        columnSelect.value = column;
        realmSelect.value = autoRealm || "";
        dateInput.value = "";
    }

    updateDateRowVisibility();
    titleInput.focus();
}

function closeModal() {
    modalBackdrop.classList.remove("open");
    document.body.style.overflow = "";
}

function updateDateRowVisibility() {
    if (columnSelect.value === "archive") {
        dateRow.style.display = "block";
        if (!dateInput.value) dateInput.value = todayISO();
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

function saveTask() {
    const title = titleInput.value.trim();
    if (!title) {
        titleInput.focus();
        titleInput.style.borderColor = "#f07b7b";
        setTimeout(() => { titleInput.style.borderColor = ""; }, 300);
        return;
    }

    const taskData = {
        id: editingId || state.counter++,
        title,
        body: bodyInput.value.trim(),
        tag: tagInput.value.trim(),
        column: columnSelect.value,
        realm: realmSelect.value || null,
        createdAt: editingId ? state.tasks.find(t => t.id === editingId)?.createdAt || Date.now() : Date.now(),
        color: getTaskColor(columnSelect.value, realmSelect.value),
        date: columnSelect.value === "archive" ? (dateInput.value || todayISO()) : null,
        doneInChecklist: false
    };

    if (editingId != null) {
        const existing = state.tasks.find(t => t.id === editingId);
        Object.assign(existing, taskData);
    } else {
        state.tasks.push(taskData);
    }

    saveState();
    renderAllViews();
    closeModal();
}

function getTaskColor(column, realm) {
    // Realm color takes priority over column color
    if (realm && state.realms[realm]) {
        return state.realms[realm].color;
    }
    const columnColors = { backlog: "yellow", today: "blue", "in-progress": "orange", done: "pink", archive: "yellow" };
    return columnColors[column] || "yellow";
}

/* ---------- Realm Management ---------- */
function renderRealmList() {
    realmListEl.innerHTML = "";
    
    Object.entries(state.realms).forEach(([name, config]) => {
        const count = state.tasks.filter(t => t.realm === name).length;
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
            if (confirm(`Delete realm "${name}"? (${count} tasks will lose this tag)`)) {
                delete state.realms[name];
                state.tasks.forEach(task => { if (task.realm === name) task.realm = null; });
                state.tasks.forEach(task => task.color = getTaskColor(task.column, task.realm));
                saveState();
                renderAllViews();
            }
        });
        
        realmListEl.appendChild(pill);
    });
    
    // Add Realm button
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
    const tasks = state.tasks.filter(t => t.realm === currentRealm);
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
        card.innerHTML = `
            <div class="realm-card-title">${task.title}</div>
            ${task.body ? `<div class="realm-card-body">${task.body}</div>` : ""}
            <div class="realm-card-footer">
                <span class="realm-card-tag" style="background: hsl(${config.hsl}, 20%, 20%); color: hsl(${config.hsl}, 70%, 70%);">
                    ${config.icon} ${task.tag || "No tag"}
                </span>
                <div class="realm-card-actions">
                    <button class="icon-btn realm-add-to-board" title="➤ Add to All Chambers">➤</button>
                    <button class="icon-btn" title="Edit">✎</button>
                    <button class="icon-btn delete" title="Delete">🗑</button>
                </div>
            </div>
        `;
        
        // ➤ Add to Chambers
        card.querySelector(".realm-add-to-board").addEventListener("click", e => {
            e.stopPropagation();
            task.column = "backlog";
            task.color = getTaskColor("backlog", currentRealm);
            saveState();
            renderAllViews();
        });
        
        // Edit
        card.querySelector(".icon-btn[title='Edit']").addEventListener("click", e => {
            e.stopPropagation();
            openModal(task.column, task, currentRealm);
        });
        
        // Delete
        card.querySelector(".delete").addEventListener("click", async e => {
            e.stopPropagation();
            const ok = await openDeleteDialog();
            if (ok) {
                state.tasks = state.tasks.filter(t => t.id !== task.id);
                saveState();
                renderAllViews();
            }
        });
        
        // Card click = edit
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
    
    // Set month/year display
    monthSpan.textContent = currentCalendarDate.toLocaleDateString('en-US', { month: 'long' });
    yearSpan.textContent = currentCalendarDate.getFullYear();
    
    // Get first day of month and tasks for this month
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday
    
    // Filter archive tasks for this month
    const monthTasks = state.tasks.filter(task => 
        task.column === "archive" && 
        task.date >= firstDay.toISOString().slice(0, 10) && 
        task.date <= lastDay.toISOString().slice(0, 10)
    );
    
    // Clear grid (keep weekdays)
    const dayCells = grid.querySelectorAll(".calendar-day");
    dayCells.forEach(cell => cell.remove());
    
    // Add empty cells for days before month start
    for (let i = 0; i < startingDayOfWeek; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "calendar-day calendar-empty";
        grid.appendChild(emptyCell);
    }
    
    // Add days of month
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = document.createElement("div");
        cell.className = "calendar-day";
        
        // Check if this day has tasks
        const dayTasks = monthTasks.filter(task => task.date === dateStr);
        if (dayTasks.length > 0) {
            cell.classList.add("calendar-has-tasks");
            cell.dataset.tasks = dayTasks.length;
            cell.title = `${dayTasks.length} decree(s): ${dayTasks.map(t => t.title).join(', ')}`;
        }
        
        cell.innerHTML = `
            <div class="calendar-day-number">${day}</div>
            ${dayTasks.length > 0 ? `<div class="calendar-task-dot" style="background: ${getTaskColorForDot(dayTasks[0])}"></div>` : ''}
        `;
        
        // Click to view/edit tasks for this day
        cell.addEventListener("click", () => showDayTasks(dateStr, dayTasks));
        
        grid.appendChild(cell);
    }
}

function getTaskColorForDot(task) {
    return task.realm && state.realms[task.realm] ? 
        `hsl(${state.realms[task.realm].hsl}, 60%, 50%)` : 
        getTaskColor(task.column, task.realm);
}

function showDayTasks(dateStr, tasks) {
    if (tasks.length === 0) {
        alert(`No decrees scheduled for ${dateStr}`);
        return;
    }
    
    const taskList = tasks.map(task => 
        `${state.realms[task.realm]?.icon || ''} ${task.title}`
    ).join('\n');
    
    alert(`Decrees for ${dateStr}:\n\n${taskList}\n\nClick Edit on any task in "All Chambers" to modify.`);
}

// Calendar navigation
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
            currentCalendarDate = new Date(); // Reset to current month
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
            state.tasks.filter(t => t.column === column).forEach(task => {
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
                task.color = getTaskColor(task.column, task.realm);
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
        (t.column === "today" || (t.column === "archive" && t.date === today)) && !t.doneInChecklist
    ).filter(t => !searchTerm || t.title.toLowerCase().includes(searchTerm));

    todayListEl.innerHTML = "";
    if (todayTasks.length === 0) {
        todayEmptyEl.style.display = "block";
        return;
    }
    todayEmptyEl.style.display = "none";

    todayTasks.forEach(task => {
        const li = document.createElement("li");
        li.className = "today-item";
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
    document.getElementById("total-count").textContent = state.tasks.length;
    document.getElementById("today-count").textContent = state.tasks.filter(t => t.column === "today").length;
    document.getElementById("calendar-count").textContent = state.tasks.filter(t => t.column === "archive").length;
    
    ["backlog", "today", "in-progress", "done"].forEach(col => {
        const el = document.querySelector(`[data-column-count="${col}"]`);
        if (el) el.textContent = state.tasks.filter(t => t.column === col).length;
    });
}

columnSelect.addEventListener("change", updateDateRowVisibility);

// Search functionality
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
    renderCalendar();
    updateCounts();
    if (activeView.startsWith("realm:")) renderRealmTasks();
}

// Initialize
updateRealmSelect();
renderAllViews();
setActiveView("all");
