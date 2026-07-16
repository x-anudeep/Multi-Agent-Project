const { randomUUID } = require("crypto");
const { getPool } = require("../pool");

const memory = {
  registrations: new Map()
};

function timestamp() {
  return new Date().toISOString();
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    orderId: row.order_id ?? row.orderId,
    createdAt: row.created_at ?? row.createdAt,
    completedAt: row.completed_at ?? row.completedAt ?? null
  };
}

async function createRegistration({ orderId, phone }) {
  const pool = getPool();
  const token = randomUUID();
  const now = timestamp();

  if (!pool) {
    const saved = { token, orderId, phone, status: "pending", createdAt: now, completedAt: null };
    memory.registrations.set(token, saved);
    return saved;
  }

  const result = await pool.query(
    `INSERT INTO pending_registrations (token, order_id, phone, status)
     VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [token, orderId, phone || null]
  );

  return normalizeRow(result.rows[0]);
}

async function findByToken(token) {
  const pool = getPool();
  if (!pool) {
    return memory.registrations.get(token) || null;
  }

  const result = await pool.query("SELECT * FROM pending_registrations WHERE token = $1", [token]);
  return normalizeRow(result.rows[0] || null);
}

/**
 * Most recent still-pending registration for a phone number -- used when a
 * caller texts in, to look up which order their registration link is for.
 */
async function findLatestPendingByPhone(phone) {
  const pool = getPool();

  if (!pool) {
    const matches = Array.from(memory.registrations.values())
      .filter((registration) => registration.phone === phone && registration.status === "pending")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return matches[0] || null;
  }

  const result = await pool.query(
    `SELECT * FROM pending_registrations WHERE phone = $1 AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );

  return normalizeRow(result.rows[0] || null);
}

async function markCompleted(token) {
  const existing = await findByToken(token);
  if (!existing) return null;

  const pool = getPool();
  const now = timestamp();
  const updated = { ...existing, status: "completed", completedAt: now };

  if (!pool) {
    memory.registrations.set(token, updated);
    return updated;
  }

  const result = await pool.query(
    `UPDATE pending_registrations SET status = 'completed', completed_at = NOW()
     WHERE token = $1 RETURNING *`,
    [token]
  );

  return normalizeRow(result.rows[0]);
}

module.exports = {
  createRegistration,
  findByToken,
  findLatestPendingByPhone,
  markCompleted
};
