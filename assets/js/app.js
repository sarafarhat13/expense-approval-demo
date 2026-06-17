/* ================================================================
 * Traqspera Expense Approval — front-end app
 *
 * Behavior summary (matches the brainstormed spec):
 *   - Pending row  → Approve (green) + Decline (red) buttons
 *   - Approved row → Decline button only (lets admin reverse)
 *   - Declined row → Approve button only (lets admin reverse)
 *   - Approve     → instant action + bottom-end toast with 5s "Undo"
 *   - Decline     → modal asking for a reason (>= 10 chars), then toast w/ Undo
 *   - Status chip → click to see audit popover (who, when, reason)
 *
 * Backend: ./api/expenses.php if available, otherwise localStorage demo store.
 * ================================================================ */

const STORAGE_KEY = "tq.expenses.v2";
const SEED_URL = "./assets/data/expenses.json";
const API_URL = "./api/expenses.php";
const CURRENT_USER = "Sara Farhat"; // demo "logged-in" user

// Clean up state from previous schema versions so old visitors don't get
// stuck on outdated seed data after a deploy.
(function purgeOldStorage() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("tq.expenses.") && k !== STORAGE_KEY)
      .forEach((k) => localStorage.removeItem(k));
  } catch (_) {
    /* localStorage unavailable — ignore */
  }
})();

// Tracks the live undo state so a second action invalidates the previous undo.
let pendingUndo = null;

/* -----------------------------------------------------------------
 * Storage / API adapter
 *  - Tries the PHP API first; if it doesn't respond (e.g. on GitHub
 *    Pages), falls back to a localStorage-backed simulator.
 * --------------------------------------------------------------- */
const store = (() => {
  let mode = "local"; // "local" | "api"

  async function detect() {
    try {
      const res = await fetch(API_URL + "?ping=1", {
        method: "GET",
        cache: "no-store",
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          mode = "api";
          return;
        }
      }
    } catch (_) {
      /* ignore — fall back to local mode */
    }
    mode = "local";
  }

  async function loadSeed() {
    const res = await fetch(SEED_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load seed expenses.");
    return res.json();
  }

  function readLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function writeLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  async function list() {
    if (mode === "api") {
      const res = await fetch(API_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load expenses from API.");
      return res.json();
    }
    let data = readLocal();
    if (!data) {
      data = await loadSeed();
      writeLocal(data);
    }
    return data;
  }

  async function update(id, patch) {
    if (mode === "api") {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error("Failed to update expense.");
      return res.json();
    }
    const data = readLocal() || (await loadSeed());
    const idx = data.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error("Expense not found: " + id);
    data[idx] = { ...data[idx], ...patch };
    writeLocal(data);
    return data[idx];
  }

  async function reset() {
    if (mode === "api") {
      await fetch(API_URL + "?reset=1", { method: "POST" });
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    detect,
    list,
    update,
    reset,
    getMode: () => mode,
  };
})();

/* -----------------------------------------------------------------
 * Rendering
 * --------------------------------------------------------------- */
const state = {
  expenses: [],
  search: "",
  category: "",
  status: "all",
};

const STATUS_CLASS = {
  Pending: "status-chip--pending",
  Approved: "status-chip--approved",
  Declined: "status-chip--declined",
};

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(n) {
  return "$ " + Number(n).toLocaleString();
}

function applyFilters(rows) {
  const q = state.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (state.status !== "all" && r.status !== state.status) return false;
    if (state.category && !r.category.includes(state.category)) return false;
    if (!q) return true;
    return (
      r.employee.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      (r.report || "").toLowerCase().includes(q)
    );
  });
}

function renderRow(row) {
  const showApprove = row.status !== "Approved";
  const showDecline = row.status !== "Declined";

  const actions = `
    <div class="row-actions">
      ${
        showApprove
          ? `<button class="action-btn action-btn--approve" data-action="approve" data-id="${row.id}" aria-label="Approve ${escapeHtml(row.id)}">
              <i class="modus-icons" aria-hidden="true">check</i>
            </button>`
          : ""
      }
      ${
        showDecline
          ? `<button class="action-btn action-btn--decline" data-action="decline" data-id="${row.id}" aria-label="Decline ${escapeHtml(row.id)}">
              <i class="modus-icons" aria-hidden="true">close</i>
            </button>`
          : ""
      }
    </div>
  `;

  return `
    <tr data-id="${row.id}">
      <td>
        <span class="employee">
          <span class="employee__avatar" style="background:${row.employee.color}">
            ${escapeHtml(row.employee.initials)}
          </span>
          ${escapeHtml(row.employee.name)}
        </span>
      </td>
      <td>${escapeHtml(row.description)}</td>
      <td>${formatDate(row.submitDate)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.department)}</td>
      <td>${escapeHtml(row.jobAndPhase)}</td>
      <td>${formatMoney(row.total)}</td>
      <td>${row.report ? escapeHtml(row.report) : "None"}</td>
      <td class="status-cell">
        <button
          class="status-chip ${STATUS_CLASS[row.status]}"
          data-status-chip="${row.id}"
          aria-label="${row.status} — view details"
          type="button"
        >${row.status}</button>
      </td>
      <td>
        <span class="receipts">
          <i class="modus-icons" aria-hidden="true">file</i>
          ${row.receipts}
        </span>
      </td>
      <td>${actions}</td>
    </tr>
  `;
}

function renderTable() {
  const tbody = document.getElementById("expense-rows");
  const filtered = applyFilters(state.expenses);
  tbody.innerHTML = filtered.map(renderRow).join("");

  document.getElementById("empty-state").hidden = filtered.length > 0;
  document.getElementById("row-count").textContent =
    `${filtered.length} of ${state.expenses.length} expenses`;

  // Update status pill counts
  const counts = state.expenses.reduce(
    (acc, e) => {
      acc.all += 1;
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    },
    { all: 0, Pending: 0, Approved: 0, Declined: 0 }
  );
  document
    .querySelectorAll("[data-count]")
    .forEach((el) => (el.textContent = counts[el.dataset.count] || 0));
}

/* -----------------------------------------------------------------
 * Approve / Decline actions
 * --------------------------------------------------------------- */
async function approveExpense(id) {
  const idx = state.expenses.findIndex((e) => e.id === id);
  if (idx === -1) return;

  const previous = structuredClone(state.expenses[idx]);
  const entry = {
    action: "approved",
    by: CURRENT_USER,
    at: new Date().toISOString(),
    reason: null,
  };
  const updated = {
    ...previous,
    status: "Approved",
    audit: [...previous.audit, entry],
  };

  state.expenses[idx] = updated;
  renderTable();

  try {
    await store.update(id, { status: "Approved", audit: updated.audit });
  } catch (err) {
    state.expenses[idx] = previous;
    renderTable();
    showToast({ text: "Couldn't save change. Please retry.", level: "error" });
    return;
  }

  showToast({
    text: `Expense ${id} approved.`,
    level: "success",
    undo: async () => {
      state.expenses[idx] = previous;
      renderTable();
      try {
        await store.update(id, {
          status: previous.status,
          audit: previous.audit,
        });
      } catch (err) {
        showToast({
          text: "Couldn't undo. Please retry.",
          level: "error",
        });
      }
    },
  });
}

async function declineExpense(id, reason) {
  const idx = state.expenses.findIndex((e) => e.id === id);
  if (idx === -1) return;

  const previous = structuredClone(state.expenses[idx]);
  const entry = {
    action: "declined",
    by: CURRENT_USER,
    at: new Date().toISOString(),
    reason,
  };
  const updated = {
    ...previous,
    status: "Declined",
    audit: [...previous.audit, entry],
  };

  state.expenses[idx] = updated;
  renderTable();

  try {
    await store.update(id, {
      status: "Declined",
      audit: updated.audit,
    });
  } catch (err) {
    state.expenses[idx] = previous;
    renderTable();
    showToast({ text: "Couldn't save change. Please retry.", level: "error" });
    return;
  }

  showToast({
    text: `Expense ${id} declined.`,
    level: "success",
    undo: async () => {
      state.expenses[idx] = previous;
      renderTable();
      try {
        await store.update(id, {
          status: previous.status,
          audit: previous.audit,
        });
      } catch (err) {
        showToast({
          text: "Couldn't undo. Please retry.",
          level: "error",
        });
      }
    },
  });
}

/* -----------------------------------------------------------------
 * Decline modal
 * --------------------------------------------------------------- */
const declineModal = (() => {
  const modalEl = () => document.querySelector('modus-wc-modal[modal-id="decline-modal"]');
  // Modus 1.8 renders the <dialog> in the modal's *light* DOM, not shadow DOM.
  const dialog = () =>
    modalEl()?.querySelector("dialog") ||
    modalEl()?.shadowRoot?.querySelector("dialog");
  const reasonField = () => document.getElementById("decline-reason");
  const confirmBtn = () => document.getElementById("decline-confirm");
  const cancelBtn = () => document.getElementById("decline-cancel");
  const summaryEl = () => document.getElementById("decline-modal-summary");

  let activeId = null;

  function open(id) {
    activeId = id;
    const row = state.expenses.find((e) => e.id === id);
    summaryEl().textContent = row
      ? `Declining ${row.id} — ${row.description} ($${row.total}) for ${row.employee.name}.`
      : "You are declining this expense.";
    reasonField().value = "";
    confirmBtn().disabled = true;
    dialog()?.showModal();
    requestAnimationFrame(() => {
      reasonField().focus?.();
    });
  }

  function close() {
    dialog()?.close();
    activeId = null;
  }

  function onReasonInput(e) {
    const value = (e.detail?.target?.value ?? e.target?.value ?? "").trim();
    confirmBtn().disabled = value.length < 10;
  }

  async function onConfirm() {
    const reason = reasonField().value.trim();
    if (reason.length < 10 || !activeId) return;
    const id = activeId;
    close();
    await declineExpense(id, reason);
  }

  function init() {
    cancelBtn().addEventListener("buttonClick", close);
    cancelBtn().addEventListener("click", close);
    confirmBtn().addEventListener("buttonClick", onConfirm);
    confirmBtn().addEventListener("click", onConfirm);
    reasonField().addEventListener("inputChange", onReasonInput);
    reasonField().addEventListener("input", onReasonInput);
  }

  return { open, close, init };
})();

/* -----------------------------------------------------------------
 * Undo toast
 * --------------------------------------------------------------- */
function showToast({ text, level = "success", undo, durationMs = 5000 }) {
  // Cancel any prior pending undo so we don't leak it.
  if (pendingUndo?.timeout) clearTimeout(pendingUndo.timeout);
  pendingUndo = null;

  const toast = document.getElementById("toast");
  const textEl = document.getElementById("toast-text");
  const iconEl = document.getElementById("toast-icon");
  const undoBtn = document.getElementById("toast-undo");

  textEl.textContent = text;
  iconEl.classList.remove("is-success", "is-error");
  iconEl.classList.add(level === "error" ? "is-error" : "is-success");
  iconEl.textContent = level === "error" ? "alert" : "check_circle";
  undoBtn.style.display = undo ? "" : "none";
  toast.hidden = false;

  const dismiss = () => {
    toast.hidden = true;
    pendingUndo = null;
  };

  const timeout = setTimeout(dismiss, durationMs);
  pendingUndo = { timeout, undo };

  const onUndo = async () => {
    clearTimeout(timeout);
    dismiss();
    if (undo) await undo();
  };

  // Replace listeners every time so the latest undo handler is bound.
  undoBtn.replaceWith(undoBtn.cloneNode(true));
  const newUndoBtn = document.getElementById("toast-undo");
  newUndoBtn.addEventListener("buttonClick", onUndo);
  newUndoBtn.addEventListener("click", onUndo);
}

/* -----------------------------------------------------------------
 * Audit popover (status chip → tooltip)
 * --------------------------------------------------------------- */
const auditPopover = (() => {
  const el = () => document.getElementById("audit-popover");
  let openFor = null;

  function show(rowId, anchor) {
    const row = state.expenses.find((e) => e.id === rowId);
    if (!row) return;
    const popover = el();

    document.getElementById("audit-status").textContent = row.status;

    const lastAudit = [...row.audit]
      .reverse()
      .find((a) => a.action === row.status.toLowerCase());

    document.getElementById("audit-by").textContent = lastAudit
      ? lastAudit.by
      : row.status === "Pending"
        ? "Awaiting review"
        : "—";
    document.getElementById("audit-when").textContent = lastAudit
      ? formatDateTime(lastAudit.at)
      : row.status === "Pending"
        ? `Submitted ${formatDate(row.submitDate)}`
        : "—";

    const reasonRow = document.getElementById("audit-reason-row");
    if (row.status === "Declined" && lastAudit?.reason) {
      reasonRow.hidden = false;
      document.getElementById("audit-reason").textContent = lastAudit.reason;
    } else {
      reasonRow.hidden = true;
    }

    popover.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;

    // Keep within viewport horizontally
    const overflow = left + popRect.width - (window.scrollX + window.innerWidth - 8);
    if (overflow > 0) left -= overflow;

    popover.style.top = top + "px";
    popover.style.left = left + "px";

    openFor = rowId;
  }

  function hide() {
    el().hidden = true;
    openFor = null;
  }

  function toggle(rowId, anchor) {
    if (openFor === rowId) hide();
    else show(rowId, anchor);
  }

  return { show, hide, toggle };
})();

/* -----------------------------------------------------------------
 * Event wiring
 * --------------------------------------------------------------- */
function wireEvents() {
  // Action buttons + status chip clicks (event-delegated on tbody)
  document.getElementById("expense-rows").addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (actionBtn) {
      const id = actionBtn.dataset.id;
      const action = actionBtn.dataset.action;
      if (action === "approve") approveExpense(id);
      else if (action === "decline") declineModal.open(id);
      return;
    }

    const chip = e.target.closest("[data-status-chip]");
    if (chip) {
      e.stopPropagation();
      auditPopover.toggle(chip.dataset.statusChip, chip);
    }
  });

  // Hide audit popover on outside click / scroll / escape
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-status-chip]") &&
        !e.target.closest("#audit-popover")) {
      auditPopover.hide();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") auditPopover.hide();
  });
  window.addEventListener("scroll", () => auditPopover.hide(), true);

  // Search input
  document.getElementById("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderTable();
  });

  // Category filter
  document.getElementById("category-filter").addEventListener("change", (e) => {
    state.category = e.target.value;
    renderTable();
  });

  // Status pills
  document.querySelectorAll(".status-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document
        .querySelectorAll(".status-pill")
        .forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      pill.setAttribute("aria-selected", "true");
      state.status = pill.dataset.status;
      renderTable();
    });
  });

  // Reset demo
  document.getElementById("reset-demo").addEventListener("click", async () => {
    await store.reset();
    await load();
    showToast({ text: "Demo data reset.", level: "success" });
  });
}

/* -----------------------------------------------------------------
 * Bootstrap
 * --------------------------------------------------------------- */
async function load() {
  state.expenses = await store.list();
  renderTable();
}

async function init() {
  await store.detect();
  declineModal.init();
  wireEvents();
  await load();

  // Surface backend mode on the reset button as a small affordance
  const mode = store.getMode();
  const resetBtn = document.getElementById("reset-demo");
  resetBtn.title =
    mode === "api"
      ? "Reset demo data (PHP backend)"
      : "Reset demo data (localStorage demo — no PHP backend reachable)";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
