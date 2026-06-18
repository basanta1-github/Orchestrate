const API_BASE = window.location.origin;

const JOB_TEMPLATES = {
  image_resize: {
    fileUrl: "https://picsum.photos/800/600",
    width: 400,
    height: 300,
    format: "jpeg",
    filters: ["grayscale"],
  },
  video_transcode: {
    fileUrl: "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
    format: "mp4",
  },
  audio_transcode: {
    fileUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    format: "mp3",
  },
  "report-jobs": {
    title: "Monthly Report",
    generatedBy: "Orchestrate Dashboard",
    data: [{ metric: "uptime", value: "99.9%" }],
  },
  "ml-jobs": {
    taskType: "text_summarization",
    input:
      "Orchestrate is a distributed job queue system built with NestJS, BullMQ, Redis, and PostgreSQL.",
  },
  "email-jobs": {
    recipients: ["pokhrelb246@gmail.com"],
    subject: "Orchestrate Demo",
    content: "Hello from the Orchestrate email worker!",
  },
  "etl-jobs": {
    source: "users_table",
    transformType: "uppercase_name",
    target: "processed_users_table",
  },
};

let token = localStorage.getItem("orchestrate_token");
let user = JSON.parse(localStorage.getItem("orchestrate_user") || "null");
let refreshTimer = null;

const $ = (sel) => document.querySelector(sel);

function show(el) {
  el.classList.remove("hidden");
}
function hide(el) {
  el.classList.add("hidden");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lastErrorFromJob(job) {
  const attempts = job?.attempts || [];
  if (job?.status === "FAILED") {
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (attempts[i]?.errorMessage) return attempts[i].errorMessage;
    }
  } else if (attempts.length > 0) {
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt?.errorMessage) return lastAttempt.errorMessage;
  }
  const logs = job?.logs || [];
  for (let i = logs.length - 1; i >= 0; i--) {
    if (/error|fail/i.test(logs[i]?.message || "")) {
      return logs[i].message;
    }
  }
  return "";
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (res.status === 401) {
    clearAuth();
    showAuth();
    throw new Error("Session expired — please sign in again");
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      (typeof data === "string" ? data : res.statusText);
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }

  return data;
}

function setAuth(t, u) {
  token = t;
  user = u;
  localStorage.setItem("orchestrate_token", t);
  localStorage.setItem("orchestrate_user", JSON.stringify(u));
}

function clearAuth() {
  token = null;
  user = null;
  localStorage.removeItem("orchestrate_token");
  localStorage.removeItem("orchestrate_user");
}

function showDashboard() {
  hide($("#auth-screen"));
  show($("#dashboard-screen"));
  $("#tenant-badge").textContent = user?.tenant?.name || user?.tenantName || "";
  $("#user-label").textContent = user?.email || "";
  loadMetrics();
  loadJobs();
  startAutoRefresh();
}

function showAuth() {
  show($("#auth-screen"));
  hide($("#dashboard-screen"));
  stopAutoRefresh();
}

function setRefreshing(on) {
  const el = $("#refresh-indicator");
  if (on) show(el);
  else hide(el);
}

// Show Grafana link only on localhost demo
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  show($("#grafana-link"));
}

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    hide($("#login-form"));
    hide($("#register-form"));
    show($(`#${tab.dataset.tab}-form`));
    hide($("#auth-error"));
  });
});

// Login
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hide($("#auth-error"));
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        tenantName: $("#login-tenant").value.trim(),
        email: $("#login-email").value.trim(),
        password: $("#login-password").value,
      }),
    });
    setAuth(data.accessToken, {
      ...data.user,
      tenant: { name: $("#login-tenant").value.trim() },
    });
    showDashboard();
  } catch (err) {
    show($("#auth-error"));
    $("#auth-error").textContent = err.message;
  }
});

// Register
$("#register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hide($("#auth-error"));
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("#reg-name").value.trim(),
        tenantName: $("#reg-tenant").value.trim(),
        email: $("#reg-email").value.trim(),
        password: $("#reg-password").value,
      }),
    });
    setAuth(data.accessToken, {
      ...data.user,
      tenant: { name: $("#reg-tenant").value.trim() },
    });
    showDashboard();
  } catch (err) {
    show($("#auth-error"));
    $("#auth-error").textContent = err.message;
  }
});

$("#logout-btn").addEventListener("click", () => {
  clearAuth();
  showAuth();
});

// Job type template
$("#job-type").addEventListener("change", () => {
  const type = $("#job-type").value;
  $("#job-metadata").value = JSON.stringify(JOB_TEMPLATES[type] || {}, null, 2);
});
$("#job-type").dispatchEvent(new Event("change"));

// Submit job
$("#job-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#submit-msg");
  hide(msg);

  try {
    const metadata = JSON.parse($("#job-metadata").value);
    const body = {
      jobType: $("#job-type").value,
      metadata,
      priorityLevel: $("#job-priority").value,
    };

    const delay = $("#job-delay").value;
    const retries = $("#job-retries").value;
    if (delay) body.delayMs = parseInt(delay, 10);
    if (retries) body.retries = parseInt(retries, 10);

    const result = await api("/jobs", {
      method: "POST",
      body: JSON.stringify(body),
    });
    msg.textContent = `Job enqueued: ${result.job?.id || result.jobId || "OK"}`;
    msg.className = "submit-msg success";
    show(msg);
    loadJobs();
    loadMetrics();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "submit-msg error";
    show(msg);
  }
});

async function loadMetrics() {
  try {
    const [queues, workers] = await Promise.all([
      api("/metrics/queues?fresh=true"),
      api("/metrics/workers"),
    ]);

    const container = $("#queue-snapshot");
    container.innerHTML = "";
    let totalDepth = 0;

    for (const [name, q] of Object.entries(queues.queues || {})) {
      const depth =
        (q.waiting || 0) +
        (q.active || 0) +
        (q.delayed || 0) +
        (q.prioritized || 0);
      totalDepth += depth;
      const el = document.createElement("div");
      el.className = "queue-item";
      el.innerHTML = `
        <h4>${escapeHtml(name)}</h4>
        <div class="queue-stats">
          <span>Waiting: <b>${q.waiting ?? 0}</b></span>
          <span>Active: <b>${q.active ?? 0}</b></span>
          <span>Delayed: <b>${q.delayed ?? 0}</b></span>
          <span>DLQ: <b>${q.dlq ?? 0}</b></span>
        </div>`;
      container.appendChild(el);
    }

    if (!container.children.length) {
      container.innerHTML = '<p class="muted">No queue data yet.</p>';
    }

    $("#m-queue-depth").textContent = totalDepth;

    const workerSnap = workers.workers || {};
    let totalWorkers = 0;
    for (const w of Object.values(workerSnap)) {
      totalWorkers += w.count ?? w.active ?? 0;
    }
    $("#m-workers").textContent =
      totalWorkers || Object.keys(workerSnap).length;
  } catch {
    $("#m-queue-depth").textContent = "—";
    $("#m-workers").textContent = "—";
  }
}

async function loadJobs() {
  setRefreshing(true);
  try {
    const status = $("#filter-status").value;
    const query = status ? `?status=${status}` : "";
    const data = await api(`/jobs${query}`);
    const jobs = Array.isArray(data) ? data : data.jobs || data.data || [];

    const tbody = $("#jobs-body");
    tbody.innerHTML = "";

    if (!jobs.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No jobs yet — submit one above.</td></tr>`;
    }

    let failed = 0;
    jobs.forEach((job) => {
      if (job.status === "FAILED") failed++;
      const lastError = lastErrorFromJob(job);
      const tr = document.createElement("tr");
      if (job.status === "FAILED") tr.classList.add("row-failed");

      tr.innerHTML = `
        <td title="${escapeHtml(job.id)}">${escapeHtml((job.id || "").slice(0, 8))}…</td>
        <td>${escapeHtml(job.type || job.jobType || "—")}</td>
        <td><span class="status status-${escapeHtml(job.status)}">${escapeHtml(job.status)}</span></td>
        <td>${escapeHtml(job.priority || job.priorityLevel || "—")}</td>
        <td>${job.retries ?? job.attempts?.length ?? 0}</td>
        <td class="error-cell" title="${escapeHtml(lastError)}">${lastError ? escapeHtml(lastError.slice(0, 60)) + (lastError.length > 60 ? "…" : "") : "—"}</td>
        <td>${job.timestamps?.createdAt || job.createdAt ? new Date(job.timestamps?.createdAt || job.createdAt).toLocaleString() : "—"}</td>
        <td><button class="btn-link" data-id="${escapeHtml(job.id)}" type="button">View</button></td>`;
      tbody.appendChild(tr);
    });

    $("#m-my-jobs").textContent = jobs.length;
    $("#m-failed").textContent = failed;

    tbody.querySelectorAll(".btn-link").forEach((btn) => {
      btn.addEventListener("click", () => viewJob(btn.dataset.id));
    });
  } catch (err) {
    console.error("loadJobs", err);
  } finally {
    setRefreshing(false);
  }
}

function renderJobDetail(job) {
  const lastError = lastErrorFromJob(job);
  const logs = (job.logs || []).slice(-10);
  const attempts = job.attempts || [];

  const logsHtml = logs.length
    ? logs
        .map(
          (l) =>
            `<li><time>${new Date(l.createdAt).toLocaleString()}</time> ${escapeHtml(l.message)}</li>`,
        )
        .join("")
    : '<li class="muted">No log lines returned (API may need logs join).</li>';

  const attemptsHtml = attempts.length
    ? attempts
        .map(
          (a) => `
        <div class="attempt-item ${a.status === "FAILED" ? "attempt-failed" : ""}">
          <strong>#${a.attemptNumber}</strong> ${escapeHtml(a.status)}
          ${a.errorMessage ? `<pre class="error-snippet">${escapeHtml(a.errorMessage)}</pre>` : ""}
        </div>`,
        )
        .join("")
    : '<p class="muted">No attempts recorded yet.</p>';

  return `
    <div class="detail-grid">
      <div><span class="detail-label">ID</span><code>${escapeHtml(job.id)}</code></div>
      <div><span class="detail-label">Type</span>${escapeHtml(job.type)}</div>
      <div><span class="detail-label">Status</span><span class="status status-${escapeHtml(job.status)}">${escapeHtml(job.status)}</span></div>
      <div><span class="detail-label">Priority</span>${escapeHtml(job.priority || "—")}</div>
    </div>

    ${lastError ? `<section class="detail-section"><h4>Last Error</h4><pre class="error-snippet">${escapeHtml(lastError)}</pre></section>` : ""}

    <section class="detail-section">
      <h4>Attempts</h4>
      ${attemptsHtml}
    </section>

    <section class="detail-section">
      <h4>Recent Logs</h4>
      <ul class="log-list">${logsHtml}</ul>
    </section>

    <details class="detail-section">
      <summary>Raw JSON</summary>
      <pre class="raw-json">${escapeHtml(JSON.stringify(job, null, 2))}</pre>
    </details>
  `;
}

async function viewJob(id) {
  try {
    const job = await api(`/jobs/${id}`);
    $("#job-detail-body").innerHTML = renderJobDetail(job);
    show($("#job-modal"));
  } catch (err) {
    alert(err.message);
  }
}

$("#modal-close").addEventListener("click", () => hide($("#job-modal")));
$("#job-modal").addEventListener("click", (e) => {
  if (e.target === $("#job-modal")) hide($("#job-modal"));
});

$("#refresh-metrics").addEventListener("click", loadMetrics);
$("#refresh-jobs").addEventListener("click", loadJobs);
$("#filter-status").addEventListener("change", loadJobs);

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if ($("#auto-refresh").checked) {
      loadJobs();
      loadMetrics();
    }
  }, 5000);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
}

$("#auto-refresh").addEventListener("change", () => {
  if ($("#auto-refresh").checked) startAutoRefresh();
  else stopAutoRefresh();
});

// Init
if (token && user) {
  showDashboard();
} else {
  showAuth();
}
