const API_BASE = localStorage.getItem("rv5_api_base") || "http://localhost:4000";
const AUTH_STORAGE_KEY = "rv5_auth_v2";
const FALLBACK_PHOTO =
  "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=400&auto=format&fit=crop";
const parseStoredAuth = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
};
const state = {
  workers: [],
  jobs: [],
  myJobs: [],
  notifications: [],
  users: [],
  workerFilters: { trade: "", city: "" },
  jobFilters: { city: "", status: "" },
  auth: parseStoredAuth()
};
const nodes = {
  apiBaseLabel: document.getElementById("apiBaseLabel"),
  sessionChip: document.getElementById("sessionChip"),
  logoutBtn: document.getElementById("logoutBtn"),
  statWorkers: document.getElementById("statWorkers"),
  statJobs: document.getElementById("statJobs"),
  statTrust: document.getElementById("statTrust"),
  statCities: document.getElementById("statCities"),
  trustFill: document.getElementById("trustFill"),
  trustHint: document.getElementById("trustHint"),
  workersList: document.getElementById("workersList"),
  jobsList: document.getElementById("jobsList"),
  myJobsList: document.getElementById("myJobsList"),
  notificationList: document.getElementById("notificationList"),
  usersTableBody: document.getElementById("usersTableBody"),
  workerCardTemplate: document.getElementById("workerCardTemplate"),
  jobCardTemplate: document.getElementById("jobCardTemplate"),
  myJobCardTemplate: document.getElementById("myJobCardTemplate"),
  notificationItemTemplate: document.getElementById("notificationItemTemplate"),
  adminUserRowTemplate: document.getElementById("adminUserRowTemplate"),
  workerDialog: document.getElementById("workerDialog"),
  jobDialog: document.getElementById("jobDialog"),
  assignDialog: document.getElementById("assignDialog"),
  assignForm: document.getElementById("assignForm"),
  assignWorkerSelect: document.getElementById("assignWorkerSelect"),
  assignJobInfo: document.getElementById("assignJobInfo"),
  unassignBtn: document.getElementById("unassignBtn"),
  toastRoot: document.getElementById("toastRoot"),
  workerCrudForm: document.getElementById("workerCrudForm"),
  jobCrudForm: document.getElementById("jobCrudForm"),
  workerDialogTitle: document.getElementById("workerDialogTitle"),
  jobDialogTitle: document.getElementById("jobDialogTitle")
};

if (nodes.apiBaseLabel) nodes.apiBaseLabel.textContent = API_BASE;

const toArray = (value) =>
  (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const isLoggedIn = () => Boolean(state.auth?.token && state.auth?.user);
const getRole = () => (state.auth?.user?.role ? String(state.auth.user.role) : "");
const isAdmin = () => getRole() === "admin";
const isWorker = () => getRole() === "worker";

const persistAuth = () => {
  if (!state.auth) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state.auth));
};

const setStatus = (id, message, data = null) => {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = data ? `${message}\n\n${JSON.stringify(data, null, 2)}` : message;
};

const showToast = (message, type = "info") => {
  if (!nodes.toastRoot) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  nodes.toastRoot.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 20);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const setAuth = (authPayload) => {
  state.auth = authPayload;
  persistAuth();
  renderSessionChip();
  applyRoleVisibility();
};

const clearAuth = (reason = "Logged out") => {
  state.auth = null;
  persistAuth();
  renderSessionChip();
  applyRoleVisibility();
  renderLoggedOutPlaceholders(reason);
};

const toJson = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error || payload.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
};

const request = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (state.auth?.token) {
    headers.Authorization = `Bearer ${state.auth.token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    return await toJson(response);
  } catch (error) {
    if (error.status === 401 && !path.startsWith("/api/auth/login")) {
      clearAuth("Session expired. Please login again.");
      setStatus("loginStatus", "Session expired. Please login again.");
      showToast("Session expired. Please login.", "warn");
    }
    throw error;
  }
};

const addCardMotion = (card) => {
  if (!card) return;
  card.addEventListener("mousemove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rx = ((y / rect.height) - 0.5) * -6;
    const ry = ((x / rect.width) - 0.5) * 6;
    card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
  });
  card.addEventListener("mouseleave", () => {
    card.style.transform = "";
  });
};

const isAllowedByRole = (rule) => {
  if (!rule) return true;
  if (rule === "auth") return isLoggedIn();
  if (rule === "admin") return isAdmin();
  if (rule === "worker") return isWorker();
  if (rule === "recruiter") return getRole() === "recruiter";
  return true;
};

const showView = (viewId) => {
  const target = document.getElementById(viewId);
  if (!target || target.classList.contains("hidden")) return;

  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  target.classList.add("active");
  document.querySelector(`.tab[data-target="${viewId}"]`)?.classList.add("active");
};

const applyRoleVisibility = () => {
  document.querySelectorAll("[data-role]").forEach((el) => {
    const roleRule = el.getAttribute("data-role");
    const allowed = isAllowedByRole(roleRule);
    el.classList.toggle("hidden", !allowed);
  });

  const active = document.querySelector(".view.active");
  if (active && active.classList.contains("hidden")) {
    showView(isLoggedIn() ? "dashboard" : "login");
  }
};

const renderSessionChip = () => {
  if (!nodes.sessionChip || !nodes.logoutBtn) return;
  if (!isLoggedIn()) {
    nodes.sessionChip.textContent = "Not logged in";
    nodes.logoutBtn.classList.add("hidden");
    return;
  }
  const user = state.auth.user;
  nodes.sessionChip.textContent = `${user.role.toUpperCase()} | ${user.identifier}`;
  nodes.logoutBtn.classList.remove("hidden");
};

const updateStats = () => {
  if (!nodes.statWorkers || !nodes.statJobs || !nodes.statTrust || !nodes.statCities) return;

  nodes.statWorkers.textContent = String(state.workers.length);
  nodes.statJobs.textContent = String(state.jobs.filter((j) => j.status === "open").length);

  const trustScores = state.workers.map((w) => Number(w.trust_score || 0));
  const avgTrust = trustScores.length
    ? Math.round(trustScores.reduce((a, b) => a + b, 0) / trustScores.length)
    : 0;
  nodes.statTrust.textContent = String(avgTrust);

  const cities = new Set([
    ...state.workers.map((w) => w.city).filter(Boolean),
    ...state.jobs.map((j) => j.city).filter(Boolean)
  ]);
  nodes.statCities.textContent = String(cities.size);

  if (nodes.trustFill) nodes.trustFill.style.width = `${avgTrust}%`;
  if (nodes.trustHint) {
    nodes.trustHint.textContent =
      avgTrust >= 80
        ? "Strong trust ecosystem: worker reliability and verification indicators are high."
        : avgTrust >= 60
        ? "Good baseline trust. More verifications and repeat clients can improve ranking."
        : "Trust network is early stage. Focus onboarding and verification campaigns.";
  }
};

const renderWorkers = () => {
  if (!nodes.workersList) return;
  nodes.workersList.innerHTML = "";

  if (!state.workers.length) {
    nodes.workersList.innerHTML = `<article class="entity-card"><p>No workers found.</p></article>`;
    return;
  }

  state.workers.forEach((worker) => {
    const fragment = nodes.workerCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".entity-card");
    const photo = fragment.querySelector(".worker-photo");

    fragment.querySelector(".name").textContent = worker.name || "-";
    fragment.querySelector(".trust").textContent = `Trust ${worker.trust_score ?? 0}`;
    fragment.querySelector(".meta").textContent = `${worker.trade || "Unknown"} | ${worker.city || "Unknown city"} | ${worker.worker_code || "No code"}`;
    fragment.querySelector(".contact").textContent = `Phone: ${worker.contact_phone || "-"} | Email: ${worker.contact_email || "-"} | Login ID: ${worker.worker_login_id || "Not set"}`;
    fragment.querySelector(".summary").textContent =
      worker.summary || `Experience: ${worker.years_experience || 0} years | Jobs: ${worker.jobs_completed || 0}`;

    if (photo) {
      photo.src = worker.photo_url || FALLBACK_PHOTO;
      photo.onerror = () => {
        photo.src = FALLBACK_PHOTO;
      };
    }

    const badgesWrap = fragment.querySelector(".badges");
    const badges = Array.isArray(worker.badges) ? worker.badges : [];
    badges.forEach((badge) => {
      const chip = document.createElement("span");
      chip.className = "badge-chip";
      chip.textContent = badge;
      badgesWrap.appendChild(chip);
    });

    const actions = fragment.querySelector(".entity-actions");
    if (!isAdmin()) {
      actions?.remove();
    } else {
      fragment.querySelector(".edit")?.addEventListener("click", () => openWorkerDialog(worker));
      fragment.querySelector(".delete")?.addEventListener("click", async () => {
        const ok = confirm(`Delete worker ${worker.name}?`);
        if (!ok) return;
        try {
          await request(`/api/workers/${worker.id}`, { method: "DELETE" });
          await refreshWorkers();
          showToast("Worker deleted", "ok");
        } catch (error) {
          alert(error.message);
        }
      });
    }

    addCardMotion(card);
    nodes.workersList.appendChild(fragment);
  });
};

const renderJobs = () => {
  if (!nodes.jobsList) return;
  nodes.jobsList.innerHTML = "";
  if (!state.jobs.length) {
    nodes.jobsList.innerHTML = `<article class="entity-card"><p>No jobs found.</p></article>`;
    return;
  }

  state.jobs.forEach((job) => {
    const fragment = nodes.jobCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".entity-card");

    fragment.querySelector(".name").textContent = job.title || "-";
    const statusNode = fragment.querySelector(".status");
    statusNode.textContent = job.status || "open";
    statusNode.dataset.status = job.status || "open";
    fragment.querySelector(".meta").textContent = `${job.required_trade || "General"} | ${job.city || "-"}`;
    fragment.querySelector(".summary").textContent = `${job.description || "No description"} | Budget: ${job.budget} | Assigned: ${job.assigned_worker_name || "Unassigned"}`;

    const actions = fragment.querySelector(".entity-actions");
    if (!isAdmin()) {
      actions?.remove();
    } else {
      fragment.querySelector(".assign")?.addEventListener("click", async () => {
        try {
          await openAssignDialog(job);
        } catch (error) {
          alert(error.message);
        }
      });

      fragment.querySelector(".edit")?.addEventListener("click", () => openJobDialog(job));
      fragment.querySelector(".delete")?.addEventListener("click", async () => {
        const ok = confirm(`Delete job: ${job.title}?`);
        if (!ok) return;
        try {
          await request(`/api/jobs/${job.id}`, { method: "DELETE" });
          await refreshJobs();
          showToast("Job deleted", "ok");
        } catch (error) {
          alert(error.message);
        }
      });
    }

    addCardMotion(card);
    nodes.jobsList.appendChild(fragment);
  });
};

const renderMyJobs = () => {
  if (!nodes.myJobsList) return;
  nodes.myJobsList.innerHTML = "";

  if (!state.myJobs.length) {
    nodes.myJobsList.innerHTML = `<article class="entity-card"><p>No assigned jobs right now.</p></article>`;
    return;
  }

  state.myJobs.forEach((job) => {
    const fragment = nodes.myJobCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".entity-card");
    const statusNode = fragment.querySelector(".status");

    fragment.querySelector(".name").textContent = job.title || "-";
    statusNode.textContent = job.status || "-";
    statusNode.dataset.status = job.status || "open";
    fragment.querySelector(".meta").textContent = `${job.required_trade || "General"} | ${job.city || "-"}`;
    fragment.querySelector(".summary").textContent = `Budget: ${job.budget} | Recruiter: ${job.recruiter_company || "-"} | ${job.description || "No description"}`;

    addCardMotion(card);
    nodes.myJobsList.appendChild(fragment);
  });
};

const renderNotifications = () => {
  if (!nodes.notificationList) return;
  nodes.notificationList.innerHTML = "";

  if (!state.notifications.length) {
    nodes.notificationList.innerHTML = `<article class="entity-card"><p>No notifications yet.</p></article>`;
    return;
  }

  state.notifications.forEach((notice) => {
    const fragment = nodes.notificationItemTemplate.content.cloneNode(true);
    fragment.querySelector(".notice-title").textContent = notice.title || "Notification";
    const levelNode = fragment.querySelector(".notice-level");
    levelNode.textContent = String(notice.level || "info").toUpperCase();
    levelNode.dataset.level = notice.level || "info";
    fragment.querySelector(".notice-message").textContent = notice.message || "";
    fragment.querySelector(".notice-meta").textContent = `${formatDateTime(notice.created_at)} | Target: ${notice.target_role || "user"}`;
    nodes.notificationList.appendChild(fragment);
  });
};

const renderUsers = () => {
  if (!nodes.usersTableBody) return;
  nodes.usersTableBody.innerHTML = "";

  if (!state.users.length) {
    nodes.usersTableBody.innerHTML = `<tr><td colspan="4">No users found.</td></tr>`;
    return;
  }

  state.users.forEach((user) => {
    const fragment = nodes.adminUserRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector("tr");
    row.dataset.userId = user.id;

    fragment.querySelector(".u-identifier").textContent = user.identifier;
    fragment.querySelector(".u-role").textContent = user.role;
    const mapped = user.role === "worker"
      ? `${user.worker_name || "-"} (${user.worker_phone || "-"})`
      : user.role === "recruiter"
      ? user.recruiter_company || "-"
      : "System Admin";
    fragment.querySelector(".u-mapped").textContent = mapped;

    nodes.usersTableBody.appendChild(fragment);
  });
};

const renderLoggedOutPlaceholders = (reason = "Login required") => {
  state.workers = [];
  state.jobs = [];
  state.myJobs = [];
  state.notifications = [];
  state.users = [];
  updateStats();

  if (nodes.workersList) {
    nodes.workersList.innerHTML = `<article class="entity-card"><p>${reason}. Please login.</p></article>`;
  }
  if (nodes.jobsList) {
    nodes.jobsList.innerHTML = `<article class="entity-card"><p>${reason}. Please login.</p></article>`;
  }
  if (nodes.myJobsList) {
    nodes.myJobsList.innerHTML = `<article class="entity-card"><p>Login as worker to view assigned jobs.</p></article>`;
  }
  if (nodes.notificationList) {
    nodes.notificationList.innerHTML = `<article class="entity-card"><p>${reason}. Notifications will appear after login.</p></article>`;
  }
  if (nodes.usersTableBody) {
    nodes.usersTableBody.innerHTML = `<tr><td colspan="4">Admin login required.</td></tr>`;
  }
  if (nodes.trustHint) {
    nodes.trustHint.textContent = "Login to load worker trust graph...";
  }
  setStatus("myJobsStatus", "Login as worker to see assigned work.");
};

const buildWorkerQuery = () => {
  const params = new URLSearchParams();
  if (state.workerFilters.trade) params.set("trade", state.workerFilters.trade);
  if (state.workerFilters.city) params.set("city", state.workerFilters.city);
  const q = params.toString();
  return q ? `?${q}` : "";
};

const buildJobQuery = () => {
  const params = new URLSearchParams();
  if (state.jobFilters.city) params.set("city", state.jobFilters.city);
  if (state.jobFilters.status) params.set("status", state.jobFilters.status);
  const q = params.toString();
  return q ? `?${q}` : "";
};

const refreshWorkers = async () => {
  if (!isLoggedIn()) return;
  state.workers = await request(`/api/workers${buildWorkerQuery()}`);
  renderWorkers();
  updateStats();
};

const refreshJobs = async () => {
  if (!isLoggedIn()) return;
  state.jobs = await request(`/api/jobs${buildJobQuery()}`);
  renderJobs();
  updateStats();
};

const refreshMyJobs = async () => {
  if (!isWorker()) return;
  state.myJobs = await request("/api/workers/me/jobs");
  renderMyJobs();
  setStatus("myJobsStatus", `Loaded ${state.myJobs.length} assigned job(s).`);
};

const refreshNotifications = async () => {
  if (!isLoggedIn()) return;
  state.notifications = await request("/api/notifications");
  renderNotifications();
};

const refreshUsers = async () => {
  if (!isAdmin()) return;
  state.users = await request("/api/admin/users");
  renderUsers();
};

const refreshAll = async () => {
  if (!isLoggedIn()) {
    renderLoggedOutPlaceholders();
    return;
  }

  const tasks = [refreshWorkers(), refreshJobs(), refreshNotifications()];
  if (isWorker()) tasks.push(refreshMyJobs());
  if (isAdmin()) tasks.push(refreshUsers());

  try {
    await Promise.all(tasks);
  } catch (error) {
    showToast(error.message, "warn");
  }
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });

const getPhotoValue = async (formData) => {
  const file = formData.get("photo_file");
  if (file && typeof file === "object" && file.size > 0) {
    return await readFileAsDataUrl(file);
  }
  return String(formData.get("photo_url") || "").trim();
};

const openWorkerDialog = (worker = null) => {
  if (!nodes.workerCrudForm || !nodes.workerDialog) return;
  nodes.workerCrudForm.reset();

  if (worker) {
    nodes.workerDialogTitle.textContent = "Edit Worker";
    nodes.workerCrudForm.id.value = worker.id || "";
    nodes.workerCrudForm.name.value = worker.name || "";
    nodes.workerCrudForm.worker_code.value = worker.worker_code || "";
    nodes.workerCrudForm.trade.value = worker.trade || "";
    nodes.workerCrudForm.city.value = worker.city || "";
    nodes.workerCrudForm.contact_phone.value = worker.contact_phone || "";
    nodes.workerCrudForm.contact_email.value = worker.contact_email || "";
    nodes.workerCrudForm.photo_url.value = worker.photo_url || "";
    nodes.workerCrudForm.languages.value = (worker.languages || []).join(",");
    nodes.workerCrudForm.trust_score.value = worker.trust_score ?? 60;
    nodes.workerCrudForm.jobs_completed.value = worker.jobs_completed ?? 0;
    nodes.workerCrudForm.years_experience.value = worker.years_experience ?? 0;
    nodes.workerCrudForm.summary.value = worker.summary || "";
    nodes.workerCrudForm.badges.value = (worker.badges || []).join(",");
    nodes.workerCrudForm.worker_identifier.value = worker.worker_login_id || "";
    nodes.workerCrudForm.worker_password.value = "";
  } else {
    nodes.workerDialogTitle.textContent = "Create Worker";
    nodes.workerCrudForm.id.value = "";
  }

  nodes.workerDialog.showModal();
};

const openJobDialog = (job = null) => {
  if (!nodes.jobCrudForm || !nodes.jobDialog) return;
  nodes.jobCrudForm.reset();

  if (job) {
    nodes.jobDialogTitle.textContent = "Edit Job";
    nodes.jobCrudForm.id.value = job.id || "";
    nodes.jobCrudForm.assigned_worker_id.value = job.assigned_worker_id || "";
    nodes.jobCrudForm.title.value = job.title || "";
    nodes.jobCrudForm.city.value = job.city || "";
    nodes.jobCrudForm.required_trade.value = job.required_trade || "";
    nodes.jobCrudForm.budget.value = job.budget ?? 0;
    nodes.jobCrudForm.status.value = job.status || "open";
    nodes.jobCrudForm.description.value = job.description || "";
    nodes.jobCrudForm.recruiter_id.value = job.recruiter_id || "";
  } else {
    nodes.jobDialogTitle.textContent = "Create Job";
    nodes.jobCrudForm.id.value = "";
    nodes.jobCrudForm.assigned_worker_id.value = "";
  }

  nodes.jobDialog.showModal();
};

const openAssignDialog = async (job) => {
  if (!isAdmin()) return;
  const allWorkers = await request("/api/workers");
  if (!allWorkers.length) {
    showToast("No workers found. Create worker profiles first.", "warn");
    return;
  }

  nodes.assignForm.reset();
  nodes.assignForm.job_id.value = job.id;
  nodes.assignJobInfo.textContent = `${job.title} | ${job.city} | ${job.required_trade}`;

  nodes.assignWorkerSelect.innerHTML = "";
  allWorkers.forEach((worker) => {
    const opt = document.createElement("option");
    opt.value = worker.id;
    opt.textContent = `${worker.name} (${worker.trade} - ${worker.city})`;
    nodes.assignWorkerSelect.appendChild(opt);
  });

  if (job.assigned_worker_id) {
    nodes.assignWorkerSelect.value = job.assigned_worker_id;
  }

  nodes.assignDialog.showModal();
};

const initNavigation = () => {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("hidden")) return;
      showView(btn.dataset.target);
    });
  });

  document.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.jump;
      if (!target) return;
      showView(target);
    });
  });

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.close)?.close();
    });
  });
};

const initEvents = () => {
  initNavigation();

  document.getElementById("refreshAllBtn")?.addEventListener("click", refreshAll);
  document.getElementById("refreshMyJobsBtn")?.addEventListener("click", () => refreshMyJobs().catch((error) => showToast(error.message, "warn")));
  document.getElementById("refreshNotificationsBtn")?.addEventListener("click", () => refreshNotifications().catch((error) => showToast(error.message, "warn")));
  document.getElementById("refreshUsersBtn")?.addEventListener("click", () => refreshUsers().catch((error) => showToast(error.message, "warn")));

  nodes.logoutBtn?.addEventListener("click", async () => {
    try {
      if (isLoggedIn()) {
        await request("/api/auth/logout", { method: "POST" });
      }
    } catch {
      // Ignore logout API failures and clear client session.
    } finally {
      clearAuth("Logged out.");
      setStatus("loginStatus", "Logged out");
      showView("login");
    }
  });

  document.getElementById("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      const payload = {
        role: String(fd.get("role") || "").trim(),
        identifier: String(fd.get("identifier") || "").trim(),
        password: String(fd.get("password") || "")
      };
      const result = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setAuth(result);
      setStatus("loginStatus", "Login success", result.user);
      showToast("Login successful", "ok");
      showView("dashboard");
      await refreshAll();
    } catch (error) {
      setStatus("loginStatus", `Login failed: ${error.message}`);
    }
  });

  document.getElementById("forgotForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      const result = await request("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identifier: String(fd.get("identifier") || "").trim() })
      });
      setStatus("forgotStatus", "Reset code generated", result);
      showToast("Reset code generated. Check status box and notifications.", "ok");
    } catch (error) {
      setStatus("forgotStatus", `Failed: ${error.message}`);
    }
  });

  document.getElementById("resetPasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      const result = await request("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          identifier: String(fd.get("identifier") || "").trim(),
          reset_code: String(fd.get("reset_code") || "").trim(),
          new_password: String(fd.get("new_password") || "")
        })
      });
      setStatus("resetStatus", result.message || "Password reset successful");
      if (form && typeof form.reset === "function") form.reset();
      showToast("Password reset successful", "ok");
    } catch (error) {
      setStatus("resetStatus", `Failed: ${error.message}`);
    }
  });

  document.getElementById("workerOnboardForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
      showToast("Only admin can onboard workers.", "warn");
      return;
    }
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      const payload = {
        name: String(fd.get("name") || "").trim(),
        worker_code: String(fd.get("worker_code") || "").trim() || null,
        trade: String(fd.get("trade") || "").trim(),
        city: String(fd.get("city") || "").trim(),
        contact_phone: String(fd.get("contact_phone") || "").trim(),
        contact_email: String(fd.get("contact_email") || "").trim(),
        photo_url: await getPhotoValue(fd),
        worker_identifier: String(fd.get("worker_identifier") || "").trim() || null,
        worker_password: String(fd.get("worker_password") || "").trim() || null,
        languages: toArray(fd.get("languages")),
        years_experience: Number(fd.get("years_experience") || 0),
        summary: String(fd.get("summary") || "").trim(),
        badges: toArray(fd.get("badges"))
      };

      const hasIdentifier = Boolean(payload.worker_identifier);
      const hasPassword = Boolean(payload.worker_password);
      if ((hasIdentifier && !hasPassword) || (!hasIdentifier && hasPassword)) {
        setStatus("workerOnboardStatus", "Provide both Worker Login ID and Worker Login Password together.");
        return;
      }

      const result = await request("/api/onboarding/worker", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setStatus("workerOnboardStatus", "Worker onboarding complete", result);
      if (form && typeof form.reset === "function") form.reset();
      await refreshWorkers();
      await refreshUsers();
      showToast("Worker profile created", "ok");
    } catch (error) {
      setStatus("workerOnboardStatus", `Worker onboarding failed: ${error.message}`);
    }
  });

  document.getElementById("recruiterOnboardForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
      showToast("Only admin can onboard recruiters.", "warn");
      return;
    }
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      const payload = {
        company_name: String(fd.get("company_name") || "").trim(),
        contact_name: String(fd.get("contact_name") || "").trim(),
        city: String(fd.get("city") || "").trim(),
        verified: fd.get("verified") === "true"
      };
      const result = await request("/api/onboarding/recruiter", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setStatus("recruiterOnboardStatus", "Recruiter onboarding complete", result);
      if (form && typeof form.reset === "function") form.reset();
      await refreshUsers();
      showToast("Recruiter account created", "ok");
    } catch (error) {
      setStatus("recruiterOnboardStatus", `Recruiter onboarding failed: ${error.message}`);
    }
  });

  document.getElementById("workerFilterForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    state.workerFilters.trade = String(fd.get("trade") || "").trim();
    state.workerFilters.city = String(fd.get("city") || "").trim();
    await refreshWorkers();
  });

  document.getElementById("jobFilterForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    state.jobFilters.city = String(fd.get("city") || "").trim();
    state.jobFilters.status = String(fd.get("status") || "").trim();
    await refreshJobs();
  });

  document.getElementById("workerClearFilterBtn")?.addEventListener("click", async () => {
    state.workerFilters = { trade: "", city: "" };
    document.getElementById("workerFilterForm")?.reset();
    await refreshWorkers();
  });

  document.getElementById("jobClearFilterBtn")?.addEventListener("click", async () => {
    state.jobFilters = { city: "", status: "" };
    document.getElementById("jobFilterForm")?.reset();
    await refreshJobs();
  });

  document.getElementById("createWorkerBtn")?.addEventListener("click", () => {
    if (!isAdmin()) {
      showToast("Only admin can create workers.", "warn");
      return;
    }
    openWorkerDialog(null);
  });

  document.getElementById("createJobBtn")?.addEventListener("click", () => {
    if (!isAdmin()) {
      showToast("Only admin can create jobs.", "warn");
      return;
    }
    openJobDialog(null);
  });

  nodes.assignForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) return;

    const fd = new FormData(event.currentTarget);
    const jobId = String(fd.get("job_id") || "").trim();
    const workerId = String(fd.get("worker_id") || "").trim();
    if (!jobId || !workerId) return;

    try {
      await request(`/api/jobs/${jobId}/assign`, {
        method: "POST",
        body: JSON.stringify({ worker_id: workerId })
      });
      nodes.assignDialog.close();
      await refreshJobs();
      await refreshNotifications();
      showToast("Worker assigned to job", "ok");
    } catch (error) {
      showToast(error.message, "warn");
    }
  });

  nodes.unassignBtn?.addEventListener("click", async () => {
    if (!isAdmin()) return;
    const jobId = String(nodes.assignForm?.job_id?.value || "").trim();
    if (!jobId) return;

    try {
      await request(`/api/jobs/${jobId}/unassign`, { method: "POST" });
      nodes.assignDialog.close();
      await refreshJobs();
      await refreshNotifications();
      showToast("Job unassigned", "ok");
    } catch (error) {
      showToast(error.message, "warn");
    }
  });

  nodes.workerCrudForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
      showToast("Only admin can update workers.", "warn");
      return;
    }
    const form = event.currentTarget;
    const fd = new FormData(form);
    const id = String(fd.get("id") || "").trim();

    const payload = {
      name: String(fd.get("name") || "").trim(),
      worker_code: String(fd.get("worker_code") || "").trim() || null,
      trade: String(fd.get("trade") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      contact_phone: String(fd.get("contact_phone") || "").trim(),
      contact_email: String(fd.get("contact_email") || "").trim(),
      photo_url: await getPhotoValue(fd),
      worker_identifier: String(fd.get("worker_identifier") || "").trim() || null,
      worker_password: String(fd.get("worker_password") || "").trim() || null,
      languages: toArray(fd.get("languages")),
      trust_score: Number(fd.get("trust_score") || 0),
      jobs_completed: Number(fd.get("jobs_completed") || 0),
      years_experience: Number(fd.get("years_experience") || 0),
      summary: String(fd.get("summary") || "").trim(),
      badges: toArray(fd.get("badges"))
    };

    const hasIdentifier = Boolean(payload.worker_identifier);
    const hasPassword = Boolean(payload.worker_password);
    if ((hasIdentifier && !hasPassword) || (!hasIdentifier && hasPassword)) {
      alert("Provide both Worker Login ID and Worker Login Password together.");
      return;
    }

    try {
      if (id) {
        await request(`/api/workers/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await request("/api/workers", { method: "POST", body: JSON.stringify(payload) });
      }
      nodes.workerDialog.close();
      await refreshWorkers();
      await refreshUsers();
      showToast(id ? "Worker updated" : "Worker created", "ok");
    } catch (error) {
      alert(error.message);
    }
  });

  nodes.jobCrudForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
      showToast("Only admin can update jobs.", "warn");
      return;
    }
    const fd = new FormData(event.currentTarget);
    const id = String(fd.get("id") || "").trim();
    const payload = {
      title: String(fd.get("title") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      required_trade: String(fd.get("required_trade") || "").trim(),
      budget: Number(fd.get("budget") || 0),
      status: String(fd.get("status") || "open").trim(),
      description: String(fd.get("description") || "").trim(),
      recruiter_id: String(fd.get("recruiter_id") || "").trim() || null,
      assigned_worker_id: String(fd.get("assigned_worker_id") || "").trim() || null
    };

    try {
      if (id) {
        await request(`/api/jobs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await request("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
      }
      nodes.jobDialog.close();
      await refreshJobs();
      showToast(id ? "Job updated" : "Job created", "ok");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("broadcastForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
      showToast("Only admin can broadcast notifications.", "warn");
      return;
    }
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      const payload = {
        title: String(fd.get("title") || "").trim(),
        message: String(fd.get("message") || "").trim(),
        target_role: String(fd.get("target_role") || "all").trim(),
        level: String(fd.get("level") || "info").trim()
      };
      const result = await request("/api/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setStatus("broadcastStatus", result.message || "Notification sent");
      if (form && typeof form.reset === "function") form.reset();
      await refreshNotifications();
      showToast("Broadcast sent", "ok");
    } catch (error) {
      setStatus("broadcastStatus", `Failed: ${error.message}`);
    }
  });

  document.getElementById("adminResetForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
      showToast("Only admin can reset passwords.", "warn");
      return;
    }
    const form = event.currentTarget;
    const fd = new FormData(form);
    const userId = String(fd.get("user_id") || "").trim();
    const newPassword = String(fd.get("new_password") || "");
    try {
      const result = await request(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: newPassword })
      });
      setStatus("adminResetStatus", "Password reset successful", result);
      if (form && typeof form.reset === "function") form.reset();
      await refreshNotifications();
      showToast("Password reset completed", "ok");
    } catch (error) {
      setStatus("adminResetStatus", `Failed: ${error.message}`);
    }
  });

  nodes.usersTableBody?.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const row = target.closest("tr");
    const userId = row?.dataset?.userId;
    if (!userId) return;

    if (target.classList.contains("use-id")) {
      const resetForm = document.getElementById("adminResetForm");
      if (resetForm?.user_id) {
        resetForm.user_id.value = userId;
        showToast("User ID copied to reset form", "ok");
      }
      return;
    }

    if (target.classList.contains("reset-user")) {
      const newPassword = prompt("Enter new password (min 6 chars):");
      if (!newPassword) return;
      try {
        const result = await request(`/api/admin/users/${userId}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ new_password: newPassword })
        });
        setStatus("adminResetStatus", "Password reset successful", result);
        await refreshNotifications();
        showToast("Password reset completed", "ok");
      } catch (error) {
        setStatus("adminResetStatus", `Failed: ${error.message}`);
      }
    }
  });
};

const boot = async () => {
  renderSessionChip();
  applyRoleVisibility();
  initEvents();

  if (!isLoggedIn()) {
    renderLoggedOutPlaceholders();
    showView("login");
    return;
  }

  try {
    const me = await request("/api/auth/me");
    state.auth.user = me;
    persistAuth();
    renderSessionChip();
    applyRoleVisibility();
    setStatus("loginStatus", "Session restored", me);
    await refreshAll();
  } catch {
    clearAuth("Previous session invalid. Please login again.");
    showView("login");
  }
};

boot();

setInterval(() => {
  if (isLoggedIn()) {
    refreshNotifications().catch(() => {});
  }
}, 15000);

setInterval(() => {
  if (isWorker()) {
    refreshMyJobs().catch(() => {});
  }
}, 25000);
