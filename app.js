(function () {
  "use strict";

  var STORAGE_KEY = "ritmo-task-focus-local-v1";
  var MODE_SECONDS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  var MODE_NAMES = { focus: "Foco", short: "Pausa curta", long: "Pausa longa" };
  var STATUS = [
    { key: "todo", label: "A fazer", dot: "" },
    { key: "doing", label: "Em andamento", dot: "doing" },
    { key: "done", label: "Concluída", dot: "done", done: true }
  ];
  var DEFAULT_LABELS = [
    { id: "label-complete", name: "Completo", color: "#61bd4f" },
    { id: "label-working", name: "Trabalhando", color: "#f2d600" },
    { id: "label-approval", name: "Aprovação", color: "#ff9f1a" },
    { id: "label-change", name: "Alteração", color: "#eb5a46" },
    { id: "label-waiting", name: "Em espera", color: "#c377e0" },
    { id: "label-cancelled", name: "Cancelado", color: "#0079bf" }
  ];
  var LABEL_COLORS = ["#61bd4f", "#f2d600", "#ff9f1a", "#eb5a46", "#c377e0", "#0079bf", "#00c2e0", "#838c91"];
  var state;
  var activeDate = dateKey(new Date());
  var currentFilter = "today";
  var editingId = null;
  var draftTask = null;
  var toastTimeout = null;
  var nativeDragTaskId = null;
  var touchDragState = null;
  var touchHoldTimeout = null;
  var suppressCardClickUntil = 0;
  var expandedChecklistCards = new Set();
  var taskCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  var progressPeriod = "weekly";
  var appCalendarView = "month";
  var appCalendarDate = dateFromKey(activeDate);
  var appCalendarMonth = new Date(appCalendarDate.getFullYear(), appCalendarDate.getMonth(), 1);
  var daySwipeStart = null;
  var suppressCalendarCardClickUntil = 0;
  var focusPanelReturnAnchor = null;
  var pendingDeletion = null;
  var undoStack = [];
  var undoRemaining = 0;
  var undoInterval = null;
  var undoTouchStartY = null;
  var pendingImageLoads = 0;

  function pad(value) { return String(value).padStart(2, "0"); }
  function dateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }
  function dateFromKey(key) {
    if (!key) return null;
    var parts = key.split("-").map(Number);
    if (parts.length !== 3 || !parts[0]) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function addDays(date, count) {
    var result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() + count);
    return result;
  }
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "item-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function defaultLists() {
    return STATUS.map(function (list) { return { id: list.key, name: list.label, done: Boolean(list.done) }; });
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
    });
  }
  function getTodayKey() { return dateKey(new Date()); }
  function formatFullDate(date) {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(date);
  }
  function formatShortDate(key) {
    var date = dateFromKey(key);
    if (!date) return "Sem prazo";
    var today = getTodayKey();
    var tomorrow = dateKey(addDays(new Date(), 1));
    if (key === today) return "Hoje";
    if (key === tomorrow) return "Amanhã";
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(date).replace(".", "");
  }
  function createDemoState() {
    var today = getTodayKey();
    var tomorrow = dateKey(addDays(new Date(), 1));
    var later = dateKey(addDays(new Date(), 3));
    return {
      lists: defaultLists(),
      tasks: [
        {
          id: "demo-plan-week", title: "Planejar a semana", description: "Definir as três prioridades e separar os blocos de foco para os próximos dias.",
          status: "todo", priority: "high", dueDate: today, labels: ["label-working", "label-waiting"], pomodoros: 0,
          checklists: [{ id: "demo-plan-checklist", title: "Preparação", items: [{ text: "Revisar compromissos", done: true }, { text: "Escolher prioridades", done: false }, { text: "Reservar tempo de foco", done: false }] }], attachments: [], comments: []
        },
        {
          id: "demo-review", title: "Revisar a proposta do projeto", description: "Conferir o escopo, ajustar o texto e preparar a versão para compartilhar.",
          status: "doing", priority: "medium", dueDate: today, labels: ["label-approval"], pomodoros: 1,
          checklists: [{ id: "demo-review-checklist", title: "Próximos passos", items: [{ text: "Revisar o escopo", done: true }, { text: "Ajustar a apresentação", done: false }] }], attachments: [], comments: []
        },
        {
          id: "demo-inbox", title: "Organizar referências visuais", description: "Juntar os exemplos em um só lugar para facilitar a próxima etapa.",
          status: "todo", priority: "low", dueDate: tomorrow, labels: ["label-waiting"], pomodoros: 0,
          checklists: [{ id: "demo-inbox-checklist", title: "Organizar referências", items: [{ text: "Selecionar referências", done: false }, { text: "Separar por tema", done: false }] }], attachments: [], comments: []
        },
        {
          id: "demo-email", title: "Responder mensagens importantes", description: "Resolver as respostas rápidas antes de começar o próximo bloco de trabalho.",
          status: "done", priority: "low", dueDate: today, labels: ["label-complete"], pomodoros: 0,
          checklists: [{ id: "demo-email-checklist", title: "Mensagens", items: [{ text: "Responder mensagens", done: true }] }], attachments: [], comments: []
        },
        {
          id: "demo-reading", title: "Ler o capítulo marcado", description: "Vinte minutos de leitura sem notificações.", status: "todo",
          priority: "medium", dueDate: later, labels: ["label-working"], pomodoros: 0,
          checklists: [{ id: "demo-reading-checklist", title: "Leitura", items: [{ text: "Separar o livro", done: false }] }], attachments: [], comments: []
        }
      ],
      labels: clone(DEFAULT_LABELS),
      sessions: [],
      timer: { mode: "focus", totalSeconds: MODE_SECONDS.focus, secondsLeft: MODE_SECONDS.focus, isRunning: false, endsAt: null, taskId: null }
    };
  }
  function normalizeLabelCatalog(input) {
    var catalog = clone(DEFAULT_LABELS);
    (Array.isArray(input) ? input : []).forEach(function (label) {
      if (!label || typeof label !== "object") return;
      var id = String(label.id || makeId());
      if (catalog.some(function (item) { return item.id === id; })) return;
      var name = String(label.name || "Etiqueta personalizada").trim().slice(0, 24);
      if (!name) return;
      catalog.push({ id: id, name: name, color: /^#[0-9a-f]{6}$/i.test(label.color || "") ? label.color : LABEL_COLORS[catalog.length % LABEL_COLORS.length] });
    });
    return catalog;
  }
  function normalizeLists(input) {
    var lists = [];
    (Array.isArray(input) ? input : []).forEach(function (list) {
      if (!list || typeof list !== "object") return;
      var id = String(list.id || makeId());
      var name = String(list.name || "").trim().slice(0, 42);
      if (!name || lists.some(function (item) { return item.id === id; })) return;
      lists.push({ id: id, name: name, done: list.done === undefined ? id === "done" : Boolean(list.done) });
    });
    return lists.length ? lists : defaultLists();
  }
  function normalizeTask(task, labelCatalog, listCatalog) {
    labelCatalog = labelCatalog || normalizeLabelCatalog([]);
    listCatalog = listCatalog || defaultLists();
    var labelIds = [];
    (Array.isArray(task.labels) ? task.labels : []).forEach(function (rawLabel) {
      var name = typeof rawLabel === "object" && rawLabel ? String(rawLabel.name || "").trim() : String(rawLabel || "").trim();
      var rawId = typeof rawLabel === "object" && rawLabel ? String(rawLabel.id || "") : String(rawLabel || "");
      var label = labelCatalog.find(function (entry) { return entry.id === rawId; }) || labelCatalog.find(function (entry) { return entry.name.toLowerCase() === name.toLowerCase(); });
      if (!label && name) {
        label = { id: "label-" + makeId(), name: name.slice(0, 24), color: typeof rawLabel === "object" && rawLabel && /^#[0-9a-f]{6}$/i.test(rawLabel.color || "") ? rawLabel.color : LABEL_COLORS[labelCatalog.length % LABEL_COLORS.length] };
        labelCatalog.push(label);
      }
      if (label && !labelIds.includes(label.id)) labelIds.push(label.id);
    });
    var sourceChecklists = Array.isArray(task.checklists) ? task.checklists : (Array.isArray(task.checklist) && task.checklist.length ? [{ title: "Checklist", items: task.checklist }] : []);
    var checklists = sourceChecklists.map(function (checklist) {
      return {
        id: String(checklist.id || makeId()),
        title: String(checklist.title || "Checklist").trim().slice(0, 50) || "Checklist",
        items: (Array.isArray(checklist.items) ? checklist.items : []).map(function (item) {
          return { text: String(item.text || ""), done: Boolean(item.done) };
        }).filter(function (item) { return item.text; })
      };
    });
    return {
      id: String(task.id || makeId()),
      title: String(task.title || "Nova tarefa"),
      description: String(task.description || ""),
      status: listCatalog.some(function (list) { return list.id === String(task.status || ""); }) ? String(task.status) : (listCatalog[0] || { id: "todo" }).id,
      priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
      startDate: String(task.startDate || ""),
      dueDate: String(task.dueDate || ""),
      dueTime: String(task.dueTime || ""),
      recurring: ["daily", "weekly", "monthly", "yearly"].includes(task.recurring) ? task.recurring : "none",
      reminder: ["due", "5m", "10m", "1d", "2d"].includes(task.reminder) ? task.reminder : "none",
      labels: labelIds.slice(0, 20),
      pomodoros: Math.max(0, Number(task.pomodoros) || 0),
      checklists: checklists,
      attachments: Array.isArray(task.attachments) ? task.attachments.filter(function (attachment) { return attachment && typeof attachment.dataUrl === "string" && attachment.dataUrl.indexOf("data:image/") === 0; }).map(function (attachment) { return { id: String(attachment.id || makeId()), name: String(attachment.name || "Imagem"), dataUrl: attachment.dataUrl, addedAt: String(attachment.addedAt || "") }; }).slice(0, 12) : [],
      comments: Array.isArray(task.comments) ? task.comments.map(function (comment) { return { id: String(comment.id || makeId()), text: String(comment.text || "").slice(0, 400), createdAt: String(comment.createdAt || new Date().toISOString()) }; }).filter(function (comment) { return comment.text; }) : []
    };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDemoState();
      var saved = JSON.parse(raw);
      var fallback = createDemoState();
      var labelCatalog = normalizeLabelCatalog(saved.labels);
      var listCatalog = normalizeLists(saved.lists);
      var timer = Object.assign({}, fallback.timer, saved.timer || {});
      if (!MODE_SECONDS[timer.mode]) timer.mode = "focus";
      timer.totalSeconds = Math.max(1, Number(timer.totalSeconds) || MODE_SECONDS[timer.mode]);
      timer.secondsLeft = Math.max(0, Number(timer.secondsLeft) || 0);
      timer.isRunning = Boolean(timer.isRunning && timer.endsAt);
      return {
        tasks: Array.isArray(saved.tasks) ? saved.tasks.map(function (task) { return normalizeTask(task, labelCatalog, listCatalog); }) : fallback.tasks,
        lists: listCatalog,
        labels: labelCatalog,
        sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
        timer: timer
      };
    } catch (error) {
      return createDemoState();
    }
  }
  function persist(showError) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      var chip = document.querySelector(".local-chip");
      var status = document.querySelector(".local-status");
      if (chip) {
        chip.classList.add("is-warning");
        chip.innerHTML = '<span class="status-dot" style="background:#bd6d61"></span>armazenamento bloqueado';
      }
      if (status) status.textContent = "Armazenamento bloqueado";
      if (showError !== false) showToast("O navegador bloqueou o salvamento local. Exporte um backup para guardar seus dados.");
      return false;
    }
  }
  function showToast(message) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 3000);
  }
  function taskById(id) { return state.tasks.find(function (task) { return task.id === id; }) || null; }
  function labelById(id) { return state.labels.find(function (label) { return label.id === id; }) || null; }
  function labelTextColor(color) {
    var hex = /^#[0-9a-f]{6}$/i.test(color || "") ? color.slice(1) : "777777";
    var channels = [0, 2, 4].map(function (start) { return parseInt(hex.slice(start, start + 2), 16) / 255; }).map(function (channel) { return channel <= .03928 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4); });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .42 ? "#202124" : "#ffffff";
  }
  function labelBadgeHtml(label, compact) {
    if (!label) return "";
    var style = "--label-color:" + label.color + ";--label-text:" + labelTextColor(label.color);
    return '<span class="task-label' + (compact ? " is-compact" : "") + '" style="' + style + '">' + escapeHtml(label.name) + '</span>';
  }
  function checklistStats(task) {
    var items = (task.checklists || []).reduce(function (all, checklist) { return all.concat(checklist.items || []); }, []);
    var total = items.length;
    var complete = items.filter(function (item) { return item.done; }).length;
    return { total: total, complete: complete, percent: total ? Math.round((complete / total) * 100) : 0 };
  }
  function setGreeting() {
    var hour = new Date().getHours();
    var greeting = hour < 12 ? "BOM DIA" : hour < 18 ? "BOA TARDE" : "BOA NOITE";
    document.getElementById("greeting").textContent = greeting;
    document.getElementById("long-date").textContent = formatFullDate(new Date()).toLocaleUpperCase("pt-BR");
  }
  function renderSummary() {
    var today = getTodayKey();
    var selectedDate = activeDate || today;
    var selectedTasks = state.tasks.filter(function (task) { return task.dueDate === selectedDate; });
    var selectedOpen = selectedTasks.filter(function (task) { return !isTaskDone(task); }).length;
    var open = state.tasks.filter(function (task) { return !isTaskDone(task); }).length;
    var done = state.tasks.filter(isTaskDone).length;
    document.getElementById("today-open-count").textContent = selectedOpen;
    document.getElementById("task-count-word").textContent = selectedOpen === 1 ? "tarefa" : "tarefas";
    var selectedDateObject = dateFromKey(selectedDate);
    var selectedDayLabel = selectedDate === today ? "hoje" : selectedDateObject ? new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(selectedDateObject) : "hoje";
    document.getElementById("summary-day-label").textContent = selectedDayLabel;
    document.getElementById("open-total").textContent = open;
    document.getElementById("done-total").textContent = done;
    document.getElementById("focus-total").textContent = state.sessions.length;
    document.getElementById("summary-subtitle").textContent = selectedOpen
      ? "Escolha uma tarefa e avance no seu tempo."
      : "Sem tarefas pendentes. Use o espaço para planejar seu próximo passo.";
    var now = new Date();
    var rangeStart;
    var rangeEnd;
    if (progressPeriod === "monthly") {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else {
      rangeStart = addDays(now, -((now.getDay() + 6) % 7));
      rangeEnd = addDays(rangeStart, 7);
    }
    var periodTasks = state.tasks.filter(function (task) {
      var date = dateFromKey(task.dueDate);
      return date && date >= rangeStart && date < rangeEnd;
    });
    if (!periodTasks.length) periodTasks = state.tasks;
    var periodDone = periodTasks.filter(isTaskDone).length;
    var progress = periodTasks.length ? Math.round(periodDone / periodTasks.length * 100) : 0;
    document.getElementById("home-progress-value").textContent = progress + "%";
    document.getElementById("home-progress-message").textContent = progress >= 75 ? "Você está indo bem!" : progress > 0 ? "Continue no seu ritmo." : "Um passo de cada vez.";
    document.getElementById("home-progress-note").textContent = periodTasks.length ? periodDone + " de " + periodTasks.length + " tarefas concluídas neste período." : "Adicione tarefas para acompanhar seu progresso.";
    document.querySelectorAll("[data-progress-period]").forEach(function (button) { button.classList.toggle("is-active", button.dataset.progressPeriod === progressPeriod); });
  }
  function listById(id) { return state.lists.find(function (list) { return list.id === id; }) || null; }
  function isTaskDone(task) { var list = task && listById(task.status); return Boolean(list && list.done); }
  function renderHomeDay() {
    var selectedDate = dateFromKey(activeDate) || new Date();
    var tasks = state.tasks.filter(function (task) { return task.dueDate === activeDate; }).sort(function (a, b) { return (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99") || a.title.localeCompare(b.title, "pt-BR"); });
    var primaryTask = tasks.find(function (task) { return !isTaskDone(task); }) || tasks[0];
    document.getElementById("home-day-number").textContent = pad(selectedDate.getDate());
    document.getElementById("home-day-weekday").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(selectedDate).replace(".", "");
    document.getElementById("home-day-primary-title").textContent = primaryTask ? primaryTask.title : "Um dia livre";
    document.getElementById("home-day-primary-meta").textContent = primaryTask
      ? tasks.length + (tasks.length === 1 ? " tarefa" : " tarefas") + " · " + (primaryTask.dueTime || ((listById(primaryTask.status) || { name: "Minha lista" }).name))
      : "Nada planejado · toque para abrir o calendário";
    var additionalTasks = primaryTask ? tasks.filter(function (task) { return task.id !== primaryTask.id; }) : tasks;
    var listHtml = additionalTasks.slice(0, 2).map(function (task) {
      return '<button class="home-day-task-row" type="button" data-open-home-task="' + escapeHtml(task.id) + '"><span class="home-day-task-dot' + (isTaskDone(task) ? " is-done" : "") + '"></span><span>' + escapeHtml(task.title) + '</span><small>' + escapeHtml(task.dueTime || (listById(task.status) || { name: "" }).name) + '</small></button>';
    }).join("");
    if (additionalTasks.length > 2) listHtml += '<p class="home-day-more">+' + (additionalTasks.length - 2) + ' tarefas neste dia</p>';
    document.getElementById("home-day-task-list").innerHTML = listHtml;
    document.getElementById("home-day-card").setAttribute("aria-label", "Agenda de " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(selectedDate));
  }
  function renderCalendar() {
    var strip = document.getElementById("calendar-strip");
    var today = getTodayKey();
    var current = dateFromKey(today);
    var dayOffset = (current.getDay() + 6) % 7;
    var monday = addDays(current, -dayOffset);
    var html = "";
    for (var index = 0; index < 7; index++) {
      var date = addDays(monday, index);
      var key = dateKey(date);
      var dayTasks = state.tasks.filter(function (task) { return task.dueDate === key; }).length;
      var classes = ["day-button"];
      if (key === activeDate) classes.push("is-selected");
      if (key === today) classes.push("is-today");
      html += '<button class="' + classes.join(" ") + '" type="button" data-date="' + key + '" aria-label="' +
        escapeHtml(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(date)) +
        '"' + (key === activeDate ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        '<span class="day-name">' + escapeHtml(new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "")) + '</span>' +
        '<span class="day-number">' + date.getDate() + '</span>' + (dayTasks ? '<i class="day-dot"></i>' : "") + '</button>';
    }
    strip.innerHTML = html;
    document.getElementById("active-date-label").textContent = activeDate === today ? "· Hoje" : "· " + formatShortDate(activeDate);
    var selectedTasks = state.tasks.filter(function (task) { return task.dueDate === activeDate; }).length;
    document.getElementById("calendar-note").textContent = selectedTasks ? selectedTasks + (selectedTasks === 1 ? " tarefa nesta data." : " tarefas nesta data.") : "Toque em um dia para ver as tarefas.";
  }
  function setActiveCalendarDate(date) {
    appCalendarDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    appCalendarMonth = new Date(appCalendarDate.getFullYear(), appCalendarDate.getMonth(), 1);
    activeDate = dateKey(appCalendarDate);
    currentFilter = "today";
    render();
    renderAppCalendar();
  }
  function renderAppCalendar() {
    var dialog = document.getElementById("month-calendar-dialog");
    if (!dialog) return;
    var period = document.getElementById("app-calendar-period");
    var weekdays = document.getElementById("app-calendar-weekdays");
    var grid = document.getElementById("app-calendar-grid");
    var yearGrid = document.getElementById("app-calendar-year-grid");
    var dayFocus = document.getElementById("app-calendar-day-focus");
    var selectedKey = dateKey(appCalendarDate);
    period.textContent = appCalendarView === "year"
      ? String(appCalendarMonth.getFullYear())
      : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(appCalendarMonth);
    document.querySelectorAll("[data-calendar-view]").forEach(function (button) { button.classList.toggle("is-active", button.dataset.calendarView === appCalendarView); });
    yearGrid.hidden = appCalendarView !== "year";
    weekdays.hidden = appCalendarView !== "month";
    grid.hidden = appCalendarView !== "month";
    dayFocus.hidden = appCalendarView !== "day";
    if (appCalendarView === "month") {
      var first = new Date(appCalendarMonth.getFullYear(), appCalendarMonth.getMonth(), 1);
      var day = addDays(first, -((first.getDay() + 6) % 7));
      var html = "";
      for (var index = 0; index < 42; index += 1) {
        var key = dateKey(day);
        var dayTasks = state.tasks.filter(function (task) { return task.dueDate === key; }).length;
        var classes = ["app-calendar-day"];
        if (day.getMonth() !== appCalendarMonth.getMonth()) classes.push("is-other-month");
        if (key === getTodayKey()) classes.push("is-today");
        if (key === selectedKey) classes.push("is-selected");
        if (dayTasks) classes.push("has-tasks");
        html += '<button class="' + classes.join(" ") + '" type="button" data-app-calendar-day="' + key + '" aria-label="' + escapeHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(day) + (dayTasks ? ", " + dayTasks + (dayTasks === 1 ? " tarefa" : " tarefas") : ", sem tarefas")) + '" aria-pressed="' + (key === selectedKey) + '"><span>' + day.getDate() + '</span>' + (dayTasks ? '<i aria-hidden="true"></i>' : "") + '</button>';
        day = addDays(day, 1);
      }
      grid.innerHTML = html;
    } else if (appCalendarView === "year") {
      yearGrid.innerHTML = Array.from({ length: 12 }, function (_, index) {
        var date = new Date(appCalendarMonth.getFullYear(), index, 1);
        var count = state.tasks.filter(function (task) { var taskDate = dateFromKey(task.dueDate); return taskDate && taskDate.getFullYear() === date.getFullYear() && taskDate.getMonth() === index; }).length;
        return '<button type="button" data-app-calendar-year-month="' + index + '"' + (index === appCalendarMonth.getMonth() ? ' class="is-selected"' : "") + '><strong>' + escapeHtml(new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(date)) + '</strong><small>' + count + (count === 1 ? " tarefa" : " tarefas") + '</small></button>';
      }).join("");
    } else {
      dayFocus.textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(appCalendarDate);
    }
    document.getElementById("selected-day-heading").textContent = "Tarefas de " + new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(appCalendarDate);
    var selectedTasks = state.tasks.filter(function (task) { return task.dueDate === selectedKey; }).sort(function (a, b) { return (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99") || a.title.localeCompare(b.title, "pt-BR"); });
    document.getElementById("selected-day-tasks").innerHTML = selectedTasks.length ? selectedTasks.map(function (task) {
      var list = listById(task.status);
      return '<button class="calendar-task-row" type="button" data-calendar-task="' + escapeHtml(task.id) + '"><span class="calendar-task-indicator' + (isTaskDone(task) ? " is-done" : "") + '"></span><span><strong>' + escapeHtml(task.title) + '</strong><small>' + escapeHtml((task.dueTime ? task.dueTime + " · " : "") + (list ? list.name : "Tarefa")) + '</small></span><i aria-hidden="true">›</i></button>';
    }).join("") : '<p class="calendar-empty">Nenhuma tarefa para este dia. Um espaço livre também faz parte do ritmo.</p>';
  }
  function openCalendarDialog() {
    appCalendarDate = dateFromKey(activeDate) || new Date();
    appCalendarMonth = new Date(appCalendarDate.getFullYear(), appCalendarDate.getMonth(), 1);
    appCalendarView = "month";
    renderAppCalendar();
    var dialog = document.getElementById("month-calendar-dialog");
    if (!dialog.open) dialog.showModal();
    document.querySelectorAll("[data-mobile-view]").forEach(function (button) { button.removeAttribute("aria-current"); });
    document.getElementById("mobile-nav-calendar").setAttribute("aria-current", "page");
  }
  function closeCalendarDialog() {
    var dialog = document.getElementById("month-calendar-dialog");
    if (dialog.open) dialog.close();
    var activeScreen = document.body.dataset.mobileScreen || "home";
    document.querySelectorAll("[data-mobile-view]").forEach(function (button) {
      if (button.dataset.mobileView === activeScreen) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }
  function shiftActiveDate(amount) {
    var selected = dateFromKey(activeDate) || new Date();
    setActiveCalendarDate(addDays(selected, amount));
  }
  function taskCardHtml(task) {
    var checklist = checklistStats(task);
    var labels = task.labels.slice(0, 2).map(function (labelId) { return labelBadgeHtml(labelById(labelId), true); }).join("");
    if (task.labels.length > 2) labels += '<span class="task-label task-label-more">+' + (task.labels.length - 2) + '</span>';
    var dueClass = task.dueDate && task.dueDate < getTodayKey() && !isTaskDone(task) ? " is-overdue" : "";
    var progress = checklist.total ? '<div class="task-check-progress"><span class="checklist-counter">☑ ' + checklist.complete + '/' + checklist.total + '</span><span class="mini-progress"><span style="width:' + checklist.percent + '%"></span></span></div>' : "";
    var checklistItems = (task.checklists || []).reduce(function (all, checklistGroup, checklistIndex) {
      return all.concat(checklistGroup.items.map(function (item, itemIndex) { return { item: item, checklistIndex: checklistIndex, itemIndex: itemIndex }; }));
    }, []);
    var expanded = expandedChecklistCards.has(task.id);
    var previewItems = expanded ? checklistItems : checklistItems.slice(0, 3);
    var checklistPreview = checklistItems.length ? '<div class="card-checklist-preview">' + previewItems.map(function (entry) {
      return '<label class="preview-check-item"><input type="checkbox" data-board-checklist="' + escapeHtml(task.id) + '" data-checklist-index="' + entry.checklistIndex + '" data-item-index="' + entry.itemIndex + '"' + (entry.item.done ? " checked" : "") + '><span>' + escapeHtml(entry.item.text) + '</span></label>';
    }).join("") + (checklistItems.length > 3 ? '<button class="show-checklist-more" type="button" data-expand-card="' + escapeHtml(task.id) + '">' + (expanded ? "Mostrar menos" : "Mostrar mais") + '</button>' : "") + '</div>' : "";
    var due = task.dueDate ? formatShortDate(task.dueDate) : "Sem prazo";
    return '<article class="task-card' + (isTaskDone(task) ? " is-card-complete" : "") + '" tabindex="0" draggable="true" data-task-id="' + escapeHtml(task.id) + '">' +
      '<div class="task-card-top"><div class="task-labels">' + labels + '</div></div>' +
      '<h3>' + escapeHtml(task.title) + '</h3>' +
      (task.description ? '<p class="task-description-preview">' + escapeHtml(task.description) + '</p>' : "") +
      progress +
      checklistPreview +
      '<div class="task-card-bottom"><span class="due-date' + dueClass + '">◷ ' + escapeHtml(due) + '</span>' +
      (task.attachments.length ? '<span class="card-attachment-count">⌁ ' + task.attachments.length + '</span>' : "") +
      '<button class="card-focus" type="button" data-focus-task="' + escapeHtml(task.id) + '">Focar</button></div>' +
      '</article>';
  }
  function listMenuHtml(list) {
    var positions = state.lists.map(function (item, index) { return '<option value="' + index + '"' + (item.id === list.id ? " selected" : "") + '>' + (index + 1) + ' · ' + escapeHtml(item.name) + '</option>'; }).join("");
    var destinations = state.lists.filter(function (item) { return item.id !== list.id; }).map(function (item) {
      return '<button type="button" data-move-cards-to="' + escapeHtml(item.id) + '" data-source-list="' + escapeHtml(list.id) + '">' + escapeHtml(item.name) + '</button>';
    }).join("");
    var cardCount = state.tasks.filter(function (task) { return task.status === list.id; }).length;
    return '<div class="list-menu-popover" data-menu-for="' + escapeHtml(list.id) + '" hidden>' +
      '<div class="list-menu-heading"><strong>Ações da lista</strong><button type="button" data-close-list-menu aria-label="Fechar">×</button></div>' +
      '<button type="button" data-list-action="add-card" data-list-id="' + escapeHtml(list.id) + '">＋ Adicionar cartão</button>' +
      '<button type="button" data-list-action="copy-list" data-list-id="' + escapeHtml(list.id) + '">▣ Copiar lista</button>' +
      '<button type="button" data-list-action="move-list" data-list-id="' + escapeHtml(list.id) + '">↔ Mover lista <span>›</span></button>' +
      '<div class="list-submenu" data-submenu="move-list" hidden><label>Posição da lista</label><select data-list-position="' + escapeHtml(list.id) + '">' + positions + '</select><button type="button" data-confirm-list-position="' + escapeHtml(list.id) + '">Mover</button></div>' +
      '<button type="button" data-list-action="move-cards" data-list-id="' + escapeHtml(list.id) + '">⇢ Mover todos os cartões nesta lista <span>›</span></button>' +
      '<div class="list-submenu" data-submenu="move-cards" hidden>' + (destinations || '<p>Crie outra lista para mover os cartões.</p>') + '</div>' +
      '<button type="button" data-list-action="sort-list" data-list-id="' + escapeHtml(list.id) + '">↕ Ordenar por <span>›</span></button>' +
      '<div class="list-submenu" data-submenu="sort-list" hidden><button type="button" data-sort-list="title" data-list-id="' + escapeHtml(list.id) + '">Nome (A–Z)</button><button type="button" data-sort-list="due" data-list-id="' + escapeHtml(list.id) + '">Data de entrega</button></div>' +
      '<div class="list-menu-divider"></div>' +
      '<button class="list-danger-action" type="button" data-list-action="delete-list" data-list-id="' + escapeHtml(list.id) + '"' + (state.lists.length < 2 ? ' disabled title="O quadro precisa manter uma lista"' : "") + '>Deletar esta lista</button>' +
      '<button class="list-danger-action" type="button" data-list-action="delete-cards" data-list-id="' + escapeHtml(list.id) + '"' + (!cardCount ? " disabled" : "") + '>Deletar todos os cartões nesta lista</button>' +
      '</div>';
  }
  function renderBoard() {
    var board = document.getElementById("task-board");
    var tasks = state.tasks.slice();
    if (currentFilter === "today") tasks = tasks.filter(function (task) { return task.dueDate === activeDate; });
    if (currentFilter === "open") tasks = tasks.filter(function (task) { return !isTaskDone(task); });
    if (currentFilter === "done") tasks = tasks.filter(isTaskDone);
    var html = "";
    state.lists.forEach(function (column) {
      var columnTasks = tasks.filter(function (task) { return task.status === column.id; });
      html += '<section class="board-column" data-status="' + escapeHtml(column.id) + '" aria-label="' + escapeHtml(column.name) + '">' +
        '<div class="column-heading"><span class="column-title">' + escapeHtml(column.name) + '</span><span class="column-count">' + state.tasks.filter(function (task) { return task.status === column.id; }).length + '</span>' +
        '<div class="column-menu-wrap"><button class="column-menu-button" type="button" data-list-menu="' + escapeHtml(column.id) + '" aria-label="Ações da lista ' + escapeHtml(column.name) + '">•••</button>' + listMenuHtml(column) + '</div></div>' +
        '<div class="column-cards">' + (columnTasks.length ? columnTasks.map(taskCardHtml).join("") : '<div class="empty-column">Solte um cartão aqui</div>') + '</div>' +
        '<button class="add-card-button" type="button" data-add-card="' + escapeHtml(column.id) + '"><span aria-hidden="true">＋</span> Adicionar um cartão</button></section>';
    });
    html += '<div class="new-list-creator"><button class="add-list-button" type="button" data-start-new-list>＋ Adicionar outra lista</button><div class="new-list-form" data-new-list-form hidden><input class="text-field" id="new-list-name" maxlength="42" placeholder="Insira o título da lista"><div><button class="small-popover-button" type="button" data-create-list>Criar lista</button><button class="list-form-cancel" type="button" data-cancel-new-list aria-label="Cancelar">×</button></div></div></div>';
    board.innerHTML = html;
    document.querySelectorAll(".filter-button").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.filter === currentFilter);
    });
  }
  function closeListMenus() {
    document.querySelectorAll(".list-menu-popover").forEach(function (menu) { menu.hidden = true; });
  }
  function moveListToPosition(listId, position) {
    var index = state.lists.findIndex(function (list) { return list.id === listId; });
    if (index < 0) return;
    var list = state.lists.splice(index, 1)[0];
    state.lists.splice(Math.max(0, Math.min(state.lists.length, Number(position) || 0)), 0, list);
    persist();
    renderBoard();
  }
  function copyList(listId) {
    var source = listById(listId);
    if (!source) return;
    var copy = { id: makeId(), name: (source.name + " (cópia)").slice(0, 42), done: source.done };
    var sourceIndex = state.lists.findIndex(function (list) { return list.id === listId; });
    state.lists.splice(sourceIndex + 1, 0, copy);
    var copiedTasks = state.tasks.filter(function (task) { return task.status === listId; }).map(function (task) {
      var cloned = clone(task);
      cloned.id = makeId();
      cloned.status = copy.id;
      cloned.comments = [];
      cloned.attachments = [];
      cloned.pomodoros = 0;
      cloned.checklists = cloned.checklists.map(function (checklist) {
        checklist.id = makeId();
        checklist.items = checklist.items.map(function (item) { return { text: item.text, done: false }; });
        return checklist;
      });
      return cloned;
    });
    state.tasks.push.apply(state.tasks, copiedTasks);
    persist();
    renderBoard();
    showToast("Lista copiada. Os cartões, etiquetas e checklists foram duplicados.");
  }
  function moveAllCards(sourceId, targetId) {
    if (!listById(sourceId) || !listById(targetId) || sourceId === targetId) return;
    var moving = state.tasks.filter(function (task) { return task.status === sourceId; });
    if (!moving.length) return;
    state.tasks = state.tasks.filter(function (task) { return task.status !== sourceId; });
    moving.forEach(function (task) { task.status = targetId; });
    var insertAt = -1;
    for (var index = state.tasks.length - 1; index >= 0; index -= 1) {
      if (state.tasks[index].status === targetId) { insertAt = index + 1; break; }
    }
    if (insertAt < 0) insertAt = state.tasks.length;
    state.tasks.splice.apply(state.tasks, [insertAt, 0].concat(moving));
    persist();
    renderBoard();
  }
  function sortList(listId, mode) {
    var positions = [];
    var cards = [];
    state.tasks.forEach(function (task, index) {
      if (task.status === listId) { positions.push(index); cards.push(task); }
    });
    cards.sort(function (a, b) {
      if (mode === "due") return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") || a.title.localeCompare(b.title, "pt-BR");
      return a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
    });
    positions.forEach(function (position, index) { state.tasks[position] = cards[index]; });
    persist();
    renderBoard();
  }
  function createBoardList() {
    var input = document.getElementById("new-list-name");
    var name = input && input.value.trim();
    if (!name) { if (input) input.focus(); return; }
    state.lists.push({ id: makeId(), name: name.slice(0, 42), done: false });
    persist();
    renderBoard();
    showToast("Lista criada.");
  }
  function openDeleteConfirmation(type, listId) {
    var list = listById(listId);
    if (!list || (type === "list" && state.lists.length < 2)) return;
    var cardCount = state.tasks.filter(function (task) { return task.status === listId; }).length;
    if (type === "cards" && !cardCount) return;
    pendingDeletion = { type: type, listId: listId };
    document.getElementById("delete-confirm-title").textContent = type === "list" ? "Você quer realmente deletar esta lista?" : "Você quer realmente deletar todos os cartões?";
    document.getElementById("delete-confirm-copy").textContent = type === "list"
      ? 'A lista “' + list.name + '” e todos os seus cartões (' + cardCount + ') serão removidos. Você poderá desfazer em até 15 segundos.'
      : (cardCount === 1 ? 'O cartão de “' + list.name + '” será removido.' : cardCount + ' cartões de “' + list.name + '” serão removidos.') + " Você poderá desfazer em até 15 segundos.";
    document.getElementById("delete-confirm-dialog").showModal();
  }
  function showUndoToast(message, entry) {
    undoStack.push({ message: message, entry: entry, expiresAt: Date.now() + 15000 });
    if (undoInterval) window.clearInterval(undoInterval);
    var toast = document.getElementById("undo-toast");
    toast.hidden = false;
    toast.classList.remove("is-hiding");
    updateUndoCountdown();
    undoInterval = window.setInterval(updateUndoCountdown, 1000);
  }
  function updateUndoCountdown() {
    var now = Date.now();
    undoStack = undoStack.filter(function (item) { return item.expiresAt > now; });
    if (!undoStack.length) { hideUndoToast(); return; }
    var latest = undoStack[undoStack.length - 1];
    undoRemaining = Math.max(1, Math.ceil((latest.expiresAt - now) / 1000));
    document.getElementById("undo-message").textContent = latest.message;
    document.getElementById("undo-countdown").textContent = undoRemaining;
    document.getElementById("undo-progress-fill").style.width = (undoRemaining / 15 * 100) + "%";
  }
  function hideUndoToast() {
    if (undoInterval) window.clearInterval(undoInterval);
    undoInterval = null;
    undoStack = [];
    var toast = document.getElementById("undo-toast");
    if (toast) toast.hidden = true;
  }
  function confirmPendingDeletion() {
    if (!pendingDeletion) return;
    var request = pendingDeletion;
    var list = listById(request.listId);
    if (!list) return;
    var listIndex = state.lists.findIndex(function (item) { return item.id === request.listId; });
    var entries = [];
    state.tasks.forEach(function (task, index) { if (task.status === request.listId) entries.push({ index: index, task: task }); });
    var timerSnapshot = entries.some(function (entry) { return entry.task.id === state.timer.taskId; }) ? clone(state.timer) : null;
    if (request.type === "list") state.lists.splice(listIndex, 1);
    state.tasks = state.tasks.filter(function (task) { return task.status !== request.listId; });
    if (timerSnapshot) {
      state.timer.isRunning = false;
      state.timer.endsAt = null;
      state.timer.taskId = null;
    }
    var timerAfterDelete = timerSnapshot ? clone(state.timer) : null;
    pendingDeletion = null;
    var confirmDialog = document.getElementById("delete-confirm-dialog");
    if (confirmDialog.open) confirmDialog.close();
    expandedChecklistCards.clear();
    persist();
    render();
    var description = request.type === "list" ? 'Lista “' + list.name + '” deletada.' : entries.length + (entries.length === 1 ? ' cartão deletado de “' : ' cartões deletados de “') + list.name + '”.';
    showUndoToast(description, { type: request.type, list: clone(list), listIndex: listIndex, entries: entries.map(function (entry) { return { index: entry.index, task: clone(entry.task) }; }), timer: timerSnapshot, timerAfterDelete: timerAfterDelete });
  }
  function undoPendingDeletion() {
    updateUndoCountdown();
    if (!undoStack.length) return;
    var pendingUndo = undoStack.pop();
    var entry = pendingUndo.entry;
    if (entry.type === "list") state.lists.splice(Math.min(entry.listIndex, state.lists.length), 0, entry.list);
    entry.entries.sort(function (a, b) { return a.index - b.index; }).forEach(function (item) {
      state.tasks.splice(Math.min(item.index, state.tasks.length), 0, item.task);
    });
    if (entry.timer && JSON.stringify(state.timer) === JSON.stringify(entry.timerAfterDelete)) {
      state.timer = entry.timer;
      if (state.timer.isRunning && state.timer.endsAt <= Date.now()) { state.timer.isRunning = false; state.timer.endsAt = null; state.timer.secondsLeft = 0; }
    }
    if (undoStack.length) updateUndoCountdown();
    else hideUndoToast();
    persist();
    render();
    showToast("Exclusão desfeita.");
  }
  function clearDropIndicators() {
    document.querySelectorAll(".board-column.is-drop-target, .task-card.drop-before, .task-card.drop-after").forEach(function (node) {
      node.classList.remove("is-drop-target", "drop-before", "drop-after");
    });
  }
  function indicateDrop(column, card, clientY, draggedId) {
    clearDropIndicators();
    if (!column) return;
    column.classList.add("is-drop-target");
    if (!card || card.dataset.taskId === draggedId) return;
    card.classList.add(clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2 ? "drop-before" : "drop-after");
  }
  function moveTask(taskId, status, targetTaskId, after) {
    if (!listById(status) || targetTaskId === taskId) return;
    var sourceIndex = state.tasks.findIndex(function (task) { return task.id === taskId; });
    if (sourceIndex < 0) return;
    var task = state.tasks.splice(sourceIndex, 1)[0];
    var previousStatus = task.status;
    task.status = status;
    var targetIndex = targetTaskId ? state.tasks.findIndex(function (item) { return item.id === targetTaskId && item.status === status; }) : -1;
    var insertIndex;
    if (targetIndex >= 0) insertIndex = targetIndex + (after ? 1 : 0);
    else {
      insertIndex = -1;
      for (var index = state.tasks.length - 1; index >= 0; index -= 1) {
        if (state.tasks[index].status === status) { insertIndex = index + 1; break; }
      }
      if (insertIndex < 0) insertIndex = state.tasks.length;
    }
    state.tasks.splice(insertIndex, 0, task);
    persist();
    render();
    if (previousStatus !== status) showToast("Cartão movido para “" + listById(status).name + "”.");
  }
  function bindBoardDrag(board) {
    board.addEventListener("dragstart", function (event) {
      var card = event.target.closest(".task-card");
      if (!card) return;
      nativeDragTaskId = card.dataset.taskId;
      card.classList.add("is-dragging");
      suppressCardClickUntil = Date.now() + 700;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", nativeDragTaskId);
      }
    });
    board.addEventListener("dragover", function (event) {
      if (!nativeDragTaskId) return;
      var column = event.target.closest(".board-column");
      if (!column) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      indicateDrop(column, event.target.closest(".task-card"), event.clientY, nativeDragTaskId);
    });
    board.addEventListener("drop", function (event) {
      if (!nativeDragTaskId) return;
      var column = event.target.closest(".board-column");
      if (!column) return;
      event.preventDefault();
      var targetCard = event.target.closest(".task-card");
      var after = targetCard && event.clientY >= targetCard.getBoundingClientRect().top + targetCard.getBoundingClientRect().height / 2;
      moveTask(nativeDragTaskId, column.dataset.status, targetCard && targetCard.dataset.taskId, after);
      nativeDragTaskId = null;
      clearDropIndicators();
    });
    board.addEventListener("dragend", function () {
      nativeDragTaskId = null;
      clearDropIndicators();
      document.querySelectorAll(".task-card.is-dragging").forEach(function (card) { card.classList.remove("is-dragging"); });
    });

    board.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "touch" || event.target.closest("button")) return;
      var card = event.target.closest(".task-card");
      if (!card || touchDragState) return;
      card.draggable = false;
      touchDragState = {
        taskId: card.dataset.taskId, pointerId: event.pointerId, card: card,
        startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
        offsetX: event.clientX - card.getBoundingClientRect().left,
        offsetY: event.clientY - card.getBoundingClientRect().top,
        moved: false, dragging: false, ghost: null
      };
      touchHoldTimeout = window.setTimeout(function () {
        if (!touchDragState || touchDragState.pointerId !== event.pointerId || touchDragState.moved) return;
        var drag = touchDragState;
        drag.dragging = true;
        drag.card.classList.add("is-touch-source");
        drag.ghost = drag.card.cloneNode(true);
        drag.ghost.classList.add("touch-drag-ghost");
        drag.ghost.style.width = drag.card.getBoundingClientRect().width + "px";
        drag.ghost.style.left = (drag.lastX - drag.offsetX) + "px";
        drag.ghost.style.top = (drag.lastY - drag.offsetY) + "px";
        document.body.appendChild(drag.ghost);
        document.body.classList.add("is-card-dragging");
      }, 280);
    });
    document.addEventListener("pointermove", function (event) {
      var drag = touchDragState;
      if (!drag || drag.pointerId !== event.pointerId) return;
      var deltaY = event.clientY - drag.lastY;
      var deltaX = event.clientX - drag.lastX;
      if (!drag.dragging) {
        if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 9) {
          drag.moved = true;
          window.clearTimeout(touchHoldTimeout);
          event.preventDefault();
          var boardScroll = board;
          var listScroll = drag.card.closest(".column-cards");
          if (Math.abs(deltaX) > Math.abs(deltaY) && boardScroll.scrollWidth > boardScroll.clientWidth) boardScroll.scrollLeft -= deltaX;
          else if (listScroll && listScroll.scrollHeight > listScroll.clientHeight && ((deltaY < 0 && listScroll.scrollTop < listScroll.scrollHeight - listScroll.clientHeight) || (deltaY > 0 && listScroll.scrollTop > 0))) listScroll.scrollTop -= deltaY;
          else window.scrollBy(0, -deltaY);
        }
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        return;
      }
      event.preventDefault();
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.ghost.style.left = (event.clientX - drag.offsetX) + "px";
      drag.ghost.style.top = (event.clientY - drag.offsetY) + "px";
      var target = document.elementFromPoint(event.clientX, event.clientY);
      var column = target && target.closest(".board-column");
      indicateDrop(column, target && target.closest(".task-card"), event.clientY, drag.taskId);
      if (event.clientY < 65) window.scrollBy(0, -8);
      else if (event.clientY > window.innerHeight - 65) window.scrollBy(0, 8);
      if (event.clientX < 60) board.scrollLeft -= 8;
      else if (event.clientX > window.innerWidth - 60) board.scrollLeft += 8;
    }, { passive: false });
    function finishTouchDrag(event) {
      var drag = touchDragState;
      if (!drag || (event && drag.pointerId !== event.pointerId)) return;
      window.clearTimeout(touchHoldTimeout);
      if (drag.dragging && event && event.type === "pointerup") {
        var target = document.elementFromPoint(event.clientX, event.clientY);
        var column = target && target.closest(".board-column");
        var targetCard = target && target.closest(".task-card");
        if (column) {
          var after = targetCard && event.clientY >= targetCard.getBoundingClientRect().top + targetCard.getBoundingClientRect().height / 2;
          moveTask(drag.taskId, column.dataset.status, targetCard && targetCard.dataset.taskId, after);
        }
        suppressCardClickUntil = Date.now() + 700;
      } else if (drag.moved) suppressCardClickUntil = Date.now() + 450;
      if (drag.ghost) drag.ghost.remove();
      drag.card.draggable = true;
      drag.card.classList.remove("is-touch-source");
      document.body.classList.remove("is-card-dragging");
      clearDropIndicators();
      touchDragState = null;
    }
    document.addEventListener("pointerup", finishTouchDrag);
    document.addEventListener("pointercancel", finishTouchDrag);
  }
  function formatClock(seconds) {
    var safe = Math.max(0, Number(seconds) || 0);
    return pad(Math.floor(safe / 60)) + ":" + pad(safe % 60);
  }
  function renderTimer() {
    var timer = state.timer;
    var task = timer.taskId ? taskById(timer.taskId) : null;
    var taskLabel = task ? task.title : "Escolha uma tarefa para começar";
    if (timer.mode !== "focus" && task) taskLabel = MODE_NAMES[timer.mode] + " · " + task.title;
    document.getElementById("timer-task-name").textContent = taskLabel;
    document.getElementById("timer-display").textContent = formatClock(timer.secondsLeft);
    document.getElementById("timer-toggle").textContent = timer.isRunning ? "Pausar" : timer.mode === "focus" ? "Começar foco" : "Começar pausa";
    var progress = timer.totalSeconds ? Math.min(100, Math.max(0, (1 - timer.secondsLeft / timer.totalSeconds) * 100)) : 0;
    document.getElementById("timer-progress-fill").style.width = progress + "%";
    document.getElementById("session-count").textContent = state.sessions.length + (state.sessions.length === 1 ? " sessão completa" : " sessões completas");
    document.querySelectorAll(".timer-mode").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.mode === timer.mode);
    });
  }
  function render() {
    setGreeting();
    renderSummary();
    renderCalendar();
    renderHomeDay();
    renderBoard();
    renderTimer();
  }
  function showTaskDialog(taskId, newStatus) {
    editingId = taskId || null;
    var source = editingId ? taskById(editingId) : null;
    draftTask = source ? clone(source) : {
      id: makeId(), title: "", description: "", status: listById(newStatus) ? newStatus : (state.lists[0] || { id: "todo" }).id, priority: "medium",
      startDate: "", dueDate: activeDate || getTodayKey(), dueTime: "", recurring: "none", reminder: "none", labels: [], pomodoros: 0, checklists: [], attachments: [], comments: []
    };
    document.getElementById("task-title").value = draftTask.title;
    document.getElementById("task-description").value = draftTask.description;
    var statusSelect = document.getElementById("task-status");
    statusSelect.innerHTML = state.lists.map(function (list) { return '<option value="' + escapeHtml(list.id) + '">' + escapeHtml(list.name) + '</option>'; }).join("");
    statusSelect.value = draftTask.status;
    document.getElementById("task-due").value = draftTask.dueDate || "";
    document.getElementById("task-start").value = draftTask.startDate || "";
    document.getElementById("start-date-enabled").checked = Boolean(draftTask.startDate);
    document.getElementById("task-start").disabled = !draftTask.startDate;
    document.getElementById("due-date-enabled").checked = Boolean(draftTask.dueDate);
    document.getElementById("task-due").disabled = !draftTask.dueDate;
    document.getElementById("task-due-time").value = draftTask.dueTime || "";
    document.getElementById("task-recurring").value = draftTask.recurring || "none";
    document.getElementById("task-reminder").value = draftTask.reminder || "none";
    var calendarDate = dateFromKey(draftTask.dueDate) || new Date();
    taskCalendarMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    document.getElementById("label-search").value = "";
    document.getElementById("new-label-name").value = "";
    document.getElementById("checklist-title").value = "Checklist";
    document.getElementById("copy-checklist-from").value = "";
    document.getElementById("comment-input").value = "";
    document.getElementById("attachment-input").value = "";
    document.querySelector(".save-button").disabled = pendingImageLoads > 0;
    document.getElementById("delete-task").hidden = !editingId;
    document.getElementById("dialog-focus").hidden = !editingId;
    document.querySelectorAll(".action-popover").forEach(function (popover) { popover.hidden = true; });
    renderLabelOptions();
    renderTaskCalendar();
    renderCardMeta();
    renderCopyChecklistOptions();
    renderChecklists();
    renderAttachments();
    renderActivity();
    document.getElementById("task-dialog").showModal();
    window.setTimeout(function () { document.getElementById("task-title").focus(); }, 0);
  }
  function renderLabelOptions() {
    if (!draftTask) return;
    var query = document.getElementById("label-search").value.trim().toLowerCase();
    var options = state.labels.filter(function (label) { return !query || label.name.toLowerCase().includes(query); });
    document.getElementById("label-options").innerHTML = options.length ? options.map(function (label) {
      var selected = draftTask.labels.includes(label.id);
      return '<label class="label-option"><input type="checkbox" data-label-toggle="' + escapeHtml(label.id) + '"' + (selected ? " checked" : "") + '><span class="label-option-chip" style="--label-color:' + escapeHtml(label.color) + ';--label-text:' + labelTextColor(label.color) + '">' + escapeHtml(label.name) + '</span></label>';
    }).join("") : '<p class="popover-empty">Nenhuma etiqueta encontrada.</p>';
    renderCardMeta();
  }
  function renderCardMeta() {
    if (!draftTask) return;
    document.getElementById("selected-labels").innerHTML = draftTask.labels.map(function (id) { return labelBadgeHtml(labelById(id), false); }).join("");
    var dueChip = document.getElementById("due-chip");
    dueChip.hidden = !draftTask.dueDate;
    dueChip.textContent = draftTask.dueDate ? "◷  " + formatShortDate(draftTask.dueDate) : "";
  }
  function renderTaskCalendar() {
    var monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(taskCalendarMonth);
    var monthTitle = document.getElementById("task-calendar-month");
    if (!monthTitle) return;
    monthTitle.textContent = monthLabel;
    var first = new Date(taskCalendarMonth.getFullYear(), taskCalendarMonth.getMonth(), 1);
    var day = new Date(first);
    day.setDate(day.getDate() - day.getDay());
    var selected = draftTask ? draftTask.dueDate : "";
    var today = getTodayKey();
    var html = "";
    for (var index = 0; index < 42; index += 1) {
      var key = dateKey(day);
      var classes = ["task-calendar-day"];
      if (day.getMonth() !== taskCalendarMonth.getMonth()) classes.push("is-other-month");
      if (key === today) classes.push("is-today");
      if (key === selected) classes.push("is-selected");
      html += '<button class="' + classes.join(" ") + '" type="button" data-calendar-day="' + key + '" aria-pressed="' + (key === selected) + '">' + day.getDate() + '</button>';
      day.setDate(day.getDate() + 1);
    }
    document.getElementById("task-calendar-grid").innerHTML = html;
  }
  function renderCopyChecklistOptions() {
    var select = document.getElementById("copy-checklist-from");
    var current = select.value;
    select.innerHTML = '<option value="">(nenhum)</option>' + state.tasks.filter(function (task) { return task.id !== (draftTask && draftTask.id) && task.checklists && task.checklists.length; }).map(function (task) {
      return task.checklists.map(function (checklist, index) {
        return '<option value="' + escapeHtml(task.id + "::" + index) + '">' + escapeHtml(task.title + " · " + checklist.title) + '</option>';
      }).join("");
    }).join("");
    if (current && Array.from(select.options).some(function (option) { return option.value === current; })) select.value = current;
  }
  function renderChecklists() {
    var container = document.getElementById("checklist-groups");
    if (!draftTask || !draftTask.checklists.length) { container.innerHTML = ""; return; }
    container.innerHTML = draftTask.checklists.map(function (checklist, checklistIndex) {
      var total = checklist.items.length;
      var complete = checklist.items.filter(function (item) { return item.done; }).length;
      var percent = total ? Math.round(complete / total * 100) : 0;
      var rows = checklist.items.map(function (item, itemIndex) {
        return '<div class="check-item' + (item.done ? " is-done" : "") + '">' +
          '<input id="check-' + checklistIndex + '-' + itemIndex + '" type="checkbox" data-checklist-index="' + checklistIndex + '" data-item-index="' + itemIndex + '"' + (item.done ? " checked" : "") + '>' +
          '<label for="check-' + checklistIndex + '-' + itemIndex + '">' + escapeHtml(item.text) + '</label>' +
          '<button class="remove-check" type="button" data-remove-checklist-item="' + checklistIndex + '" data-item-index="' + itemIndex + '" aria-label="Remover item">×</button></div>';
      }).join("");
      return '<section class="checklist-card" data-checklist-card="' + escapeHtml(checklist.id) + '">' +
        '<header class="checklist-card-heading"><h3 class="detail-section-title"><span>☑</span> ' + escapeHtml(checklist.title) + '</h3><span class="checklist-count">' + complete + '/' + total + '</span><button class="checklist-delete" type="button" data-remove-checklist="' + checklistIndex + '" aria-label="Remover checklist">Excluir</button></header>' +
        '<div class="checklist-progress-row"><span>' + percent + '%</span><span class="checklist-progress-track"><span style="width:' + percent + '%"></span></span></div>' +
        '<div class="checklist-items">' + rows + '</div>' +
        '<div class="add-check-row"><input class="text-field" data-checklist-input="' + escapeHtml(checklist.id) + '" maxlength="100" placeholder="Adicionar um item"><button class="small-popover-button" type="button" data-add-checklist-item="' + escapeHtml(checklist.id) + '">Adicionar</button></div></section>';
    }).join("");
  }
  function renderAttachments() {
    var section = document.getElementById("attachments-section");
    var attachments = draftTask ? draftTask.attachments : [];
    section.hidden = !attachments.length;
    document.getElementById("attachment-grid").innerHTML = attachments.map(function (attachment, index) {
      return '<article class="attachment-card"><a href="' + escapeHtml(attachment.dataUrl) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(attachment.dataUrl) + '" alt="' + escapeHtml(attachment.name) + '"><span>' + escapeHtml(attachment.name) + '</span></a><button type="button" data-remove-attachment="' + index + '" aria-label="Remover anexo">×</button></article>';
    }).join("");
  }
  function renderActivity() {
    var comments = draftTask ? draftTask.comments : [];
    document.getElementById("activity-list").innerHTML = comments.length ? comments.map(function (comment) {
      var time = new Date(comment.createdAt);
      var timestamp = isNaN(time.getTime()) ? "agora" : new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(time);
      return '<article class="activity-item"><span class="comment-avatar">BB</span><div><strong>Bruno Brito Ricardi</strong><p>' + escapeHtml(comment.text).replace(/\n/g, "<br>") + '</p><small>' + escapeHtml(timestamp) + '</small></div></article>';
    }).join("") : '<p class="activity-empty">As atualizações deste cartão aparecerão aqui.</p>';
  }
  function updateDraftFromFields() {
    if (!draftTask) return;
    draftTask.title = document.getElementById("task-title").value.trim();
    draftTask.description = document.getElementById("task-description").value.trim();
    draftTask.status = document.getElementById("task-status").value;
    draftTask.startDate = document.getElementById("start-date-enabled").checked ? document.getElementById("task-start").value : "";
    draftTask.dueDate = document.getElementById("task-due").value;
    draftTask.dueTime = document.getElementById("task-due-time").value;
    draftTask.recurring = document.getElementById("task-recurring").value;
    draftTask.reminder = document.getElementById("task-reminder").value;
  }
  function createChecklistFromPopover() {
    if (!draftTask) return;
    var title = document.getElementById("checklist-title").value.trim();
    if (!title) { document.getElementById("checklist-title").focus(); return; }
    var selection = document.getElementById("copy-checklist-from").value.split("::");
    var source = selection.length === 2 ? taskById(selection[0]) : null;
    var sourceChecklist = source && source.checklists[Number(selection[1])];
    var copied = sourceChecklist ? sourceChecklist.items.map(function (item) { return { text: item.text, done: false }; }) : [];
    var checklist = { id: makeId(), title: title.slice(0, 50), items: copied };
    draftTask.checklists.push(checklist);
    document.getElementById("checklist-popover").hidden = true;
    document.getElementById("checklist-title").value = "Checklist";
    document.getElementById("copy-checklist-from").value = "";
    renderChecklists();
    var input = Array.from(document.querySelectorAll("[data-checklist-input]")).find(function (field) { return field.dataset.checklistInput === checklist.id; });
    if (input) input.focus();
  }
  function addChecklistItem(checklistId) {
    var checklist = draftTask && draftTask.checklists.find(function (item) { return item.id === checklistId; });
    var input = Array.from(document.querySelectorAll("[data-checklist-input]")).find(function (field) { return field.dataset.checklistInput === checklistId; });
    var value = input ? input.value.trim() : "";
    if (!checklist || !value) { if (input) input.focus(); return; }
    checklist.items.push({ text: value, done: false });
    renderChecklists();
    var nextInput = Array.from(document.querySelectorAll("[data-checklist-input]")).find(function (field) { return field.dataset.checklistInput === checklistId; });
    if (nextInput) nextInput.focus();
  }
  function toggleCardPopover(name) {
    var popover = document.getElementById(name + "-popover");
    var shouldOpen = popover.hidden;
    document.querySelectorAll(".action-popover").forEach(function (item) { item.hidden = true; });
    popover.hidden = !shouldOpen;
    if (shouldOpen) {
      if (name === "dates") renderTaskCalendar();
      var focusTarget = name === "labels" ? document.getElementById("label-search") : name === "checklist" ? document.getElementById("checklist-title") : document.getElementById("task-due");
      if (focusTarget) window.setTimeout(function () { focusTarget.focus(); }, 0);
    }
  }
  function createLabel() {
    var input = document.getElementById("new-label-name");
    var name = input.value.trim();
    if (!name || !draftTask) { input.focus(); return; }
    var existing = state.labels.find(function (label) { return label.name.toLowerCase() === name.toLowerCase(); });
    if (existing) {
      if (!draftTask.labels.includes(existing.id)) draftTask.labels.push(existing.id);
      showToast("Essa etiqueta já existe; ela foi selecionada.");
    } else {
      var label = { id: "label-" + makeId(), name: name.slice(0, 24), color: document.getElementById("new-label-color").value };
      state.labels.push(label);
      draftTask.labels.push(label.id);
      persist();
    }
    input.value = "";
    renderLabelOptions();
  }
  function compressImageToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) { reject(new Error("Escolha um arquivo de imagem.")); return; }
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        var context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error("Não foi possível processar esta imagem.")); return; }
          var reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result || "")); };
          reader.onerror = function () { reject(new Error("Não foi possível ler esta imagem.")); };
          reader.readAsDataURL(blob);
        }, "image/jpeg", .82);
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir esta imagem.")); };
      image.src = url;
    });
  }
  function addImageFiles(fileList) {
    if (!draftTask) return;
    var files = Array.from(fileList || []).filter(function (file) { return file.type && file.type.indexOf("image/") === 0; });
    if (!files.length) return;
    if (draftTask.attachments.length + files.length > 8) { showToast("Este cartão pode ter até 8 imagens anexadas."); return; }
    pendingImageLoads += files.length;
    document.querySelector(".save-button").disabled = true;
    files.forEach(function (file) {
      compressImageToDataUrl(file).then(function (dataUrl) {
        if (!draftTask) return;
        var usedOutsideCard = state.tasks.filter(function (task) { return task.id !== draftTask.id; }).reduce(function (total, task) {
          return total + (task.attachments || []).reduce(function (subtotal, attachment) { return subtotal + attachment.dataUrl.length; }, 0);
        }, 0);
        var usedOnCard = draftTask.attachments.reduce(function (total, attachment) { return total + attachment.dataUrl.length; }, 0);
        if (dataUrl.length + usedOutsideCard + usedOnCard > 1800000) { showToast("As imagens atingiram o limite local de armazenamento. Remova algum anexo ou use imagens menores."); return; }
        draftTask.attachments.push({ id: makeId(), name: String(file.name || "Imagem").slice(0, 100), dataUrl: dataUrl, addedAt: new Date().toISOString() });
        renderAttachments();
      }).catch(function () {
        showToast("Não consegui anexar uma das imagens selecionadas.");
      }).finally(function () {
        pendingImageLoads = Math.max(0, pendingImageLoads - 1);
        var saveButton = document.querySelector(".save-button");
        if (saveButton) saveButton.disabled = pendingImageLoads > 0;
      });
    });
  }
  function addComment() {
    if (!draftTask || pendingImageLoads) return;
    var input = document.getElementById("comment-input");
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    var saved = commitDraft();
    if (!saved) return;
    saved.comments.push({ id: makeId(), text: text.slice(0, 400), createdAt: new Date().toISOString() });
    draftTask = clone(saved);
    input.value = "";
    persist();
    renderActivity();
  }
  function commitDraft() {
    if (!draftTask) return null;
    updateDraftFromFields();
    if (!draftTask.title) {
      document.getElementById("task-title").focus();
      showToast("Dê um nome para a tarefa antes de salvar.");
      return null;
    }
    if (editingId) {
      var index = state.tasks.findIndex(function (task) { return task.id === editingId; });
      if (index >= 0) state.tasks[index] = clone(draftTask);
      else state.tasks.unshift(clone(draftTask));
    } else {
      state.tasks.unshift(clone(draftTask));
      editingId = draftTask.id;
      document.getElementById("delete-task").hidden = false;
      document.getElementById("dialog-focus").hidden = false;
    }
    persist();
    render();
    return taskById(editingId);
  }
  function closeTaskDialog() {
    if (pendingImageLoads) { showToast("Aguarde o processamento das imagens antes de fechar o cartão."); return; }
    var dialog = document.getElementById("task-dialog");
    if (dialog.open) dialog.close();
    draftTask = null;
    editingId = null;
  }
  function startFocus(taskId) {
    var timer = state.timer;
    if (timer.isRunning && timer.taskId !== taskId) {
      showToast("Pause o timer atual antes de trocar de tarefa.");
      return false;
    }
    if (timer.mode !== "focus" || timer.taskId !== taskId || timer.secondsLeft === 0) {
      timer.mode = "focus";
      timer.totalSeconds = MODE_SECONDS.focus;
      timer.secondsLeft = MODE_SECONDS.focus;
    }
    timer.taskId = taskId;
    timer.isRunning = true;
    timer.endsAt = Date.now() + timer.secondsLeft * 1000;
    persist();
    renderTimer();
    showToast("Sessão de foco iniciada para esta tarefa.");
    return true;
  }
  function pauseTimer() {
    var timer = state.timer;
    if (timer.isRunning && timer.endsAt) timer.secondsLeft = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
    timer.isRunning = false;
    timer.endsAt = null;
    persist(false);
    renderTimer();
  }
  function selectTimerMode(mode) {
    if (!MODE_SECONDS[mode]) return;
    if (state.timer.isRunning) pauseTimer();
    state.timer.mode = mode;
    state.timer.totalSeconds = MODE_SECONDS[mode];
    state.timer.secondsLeft = MODE_SECONDS[mode];
    state.timer.endsAt = null;
    persist();
    renderTimer();
  }
  function completeTimer() {
    var timer = state.timer;
    var completedMode = timer.mode;
    var now = new Date().toISOString();
    timer.isRunning = false;
    timer.endsAt = null;
    timer.secondsLeft = 0;
    if (completedMode === "focus") {
      var task = timer.taskId ? taskById(timer.taskId) : null;
      state.sessions.push({ id: makeId(), taskId: task ? task.id : null, taskTitle: task ? task.title : "Foco", mode: "focus", completedAt: now, seconds: MODE_SECONDS.focus });
      if (task) task.pomodoros += 1;
      timer.mode = state.sessions.length % 4 === 0 ? "long" : "short";
      showToast("Pomodoro concluído. Hora de fazer uma pausa.");
    } else {
      timer.mode = "focus";
      showToast("Pausa concluída. Pronto para mais um ciclo?");
    }
    timer.totalSeconds = MODE_SECONDS[timer.mode];
    timer.secondsLeft = MODE_SECONDS[timer.mode];
    persist();
    render();
  }
  function tick() {
    var timer = state.timer;
    if (!timer.isRunning || !timer.endsAt) return;
    var remaining = Math.ceil((timer.endsAt - Date.now()) / 1000);
    if (remaining <= 0) {
      completeTimer();
      return;
    }
    timer.secondsLeft = remaining;
    renderTimer();
  }
  function resetTimer() {
    state.timer.isRunning = false;
    state.timer.endsAt = null;
    state.timer.totalSeconds = MODE_SECONDS[state.timer.mode];
    state.timer.secondsLeft = state.timer.totalSeconds;
    persist();
    renderTimer();
  }
  function saveTask(event) {
    event.preventDefault();
    if (pendingImageLoads) { showToast("Aguarde o fim do processamento das imagens."); return; }
    var saved = commitDraft();
    if (!saved) return;
    closeTaskDialog();
    render();
    showToast("Tarefa salva neste navegador.");
  }
  function deleteTask() {
    if (pendingImageLoads) { showToast("Aguarde o processamento das imagens antes de excluir o cartão."); return; }
    if (!editingId || !window.confirm("Excluir esta tarefa?")) return;
    var removedId = editingId;
    state.tasks = state.tasks.filter(function (task) { return task.id !== removedId; });
    if (state.timer.taskId === removedId) {
      state.timer.isRunning = false;
      state.timer.endsAt = null;
      state.timer.taskId = null;
    }
    closeTaskDialog();
    persist();
    render();
    showToast("Tarefa excluída.");
  }
  function focusFromDialog() {
    var saved = commitDraft();
    if (!saved) return;
    startFocus(saved.id);
  }
  function setFilter(filter) {
    currentFilter = filter;
    renderBoard();
  }
  function exportBackup() {
    var backup = { app: "Ritmo", version: 3, exportedAt: new Date().toISOString(), data: state };
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "ritmo-backup-" + getTodayKey() + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("Backup baixado para o seu computador.");
  }
  function importBackup(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result || ""));
        var imported = parsed.data || parsed;
        if (!Array.isArray(imported.tasks)) throw new Error("Arquivo sem lista de tarefas.");
        var labelCatalog = normalizeLabelCatalog(imported.labels);
        var listCatalog = normalizeLists(imported.lists);
        state = {
          tasks: imported.tasks.map(function (task) { return normalizeTask(task, labelCatalog, listCatalog); }),
          lists: listCatalog,
          labels: labelCatalog,
          sessions: Array.isArray(imported.sessions) ? imported.sessions : [],
          timer: Object.assign({ mode: "focus", totalSeconds: MODE_SECONDS.focus, secondsLeft: MODE_SECONDS.focus, isRunning: false, endsAt: null, taskId: null }, imported.timer || {})
        };
        if (!MODE_SECONDS[state.timer.mode]) state.timer.mode = "focus";
        state.timer.isRunning = false;
        state.timer.endsAt = null;
        state.timer.secondsLeft = Math.min(MODE_SECONDS[state.timer.mode], Math.max(0, Number(state.timer.secondsLeft) || MODE_SECONDS[state.timer.mode]));
        state.timer.totalSeconds = MODE_SECONDS[state.timer.mode];
        persist();
        render();
        showToast("Backup importado.");
      } catch (error) {
        showToast("Não consegui ler esse backup. Escolha um arquivo JSON exportado pelo Ritmo.");
      }
      document.getElementById("import-data").value = "";
    };
    reader.readAsText(file);
  }
  function restoreDemo() {
    if (!window.confirm("Restaurar os cartões de exemplo? Isso substituirá as listas, tarefas, etiquetas e sessões atuais deste navegador.")) return;
    state = createDemoState();
    activeDate = getTodayKey();
    currentFilter = "today";
    persist();
    render();
    showToast("Exemplos restaurados.");
  }
  function focusBoardAndSet(filter) {
    setFilter(filter);
    document.getElementById("board-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function setMobileScreen(screen, filter) {
    document.body.dataset.mobileScreen = screen;
    var title = document.getElementById("mobile-view-title");
    title.textContent = screen === "board" ? "Seus projetos" : "Olá, Bruno";
    document.querySelectorAll("[data-mobile-view]").forEach(function (button) {
      if (button.dataset.mobileView === screen) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (filter) currentFilter = filter;
    else if (screen === "home") { activeDate = getTodayKey(); currentFilter = "today"; }
    else if (screen === "board") currentFilter = "all";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function setPomodoroOpen(open) {
    var panel = document.getElementById("focus-panel");
    var button = document.getElementById("mobile-nav-pomodoro");
    if (open && window.matchMedia("(max-width: 780px)").matches && panel.parentNode !== document.body) document.body.appendChild(panel);
    panel.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("pomodoro-open", open);
    if (open) renderTimer();
    else if (panel.parentNode === document.body && focusPanelReturnAnchor && focusPanelReturnAnchor.parentNode) focusPanelReturnAnchor.parentNode.insertBefore(panel, focusPanelReturnAnchor);
  }
  function bindEvents() {
    bindBoardDrag(document.getElementById("task-board"));
    var focusPanel = document.getElementById("focus-panel");
    if (!focusPanelReturnAnchor) {
      focusPanelReturnAnchor = document.createComment("Pomodoro layout position");
      focusPanel.parentNode.insertBefore(focusPanelReturnAnchor, focusPanel.nextSibling);
    }
    document.getElementById("nav-today").addEventListener("click", function () {
      activeDate = getTodayKey();
      document.querySelectorAll(".nav-link").forEach(function (button) { button.classList.remove("is-active"); });
      this.classList.add("is-active");
      focusBoardAndSet("today");
      renderCalendar();
    });
    document.getElementById("nav-board").addEventListener("click", function () {
      document.querySelectorAll(".nav-link").forEach(function (button) { button.classList.remove("is-active"); });
      this.classList.add("is-active");
      focusBoardAndSet("all");
    });
    document.getElementById("nav-focus").addEventListener("click", function () {
      document.querySelectorAll(".nav-link").forEach(function (button) { button.classList.remove("is-active"); });
      this.classList.add("is-active");
      document.getElementById("focus-panel").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.getElementById("summary-focus").addEventListener("click", function () {
      if (window.matchMedia("(max-width: 780px)").matches) setMobileScreen("board", "today");
      else {
        setFilter("today");
        renderCalendar();
        document.getElementById("board-section").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    document.getElementById("calendar-today").addEventListener("click", function () {
      activeDate = getTodayKey();
      currentFilter = "today";
      render();
    });
    document.getElementById("calendar-strip").addEventListener("click", function (event) {
      var button = event.target.closest("[data-date]");
      if (!button) return;
      activeDate = button.dataset.date;
      currentFilter = "today";
      render();
    });
    document.getElementById("mobile-bottom-nav").addEventListener("click", function (event) {
      if (event.target.closest("[data-calendar-launch]")) { openCalendarDialog(); return; }
      var viewButton = event.target.closest("[data-mobile-view]");
      if (viewButton) { setMobileScreen(viewButton.dataset.mobileView); return; }
      if (event.target.closest("#mobile-nav-pomodoro")) {
        setPomodoroOpen(!document.getElementById("focus-panel").classList.contains("is-open"));
      }
    });
    var homeDayCard = document.getElementById("home-day-card");
    homeDayCard.addEventListener("click", function (event) {
      var step = event.target.closest("[data-day-step]");
      if (step) { shiftActiveDate(Number(step.dataset.dayStep)); return; }
      var taskButton = event.target.closest("[data-open-home-task]");
      if (taskButton) { showTaskDialog(taskButton.dataset.openHomeTask); return; }
      if (event.target.closest("#home-day-open-calendar, #home-calendar-link")) {
        if (Date.now() < suppressCalendarCardClickUntil) { event.preventDefault(); return; }
        openCalendarDialog();
      }
    });
    homeDayCard.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "touch" || event.target.closest(".day-step-button, .home-day-task-list")) return;
      daySwipeStart = { x: event.clientX, y: event.clientY };
    });
    homeDayCard.addEventListener("pointerup", function (event) {
      if (event.pointerType !== "touch" || !daySwipeStart) return;
      var deltaX = event.clientX - daySwipeStart.x;
      var deltaY = event.clientY - daySwipeStart.y;
      daySwipeStart = null;
      if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        suppressCalendarCardClickUntil = Date.now() + 500;
        shiftActiveDate(deltaX < 0 ? 1 : -1);
      }
    });
    homeDayCard.addEventListener("pointercancel", function () { daySwipeStart = null; });
    document.querySelector(".home-progress-card").addEventListener("click", function (event) {
      var periodButton = event.target.closest("[data-progress-period]");
      if (!periodButton) return;
      progressPeriod = periodButton.dataset.progressPeriod;
      renderSummary();
    });
    focusPanel.addEventListener("click", function (event) {
      if (event.target === this) setPomodoroOpen(false);
    });
    document.getElementById("timer-mobile-close").addEventListener("click", function () { setPomodoroOpen(false); });
    var monthCalendarDialog = document.getElementById("month-calendar-dialog");
    monthCalendarDialog.addEventListener("click", function (event) {
      if (event.target === this || event.target.closest("#month-calendar-close")) { closeCalendarDialog(); return; }
      var viewButton = event.target.closest("[data-calendar-view]");
      if (viewButton) { appCalendarView = viewButton.dataset.calendarView; renderAppCalendar(); return; }
      var navigation = event.target.closest("[data-app-calendar-nav]");
      if (navigation) {
        var amount = Number(navigation.dataset.appCalendarNav);
        if (appCalendarView === "day") setActiveCalendarDate(addDays(appCalendarDate, amount));
        else if (appCalendarView === "year") setActiveCalendarDate(new Date(appCalendarMonth.getFullYear() + amount, appCalendarMonth.getMonth(), 1));
        else setActiveCalendarDate(new Date(appCalendarMonth.getFullYear(), appCalendarMonth.getMonth() + amount, 1));
        return;
      }
      if (event.target.closest("#app-calendar-today")) { setActiveCalendarDate(new Date()); return; }
      var calendarDay = event.target.closest("[data-app-calendar-day]");
      if (calendarDay) {
        appCalendarView = "day";
        setActiveCalendarDate(dateFromKey(calendarDay.dataset.appCalendarDay));
        return;
      }
      var yearMonth = event.target.closest("[data-app-calendar-year-month]");
      if (yearMonth) {
        appCalendarView = "month";
        setActiveCalendarDate(new Date(appCalendarMonth.getFullYear(), Number(yearMonth.dataset.appCalendarYearMonth), 1));
        return;
      }
      var taskButton = event.target.closest("[data-calendar-task]");
      if (taskButton) {
        var taskId = taskButton.dataset.calendarTask;
        closeCalendarDialog();
        showTaskDialog(taskId);
      }
    });
    monthCalendarDialog.addEventListener("close", function () {
      var activeScreen = document.body.dataset.mobileScreen || "home";
      document.querySelectorAll("[data-mobile-view]").forEach(function (button) {
        if (button.dataset.mobileView === activeScreen) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      document.getElementById("mobile-nav-calendar").removeAttribute("aria-current");
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && document.getElementById("focus-panel").classList.contains("is-open")) setPomodoroOpen(false);
    });
    document.querySelector(".board-filters").addEventListener("click", function (event) {
      var button = event.target.closest("[data-filter]");
      if (button) setFilter(button.dataset.filter);
    });
    var taskBoard = document.getElementById("task-board");
    taskBoard.addEventListener("click", function (event) {
      if (Date.now() < suppressCardClickUntil) { event.preventDefault(); return; }
      var startList = event.target.closest("[data-start-new-list]");
      if (startList) {
        var listForm = taskBoard.querySelector("[data-new-list-form]");
        listForm.hidden = false;
        startList.hidden = true;
        taskBoard.querySelector("#new-list-name").focus();
        return;
      }
      if (event.target.closest("[data-create-list]")) { createBoardList(); return; }
      if (event.target.closest("[data-cancel-new-list]")) { renderBoard(); return; }
      var closeMenu = event.target.closest("[data-close-list-menu]");
      if (closeMenu) { closeListMenus(); return; }
      var listMenuButton = event.target.closest("[data-list-menu]");
      if (listMenuButton) {
        var menu = Array.from(taskBoard.querySelectorAll(".list-menu-popover")).find(function (item) { return item.dataset.menuFor === listMenuButton.dataset.listMenu; });
        var open = menu && menu.hidden;
        closeListMenus();
        if (menu) menu.hidden = !open;
        return;
      }
      var submenuAction = event.target.closest("[data-list-action]");
      if (submenuAction && ["move-list", "move-cards", "sort-list"].includes(submenuAction.dataset.listAction)) {
        var parentMenu = submenuAction.closest(".list-menu-popover");
        var submenu = parentMenu && parentMenu.querySelector('[data-submenu="' + submenuAction.dataset.listAction + '"]');
        if (submenu) submenu.hidden = !submenu.hidden;
        return;
      }
      var confirmPosition = event.target.closest("[data-confirm-list-position]");
      if (confirmPosition) {
        var positionMenu = confirmPosition.closest(".list-menu-popover");
        var positionSelect = positionMenu && positionMenu.querySelector("[data-list-position]");
        if (positionSelect) moveListToPosition(confirmPosition.dataset.confirmListPosition, positionSelect.value);
        return;
      }
      var moveCardsButton = event.target.closest("[data-move-cards-to]");
      if (moveCardsButton) { moveAllCards(moveCardsButton.dataset.sourceList, moveCardsButton.dataset.moveCardsTo); return; }
      var sortButton = event.target.closest("[data-sort-list]");
      if (sortButton) { sortList(sortButton.dataset.listId, sortButton.dataset.sortList); return; }
      var listAction = event.target.closest("[data-list-action]");
      if (listAction) {
        var listId = listAction.dataset.listId;
        if (listAction.dataset.listAction === "add-card") { closeListMenus(); showTaskDialog(null, listId); return; }
        if (listAction.dataset.listAction === "copy-list") { closeListMenus(); copyList(listId); return; }
        if (listAction.dataset.listAction === "delete-list") { closeListMenus(); openDeleteConfirmation("list", listId); return; }
        if (listAction.dataset.listAction === "delete-cards") { closeListMenus(); openDeleteConfirmation("cards", listId); return; }
      }
      if (!event.target.closest(".column-menu-wrap")) closeListMenus();
      var expandChecklist = event.target.closest("[data-expand-card]");
      if (expandChecklist) {
        event.stopPropagation();
        var taskIdToExpand = expandChecklist.dataset.expandCard;
        if (expandedChecklistCards.has(taskIdToExpand)) expandedChecklistCards.delete(taskIdToExpand);
        else expandedChecklistCards.add(taskIdToExpand);
        renderBoard();
        return;
      }
      if (event.target.closest("[data-board-checklist]")) { event.stopPropagation(); return; }
      var addCardButton = event.target.closest("[data-add-card]");
      if (addCardButton) { showTaskDialog(null, addCardButton.dataset.addCard); return; }
      var focusButton = event.target.closest("[data-focus-task]");
      if (focusButton) {
        event.stopPropagation();
        var focusId = focusButton.dataset.focusTask;
        if (startFocus(focusId)) showTaskDialog(focusId);
        return;
      }
      var card = event.target.closest("[data-task-id]");
      if (card) showTaskDialog(card.dataset.taskId);
    });
    taskBoard.addEventListener("change", function (event) {
      var checkbox = event.target.closest("[data-board-checklist]");
      if (!checkbox) return;
      var task = taskById(checkbox.dataset.boardChecklist);
      var group = task && task.checklists[Number(checkbox.dataset.checklistIndex)];
      var item = group && group.items[Number(checkbox.dataset.itemIndex)];
      if (!item) return;
      item.done = checkbox.checked;
      persist();
      renderBoard();
    });
    taskBoard.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && event.target.id === "new-list-name") { event.preventDefault(); createBoardList(); return; }
      var card = event.target.closest("[data-task-id]");
      if (card && event.target === card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        showTaskDialog(card.dataset.taskId);
      }
    });
    document.querySelector(".timer-modes").addEventListener("click", function (event) {
      var button = event.target.closest("[data-mode]");
      if (button) selectTimerMode(button.dataset.mode);
    });
    document.getElementById("timer-toggle").addEventListener("click", function () {
      if (state.timer.isRunning) {
        pauseTimer();
        showToast("Timer pausado.");
        return;
      }
      if (state.timer.mode === "focus" && !state.timer.taskId) {
        showToast("Abra um cartão e escolha “Focar nesta tarefa”.");
        return;
      }
      state.timer.isRunning = true;
      state.timer.endsAt = Date.now() + state.timer.secondsLeft * 1000;
      persist();
      renderTimer();
    });
    document.getElementById("timer-reset").addEventListener("click", resetTimer);
    var taskForm = document.getElementById("task-form");
    taskForm.addEventListener("submit", saveTask);
    taskForm.addEventListener("click", function (event) {
      var action = event.target.closest("[data-card-action]");
      if (action) { toggleCardPopover(action.dataset.cardAction); return; }
      if (event.target.closest("[data-close-popover]")) {
        document.querySelectorAll(".action-popover").forEach(function (popover) { popover.hidden = true; });
        return;
      }
      if (event.target.closest("[data-create-label]")) { createLabel(); return; }
      if (event.target.closest("[data-create-checklist]")) { createChecklistFromPopover(); return; }
      var monthButton = event.target.closest("[data-calendar-month]");
      if (monthButton) {
        taskCalendarMonth = new Date(taskCalendarMonth.getFullYear(), taskCalendarMonth.getMonth() + Number(monthButton.dataset.calendarMonth), 1);
        renderTaskCalendar();
        return;
      }
      var calendarDay = event.target.closest("[data-calendar-day]");
      if (calendarDay && draftTask) {
        draftTask.dueDate = calendarDay.dataset.calendarDay;
        document.getElementById("task-due").value = draftTask.dueDate;
        document.getElementById("task-due").disabled = false;
        document.getElementById("due-date-enabled").checked = true;
        renderTaskCalendar();
        renderCardMeta();
        return;
      }
      if (event.target.closest("[data-save-dates]")) {
        updateDraftFromFields();
        document.getElementById("dates-popover").hidden = true;
        return;
      }
      if (event.target.closest("[data-clear-date]")) {
        document.getElementById("task-due").value = "";
        document.getElementById("task-due").disabled = true;
        document.getElementById("due-date-enabled").checked = false;
        document.getElementById("task-start").value = "";
        document.getElementById("task-start").disabled = true;
        document.getElementById("start-date-enabled").checked = false;
        document.getElementById("task-due-time").value = "";
        document.getElementById("task-recurring").value = "none";
        document.getElementById("task-reminder").value = "none";
        draftTask.startDate = "";
        draftTask.dueDate = "";
        draftTask.dueTime = "";
        draftTask.recurring = "none";
        draftTask.reminder = "none";
        renderCardMeta();
        renderTaskCalendar();
        document.getElementById("dates-popover").hidden = true;
        return;
      }
      if (event.target.closest("#attach-image-button")) { document.getElementById("attachment-input").click(); return; }
      var removeAttachment = event.target.closest("[data-remove-attachment]");
      if (removeAttachment && draftTask) {
        draftTask.attachments.splice(Number(removeAttachment.dataset.removeAttachment), 1);
        renderAttachments();
      }
    });
    taskForm.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      if (event.target.id === "checklist-title") { event.preventDefault(); createChecklistFromPopover(); }
      else if (event.target.id === "new-label-name") { event.preventDefault(); createLabel(); }
      else if (event.target.matches("[data-checklist-input]")) { event.preventDefault(); addChecklistItem(event.target.dataset.checklistInput); }
      else if (["label-search", "task-due", "task-start", "task-due-time"].includes(event.target.id)) event.preventDefault();
    });
    taskForm.addEventListener("change", function (event) {
      if (event.target.id === "task-due" && draftTask) { draftTask.dueDate = event.target.value; document.getElementById("due-date-enabled").checked = Boolean(event.target.value); renderTaskCalendar(); renderCardMeta(); }
      if (event.target.id === "task-start" && draftTask) draftTask.startDate = event.target.value;
      if (event.target.id === "start-date-enabled" && draftTask) {
        var startInput = document.getElementById("task-start");
        startInput.disabled = !event.target.checked;
        if (!event.target.checked) startInput.value = "";
        else if (!startInput.value) startInput.value = getTodayKey();
        draftTask.startDate = event.target.checked ? startInput.value : "";
      }
      if (event.target.id === "due-date-enabled" && draftTask) {
        var dueInput = document.getElementById("task-due");
        dueInput.disabled = !event.target.checked;
        if (!event.target.checked) dueInput.value = "";
        else if (!dueInput.value) dueInput.value = getTodayKey();
        draftTask.dueDate = event.target.checked ? dueInput.value : "";
        renderTaskCalendar();
        renderCardMeta();
      }
      if (event.target.id === "task-due-time" && draftTask) draftTask.dueTime = event.target.value;
      if (event.target.id === "task-recurring" && draftTask) draftTask.recurring = event.target.value;
      if (event.target.id === "task-reminder" && draftTask) draftTask.reminder = event.target.value;
      if (event.target.id === "task-status" && draftTask) draftTask.status = event.target.value;
    });
    document.getElementById("label-search").addEventListener("input", renderLabelOptions);
    taskForm.addEventListener("dragover", function (event) {
      if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")) {
        event.preventDefault();
        taskForm.classList.add("is-file-hover");
      }
    });
    taskForm.addEventListener("dragleave", function (event) {
      if (!taskForm.contains(event.relatedTarget)) taskForm.classList.remove("is-file-hover");
    });
    taskForm.addEventListener("drop", function (event) {
      taskForm.classList.remove("is-file-hover");
      if (!event.dataTransfer || !event.dataTransfer.files.length) return;
      event.preventDefault();
      addImageFiles(event.dataTransfer.files);
    });
    document.getElementById("task-dialog").addEventListener("paste", function (event) {
      var items = Array.from(event.clipboardData && event.clipboardData.items || []);
      var images = items.filter(function (item) { return item.type && item.type.indexOf("image/") === 0; }).map(function (item) { return item.getAsFile(); }).filter(Boolean);
      if (images.length) { event.preventDefault(); addImageFiles(images); }
    });
    document.getElementById("label-options").addEventListener("change", function (event) {
      var toggle = event.target.closest("[data-label-toggle]");
      if (!toggle || !draftTask) return;
      var labelId = toggle.dataset.labelToggle;
      if (toggle.checked && !draftTask.labels.includes(labelId)) draftTask.labels.push(labelId);
      if (!toggle.checked) draftTask.labels = draftTask.labels.filter(function (id) { return id !== labelId; });
      renderLabelOptions();
    });
    document.getElementById("checklist-groups").addEventListener("click", function (event) {
      var addButton = event.target.closest("[data-add-checklist-item]");
      if (addButton) { addChecklistItem(addButton.dataset.addChecklistItem); return; }
      var removeItem = event.target.closest("[data-remove-checklist-item]");
      if (removeItem && draftTask) {
        var group = draftTask.checklists[Number(removeItem.dataset.removeChecklistItem)];
        if (group) group.items.splice(Number(removeItem.dataset.itemIndex), 1);
        renderChecklists();
        return;
      }
      var removeList = event.target.closest("[data-remove-checklist]");
      if (removeList && draftTask) {
        draftTask.checklists.splice(Number(removeList.dataset.removeChecklist), 1);
        renderChecklists();
      }
    });
    document.getElementById("checklist-groups").addEventListener("change", function (event) {
      var checkbox = event.target.closest("[data-checklist-index][data-item-index]");
      if (!checkbox || !draftTask) return;
      var group = draftTask.checklists[Number(checkbox.dataset.checklistIndex)];
      var item = group && group.items[Number(checkbox.dataset.itemIndex)];
      if (item) item.done = checkbox.checked;
      renderChecklists();
    });
    document.getElementById("attachment-input").addEventListener("change", function () { addImageFiles(this.files); this.value = ""; });
    document.getElementById("add-comment").addEventListener("click", addComment);
    document.getElementById("comment-input").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); addComment(); }
    });
    document.getElementById("dialog-close").addEventListener("click", closeTaskDialog);
    document.getElementById("dialog-cancel").addEventListener("click", closeTaskDialog);
    document.getElementById("delete-task").addEventListener("click", deleteTask);
    document.getElementById("dialog-focus").addEventListener("click", focusFromDialog);
    document.getElementById("task-dialog").addEventListener("click", function (event) {
      if (event.target === this) closeTaskDialog();
      else if (!event.target.closest(".action-menu-wrap") && !event.target.closest("[data-card-action]")) document.querySelectorAll(".action-popover").forEach(function (popover) { popover.hidden = true; });
    });
    document.getElementById("task-dialog").addEventListener("cancel", function (event) {
      if (pendingImageLoads) { event.preventDefault(); showToast("Aguarde o processamento das imagens antes de fechar o cartão."); }
    });
    document.getElementById("task-dialog").addEventListener("close", function () {
      draftTask = null;
      editingId = null;
    });
    document.getElementById("delete-confirm-yes").addEventListener("click", confirmPendingDeletion);
    document.getElementById("delete-confirm-no").addEventListener("click", function () {
      pendingDeletion = null;
      document.getElementById("delete-confirm-dialog").close();
    });
    document.getElementById("delete-confirm-close").addEventListener("click", function () {
      pendingDeletion = null;
      document.getElementById("delete-confirm-dialog").close();
    });
    document.getElementById("delete-confirm-dialog").addEventListener("close", function () { pendingDeletion = null; });
    document.getElementById("undo-delete-button").addEventListener("click", undoPendingDeletion);
    var undoToast = document.getElementById("undo-toast");
    undoToast.addEventListener("pointerdown", function (event) { undoTouchStartY = event.pointerType === "touch" ? event.clientY : null; });
    undoToast.addEventListener("pointerup", function (event) {
      if (undoTouchStartY !== null && event.clientY - undoTouchStartY > 42) hideUndoToast();
      undoTouchStartY = null;
    });
    undoToast.addEventListener("pointercancel", function () { undoTouchStartY = null; });
    document.getElementById("export-data").addEventListener("click", exportBackup);
    document.getElementById("import-data").addEventListener("change", function () { importBackup(this.files && this.files[0]); });
    document.getElementById("restore-demo").addEventListener("click", restoreDemo);
    document.getElementById("profile-button").addEventListener("click", function () {
      showToast("Suas tarefas ficam guardadas neste navegador.");
    });
  }
  state = loadState();
  if (state.timer.isRunning && state.timer.endsAt) {
    var remainingOnLoad = Math.ceil((state.timer.endsAt - Date.now()) / 1000);
    if (remainingOnLoad <= 0) {
      state.timer.secondsLeft = 0;
      completeTimer();
    } else {
      state.timer.secondsLeft = remainingOnLoad;
    }
  }
  bindEvents();
  render();
  persist(false);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js").catch(function () {});
    });
  }
  window.setInterval(tick, 1000);
  window.addEventListener("focus", tick);
})(); 
