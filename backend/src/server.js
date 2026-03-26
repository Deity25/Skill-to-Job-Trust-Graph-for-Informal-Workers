import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { pool, query, withTransaction } from "./db.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const sessions = new Map();

const hashPassword = (password) => createHash("sha256").update(password).digest("hex");
const isValidPassword = (password) => typeof password === "string" && password.length >= 6;

const clearUserSessions = (userId) => {
  for (const [token, session] of sessions.entries()) {
    if (session.id === userId) {
      sessions.delete(token);
    }
  }
};

const parseList = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

const getTokenFromReq = (req) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
};

const requireAuth = (req, res, next) => {
  const token = getTokenFromReq(req);
  if (!token || !sessions.has(token)) {
    res.status(401).json({ error: "Unauthorized. Please login." });
    return;
  }
  req.auth = sessions.get(token);
  req.token = token;
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!roles.includes(req.auth.role)) {
    res.status(403).json({ error: "Forbidden: insufficient role" });
    return;
  }
  next();
};

const addNotification = async ({
  title,
  message,
  level = "info",
  targetRole = "all",
  targetUserId = null,
  entityType = "",
  entityId = ""
}) => {
  try {
    await query(
      `
        INSERT INTO notifications (
          title,
          message,
          level,
          target_role,
          target_user_id,
          entity_type,
          entity_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [title, message, level, targetRole, targetUserId, entityType, entityId]
    );
  } catch (error) {
    console.error("Notification insert failed:", error.message);
  }
};

const normalizeWorkerPayload = (body) => ({
  worker_code: body.worker_code ? String(body.worker_code).trim() : null,
  name: String(body.name || "").trim(),
  trade: String(body.trade || "").trim(),
  city: String(body.city || "").trim(),
  contact_phone: String(body.contact_phone || "").trim(),
  contact_email: String(body.contact_email || "").trim(),
  photo_url: String(body.photo_url || "").trim(),
  languages: parseList(body.languages),
  trust_score: Number(body.trust_score ?? 60),
  jobs_completed: Number(body.jobs_completed ?? 0),
  years_experience: Number(body.years_experience ?? 0),
  summary: String(body.summary || "").trim(),
  badges: parseList(body.badges),
  worker_identifier: body.worker_identifier ? String(body.worker_identifier).trim() : null,
  worker_password: body.worker_password ? String(body.worker_password) : null
});

const validateWorkerPayload = (data) => {
  if (!data.name || !data.trade || !data.city) {
    throw new Error("name, trade and city are required");
  }

  if (data.trust_score < 0 || data.trust_score > 100) {
    throw new Error("trust_score must be between 0 and 100");
  }

  const hasIdentifier = Boolean(data.worker_identifier);
  const hasPassword = Boolean(data.worker_password);
  if ((hasIdentifier && !hasPassword) || (!hasIdentifier && hasPassword)) {
    throw new Error("worker_identifier and worker_password must be provided together");
  }

  if (data.worker_password && !isValidPassword(data.worker_password)) {
    throw new Error("worker_password must be at least 6 characters");
  }
};

const normalizeJobPayload = (body) => ({
  recruiter_id: body.recruiter_id ? String(body.recruiter_id).trim() : null,
  assigned_worker_id: body.assigned_worker_id ? String(body.assigned_worker_id).trim() : null,
  title: String(body.title || "").trim(),
  city: String(body.city || "").trim(),
  required_trade: String(body.required_trade || "").trim(),
  budget: Number(body.budget ?? 0),
  description: String(body.description || "").trim(),
  status: String(body.status || "open").trim().toLowerCase()
});

const fetchWorkers = async ({ trade = "", city = "" } = {}) => {
  const filters = [];
  const values = [];

  if (trade) {
    values.push(`%${trade}%`);
    filters.push(`w.trade ILIKE $${values.length}`);
  }

  if (city) {
    values.push(`%${city}%`);
    filters.push(`w.city ILIKE $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const result = await query(
    `
      SELECT
        w.id,
        w.worker_code,
        w.name,
        w.trade,
        w.city,
        w.contact_phone,
        w.contact_email,
        w.photo_url,
        w.languages,
        w.trust_score,
        w.jobs_completed,
        w.years_experience,
        w.summary,
        COALESCE(array_agg(wb.badge) FILTER (WHERE wb.badge IS NOT NULL), '{}') AS badges,
        MAX(au.identifier) AS worker_login_id,
        w.created_at,
        w.updated_at
      FROM workers w
      LEFT JOIN worker_badges wb ON wb.worker_id = w.id
      LEFT JOIN app_users au ON au.worker_id = w.id AND au.role = 'worker'
      ${whereClause}
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `,
    values
  );

  return result.rows;
};

const fetchWorkerById = async (id) => {
  const result = await query(
    `
      SELECT
        w.id,
        w.worker_code,
        w.name,
        w.trade,
        w.city,
        w.contact_phone,
        w.contact_email,
        w.photo_url,
        w.languages,
        w.trust_score,
        w.jobs_completed,
        w.years_experience,
        w.summary,
        COALESCE(array_agg(wb.badge) FILTER (WHERE wb.badge IS NOT NULL), '{}') AS badges,
        MAX(au.identifier) AS worker_login_id,
        w.created_at,
        w.updated_at
      FROM workers w
      LEFT JOIN worker_badges wb ON wb.worker_id = w.id
      LEFT JOIN app_users au ON au.worker_id = w.id AND au.role = 'worker'
      WHERE w.id = $1
      GROUP BY w.id
    `,
    [id]
  );

  return result.rows[0] || null;
};

const createOrUpdateWorkerAccount = async (client, workerId, identifier, password) => {
  if (!identifier || !password) return;
  const passwordHash = hashPassword(password);

  await client.query(
    `
      INSERT INTO app_users (role, identifier, password_hash, worker_id, is_active)
      VALUES ('worker', $1, $2, $3, true)
      ON CONFLICT (identifier)
      DO UPDATE SET
        role = 'worker',
        password_hash = EXCLUDED.password_hash,
        worker_id = EXCLUDED.worker_id,
        is_active = true,
        updated_at = now()
    `,
    [identifier, passwordHash, workerId]
  );
};

const createWorker = async (payload) => {
  const data = normalizeWorkerPayload(payload);
  validateWorkerPayload(data);

  const workerId = await withTransaction(async (client) => {
    const result = await client.query(
      `
        INSERT INTO workers (
          worker_code,
          name,
          trade,
          city,
          contact_phone,
          contact_email,
          photo_url,
          languages,
          trust_score,
          jobs_completed,
          years_experience,
          summary
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `,
      [
        data.worker_code,
        data.name,
        data.trade,
        data.city,
        data.contact_phone,
        data.contact_email,
        data.photo_url,
        data.languages,
        data.trust_score,
        data.jobs_completed,
        data.years_experience,
        data.summary
      ]
    );

    const id = result.rows[0].id;

    for (const badge of data.badges) {
      await client.query(`INSERT INTO worker_badges (worker_id, badge) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
        id,
        badge
      ]);
    }

    if (data.worker_identifier && data.worker_password) {
      await createOrUpdateWorkerAccount(client, id, data.worker_identifier, data.worker_password);
    }

    return id;
  });

  return fetchWorkerById(workerId);
};

const updateWorker = async (id, payload) => {
  const data = normalizeWorkerPayload(payload);
  validateWorkerPayload(data);

  const exists = await fetchWorkerById(id);
  if (!exists) return null;

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE workers
        SET
          worker_code = $2,
          name = $3,
          trade = $4,
          city = $5,
          contact_phone = $6,
          contact_email = $7,
          photo_url = $8,
          languages = $9,
          trust_score = $10,
          jobs_completed = $11,
          years_experience = $12,
          summary = $13,
          updated_at = now()
        WHERE id = $1
      `,
      [
        id,
        data.worker_code,
        data.name,
        data.trade,
        data.city,
        data.contact_phone,
        data.contact_email,
        data.photo_url,
        data.languages,
        data.trust_score,
        data.jobs_completed,
        data.years_experience,
        data.summary
      ]
    );

    await client.query(`DELETE FROM worker_badges WHERE worker_id = $1`, [id]);

    for (const badge of data.badges) {
      await client.query(`INSERT INTO worker_badges (worker_id, badge) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
        id,
        badge
      ]);
    }

    if (data.worker_identifier && data.worker_password) {
      await createOrUpdateWorkerAccount(client, id, data.worker_identifier, data.worker_password);
    }
  });

  return fetchWorkerById(id);
};

const fetchJobs = async ({ city = "", status = "" } = {}) => {
  const values = [];
  const filters = [];

  if (city) {
    values.push(`%${city}%`);
    filters.push(`j.city ILIKE $${values.length}`);
  }

  if (status) {
    values.push(status.toLowerCase());
    filters.push(`j.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const result = await query(
    `
      SELECT
        j.*,
        r.company_name AS recruiter_company,
        r.contact_name AS recruiter_contact,
        aw.name AS assigned_worker_name,
        aw.worker_code AS assigned_worker_code
      FROM jobs j
      LEFT JOIN recruiters r ON r.id = j.recruiter_id
      LEFT JOIN workers aw ON aw.id = j.assigned_worker_id
      ${whereClause}
      ORDER BY j.created_at DESC
    `,
    values
  );

  return result.rows;
};

app.get("/health", async (_req, res) => {
  try {
    const ping = await query("SELECT now() AS now");
    res.json({ ok: true, service: "rv5-skill-trust-graph", now: ping.rows[0].now });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const identifier = String(req.body.identifier || "").trim();
    const password = String(req.body.password || "");
    const role = req.body.role ? String(req.body.role).trim() : null;

    if (!identifier || !password) {
      res.status(400).json({ error: "identifier and password are required" });
      return;
    }

    const result = await query(
      `
        SELECT id, role, identifier, password_hash, worker_id, recruiter_id, is_active
        FROM app_users
        WHERE identifier = $1
      `,
      [identifier]
    );

    if (!result.rows.length) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = result.rows[0];
    if (!user.is_active) {
      res.status(403).json({ error: "Account is inactive" });
      return;
    }

    if (role && user.role !== role) {
      res.status(403).json({ error: "Role mismatch for this account" });
      return;
    }

    const incomingHash = hashPassword(password);
    if (incomingHash !== user.password_hash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = randomUUID();
    const authUser = {
      id: user.id,
      role: user.role,
      identifier: user.identifier,
      worker_id: user.worker_id,
      recruiter_id: user.recruiter_id
    };

    sessions.set(token, authUser);

    res.json({ token, user: authUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json(req.auth);
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  try {
    const oldPassword = String(req.body.old_password || "");
    const newPassword = String(req.body.new_password || "");

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: "old_password and new_password are required" });
      return;
    }

    if (!isValidPassword(newPassword)) {
      res.status(400).json({ error: "new_password must be at least 6 characters" });
      return;
    }

    const result = await query(`SELECT password_hash FROM app_users WHERE id = $1`, [req.auth.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (result.rows[0].password_hash !== hashPassword(oldPassword)) {
      res.status(401).json({ error: "Old password is incorrect" });
      return;
    }

    await query(`UPDATE app_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
      req.auth.id,
      hashPassword(newPassword)
    ]);

    clearUserSessions(req.auth.id);

    res.json({ ok: true, message: "Password updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const identifier = String(req.body.identifier || "").trim();
    if (!identifier) {
      res.status(400).json({ error: "identifier is required" });
      return;
    }

    const userResult = await query(
      `
        SELECT id, role, identifier, is_active
        FROM app_users
        WHERE identifier = $1
      `,
      [identifier]
    );

    if (!userResult.rows.length || !userResult.rows[0].is_active) {
      res.status(404).json({ error: "Account not found or inactive" });
      return;
    }

    const user = userResult.rows[0];
    const resetCode = String(Math.floor(100000 + Math.random() * 900000));

    await query(
      `
        INSERT INTO password_reset_requests (user_id, reset_code, expires_at)
        VALUES ($1, $2, now() + interval '20 minutes')
      `,
      [user.id, resetCode]
    );

    await addNotification({
      title: "Password reset code",
      message: `Use reset code ${resetCode}. This code expires in 20 minutes.`,
      level: "warn",
      targetRole: user.role,
      targetUserId: user.id,
      entityType: "auth",
      entityId: user.id
    });

    res.json({
      ok: true,
      message: "Reset code generated. Check notifications.",
      reset_code: resetCode
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const identifier = String(req.body.identifier || "").trim();
    const resetCode = String(req.body.reset_code || "").trim();
    const newPassword = String(req.body.new_password || "");

    if (!identifier || !resetCode || !newPassword) {
      res.status(400).json({ error: "identifier, reset_code and new_password are required" });
      return;
    }

    if (!isValidPassword(newPassword)) {
      res.status(400).json({ error: "new_password must be at least 6 characters" });
      return;
    }

    const requestResult = await query(
      `
        SELECT
          pr.id AS request_id,
          u.id AS user_id,
          u.identifier
        FROM password_reset_requests pr
        JOIN app_users u ON u.id = pr.user_id
        WHERE
          u.identifier = $1
          AND pr.reset_code = $2
          AND pr.used_at IS NULL
          AND pr.expires_at > now()
        ORDER BY pr.created_at DESC
        LIMIT 1
      `,
      [identifier, resetCode]
    );

    if (!requestResult.rows.length) {
      res.status(400).json({ error: "Invalid or expired reset code" });
      return;
    }

    const resetRequest = requestResult.rows[0];

    await withTransaction(async (client) => {
      await client.query(`UPDATE app_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
        resetRequest.user_id,
        hashPassword(newPassword)
      ]);

      await client.query(`UPDATE password_reset_requests SET used_at = now() WHERE id = $1`, [resetRequest.request_id]);
    });

    clearUserSessions(resetRequest.user_id);

    await addNotification({
      title: "Password reset success",
      message: `Password was reset for account ${resetRequest.identifier}`,
      level: "success",
      targetRole: "admin",
      entityType: "auth",
      entityId: resetRequest.user_id
    });

    res.json({ ok: true, message: "Password reset successful. Please login again." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const newPassword = String(req.body.new_password || "");
    if (!newPassword) {
      res.status(400).json({ error: "new_password is required" });
      return;
    }

    if (!isValidPassword(newPassword)) {
      res.status(400).json({ error: "new_password must be at least 6 characters" });
      return;
    }

    const result = await query(
      `UPDATE app_users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id, identifier, role`,
      [req.params.id, hashPassword(newPassword)]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    clearUserSessions(result.rows[0].id);

    await addNotification({
      title: "Password reset",
      message: `Password reset by admin for ${result.rows[0].identifier}`,
      level: "warn",
      targetRole: "admin",
      entityType: "user",
      entityId: result.rows[0].id
    });

    await addNotification({
      title: "Password reset by admin",
      message: "Your account password has been reset by admin. Please login with the new password.",
      level: "warn",
      targetRole: result.rows[0].role,
      targetUserId: result.rows[0].id,
      entityType: "user",
      entityId: result.rows[0].id
    });

    res.json({ ok: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const roleFilter = req.query.role ? String(req.query.role).trim().toLowerCase() : "";
    const values = [];
    const whereClause = roleFilter ? "WHERE u.role = $1" : "";
    if (roleFilter) values.push(roleFilter);

    const result = await query(
      `
        SELECT
          u.id,
          u.role,
          u.identifier,
          u.is_active,
          u.worker_id,
          u.recruiter_id,
          u.created_at,
          u.updated_at,
          w.name AS worker_name,
          w.contact_phone AS worker_phone,
          w.contact_email AS worker_email,
          r.company_name AS recruiter_company
        FROM app_users u
        LEFT JOIN workers w ON w.id = u.worker_id
        LEFT JOIN recruiters r ON r.id = u.recruiter_id
        ${whereClause}
        ORDER BY u.created_at DESC
      `,
      values
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/workers", requireAuth, async (req, res) => {
  try {
    const workers = await fetchWorkers({
      trade: req.query.trade ? String(req.query.trade).trim() : "",
      city: req.query.city ? String(req.query.city).trim() : ""
    });
    res.json(workers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/workers/:id", requireAuth, async (req, res) => {
  try {
    const worker = await fetchWorkerById(req.params.id);
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }
    res.json(worker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/workers/me/jobs", requireAuth, requireRole("worker"), async (req, res) => {
  try {
    if (!req.auth.worker_id) {
      res.status(400).json({ error: "No worker mapping found for this account" });
      return;
    }

    const result = await query(
      `
        SELECT
          j.*,
          r.company_name AS recruiter_company,
          r.contact_name AS recruiter_contact
        FROM jobs j
        LEFT JOIN recruiters r ON r.id = j.recruiter_id
        WHERE j.assigned_worker_id = $1
        ORDER BY j.updated_at DESC
      `,
      [req.auth.worker_id]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/workers", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const worker = await createWorker(req.body);

    await addNotification({
      title: "Worker created",
      message: `Worker profile created: ${worker.name}`,
      level: "success",
      targetRole: "admin",
      entityType: "worker",
      entityId: worker.id
    });

    res.status(201).json(worker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/workers/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const worker = await updateWorker(req.params.id, req.body);
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    await addNotification({
      title: "Worker updated",
      message: `Worker profile updated: ${worker.name}`,
      targetRole: "admin",
      entityType: "worker",
      entityId: worker.id
    });

    res.json(worker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/workers/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const result = await query(`DELETE FROM workers WHERE id = $1 RETURNING id, name`, [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    await addNotification({
      title: "Worker deleted",
      message: `Worker removed: ${result.rows[0].name}`,
      level: "warn",
      targetRole: "admin",
      entityType: "worker",
      entityId: result.rows[0].id
    });

    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/onboarding/worker", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const worker = await createWorker(req.body);

    await addNotification({
      title: "Worker onboarded",
      message: `Worker onboarding completed for ${worker.name}`,
      level: "success",
      targetRole: "admin",
      entityType: "worker",
      entityId: worker.id
    });

    res.status(201).json({ message: "Worker onboarding complete", worker });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/onboarding/recruiter", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const company_name = String(req.body.company_name || "").trim();
    const contact_name = String(req.body.contact_name || "").trim();
    const city = String(req.body.city || "").trim();
    const verified = Boolean(req.body.verified);

    if (!company_name || !contact_name || !city) {
      res.status(400).json({ error: "company_name, contact_name and city are required" });
      return;
    }

    const result = await query(
      `
        INSERT INTO recruiters (company_name, contact_name, city, verified)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [company_name, contact_name, city, verified]
    );

    await addNotification({
      title: "Recruiter onboarded",
      message: `Recruiter onboarding completed: ${company_name}`,
      level: "success",
      targetRole: "admin",
      entityType: "recruiter",
      entityId: result.rows[0].id
    });

    res.status(201).json({ message: "Recruiter onboarding complete", recruiter: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/recruiters", requireAuth, async (_req, res) => {
  try {
    const result = await query(`SELECT * FROM recruiters ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/recruiters/:id", requireAuth, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM recruiters WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Recruiter not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/recruiters", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const company_name = String(req.body.company_name || "").trim();
    const contact_name = String(req.body.contact_name || "").trim();
    const city = String(req.body.city || "").trim();
    const verified = Boolean(req.body.verified);

    if (!company_name || !contact_name || !city) {
      res.status(400).json({ error: "company_name, contact_name and city are required" });
      return;
    }

    const result = await query(
      `
        INSERT INTO recruiters (company_name, contact_name, city, verified)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [company_name, contact_name, city, verified]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/recruiters/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const company_name = String(req.body.company_name || "").trim();
    const contact_name = String(req.body.contact_name || "").trim();
    const city = String(req.body.city || "").trim();
    const verified = Boolean(req.body.verified);

    if (!company_name || !contact_name || !city) {
      res.status(400).json({ error: "company_name, contact_name and city are required" });
      return;
    }

    const result = await query(
      `
        UPDATE recruiters
        SET
          company_name = $2,
          contact_name = $3,
          city = $4,
          verified = $5,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id, company_name, contact_name, city, verified]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "Recruiter not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/recruiters/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const result = await query(`DELETE FROM recruiters WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Recruiter not found" });
      return;
    }

    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/jobs", requireAuth, async (req, res) => {
  try {
    const jobs = await fetchJobs({
      city: req.query.city ? String(req.query.city).trim() : "",
      status: req.query.status ? String(req.query.status).trim() : ""
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/jobs/:id", requireAuth, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          j.*,
          r.company_name AS recruiter_company,
          r.contact_name AS recruiter_contact,
          aw.name AS assigned_worker_name,
          aw.worker_code AS assigned_worker_code
        FROM jobs j
        LEFT JOIN recruiters r ON r.id = j.recruiter_id
        LEFT JOIN workers aw ON aw.id = j.assigned_worker_id
        WHERE j.id = $1
      `,
      [req.params.id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/jobs", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const data = normalizeJobPayload(req.body);

    if (!data.title || !data.city || !data.required_trade) {
      res.status(400).json({ error: "title, city and required_trade are required" });
      return;
    }

    if (!["open", "assigned", "closed"].includes(data.status)) {
      res.status(400).json({ error: "status must be open, assigned or closed" });
      return;
    }

    const result = await query(
      `
        INSERT INTO jobs (
          recruiter_id,
          assigned_worker_id,
          title,
          city,
          required_trade,
          budget,
          description,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        data.recruiter_id,
        data.assigned_worker_id,
        data.title,
        data.city,
        data.required_trade,
        data.budget,
        data.description,
        data.status
      ]
    );

    await addNotification({
      title: "Job created",
      message: `Job created: ${data.title}`,
      level: "success",
      targetRole: "admin",
      entityType: "job",
      entityId: result.rows[0].id
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/jobs/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const data = normalizeJobPayload(req.body);

    if (!data.title || !data.city || !data.required_trade) {
      res.status(400).json({ error: "title, city and required_trade are required" });
      return;
    }

    if (!["open", "assigned", "closed"].includes(data.status)) {
      res.status(400).json({ error: "status must be open, assigned or closed" });
      return;
    }

    const result = await query(
      `
        UPDATE jobs
        SET
          recruiter_id = $2,
          assigned_worker_id = $3,
          title = $4,
          city = $5,
          required_trade = $6,
          budget = $7,
          description = $8,
          status = $9,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        req.params.id,
        data.recruiter_id,
        data.assigned_worker_id,
        data.title,
        data.city,
        data.required_trade,
        data.budget,
        data.description,
        data.status
      ]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/jobs/:id/assign", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const worker_id = String(req.body.worker_id || "").trim();
    if (!worker_id) {
      res.status(400).json({ error: "worker_id is required" });
      return;
    }

    const worker = await query(`SELECT id, name FROM workers WHERE id = $1`, [worker_id]);
    if (!worker.rows.length) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    const result = await query(
      `
        UPDATE jobs
        SET
          assigned_worker_id = $2,
          status = 'assigned',
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id, worker_id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const targetUser = await query(`SELECT id FROM app_users WHERE worker_id = $1 AND role = 'worker'`, [worker_id]);

    await addNotification({
      title: "Work assigned",
      message: `You have been assigned a new job: ${result.rows[0].title}`,
      level: "success",
      targetRole: "worker",
      targetUserId: targetUser.rows[0]?.id || null,
      entityType: "job",
      entityId: result.rows[0].id
    });

    await addNotification({
      title: "Job assignment updated",
      message: `Job ${result.rows[0].title} assigned to ${worker.rows[0].name}`,
      targetRole: "admin",
      entityType: "job",
      entityId: result.rows[0].id
    });

    res.json({
      ...result.rows[0],
      assigned_worker_name: worker.rows[0].name
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/jobs/:id/unassign", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const result = await query(
      `
        UPDATE jobs
        SET
          assigned_worker_id = NULL,
          status = 'open',
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    await addNotification({
      title: "Job unassigned",
      message: `Job moved back to open: ${result.rows[0].title}`,
      level: "warn",
      targetRole: "admin",
      entityType: "job",
      entityId: result.rows[0].id
    });

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/jobs/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const result = await query(`DELETE FROM jobs WHERE id = $1 RETURNING id, title`, [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    await addNotification({
      title: "Job deleted",
      message: `Job deleted: ${result.rows[0].title}`,
      level: "warn",
      targetRole: "admin",
      entityType: "job",
      entityId: result.rows[0].id
    });

    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    if (req.auth.role === "admin") {
      const result = await query(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100`);
      res.json(result.rows);
      return;
    }

    const result = await query(
      `
        SELECT *
        FROM notifications
        WHERE
          target_user_id = $1
          OR target_role = 'all'
          OR target_role = $2
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [req.auth.id, req.auth.role]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/notifications/broadcast", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();
    const level = String(req.body.level || "info").trim().toLowerCase();
    const targetRole = String(req.body.target_role || "all").trim().toLowerCase();

    if (!title || !message) {
      res.status(400).json({ error: "title and message are required" });
      return;
    }

    if (!["info", "success", "warn", "error"].includes(level)) {
      res.status(400).json({ error: "level must be info, success, warn, or error" });
      return;
    }

    if (!["all", "admin", "worker", "recruiter"].includes(targetRole)) {
      res.status(400).json({ error: "target_role must be all, admin, worker, or recruiter" });
      return;
    }

    await addNotification({
      title,
      message,
      level,
      targetRole,
      entityType: "announcement",
      entityId: randomUUID()
    });

    res.status(201).json({ ok: true, message: "Broadcast notification sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error.message || "Unexpected server error" });
});

const start = async () => {
  try {
    await pool.query("SELECT 1");
    app.listen(PORT, () => {
      console.log(`RV5 Skill Trust Graph API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

start();
