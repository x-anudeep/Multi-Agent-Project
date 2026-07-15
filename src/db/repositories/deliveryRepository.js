const { randomUUID } = require("crypto");
const { getPool } = require("../pool");

const memory = {
  deliveryLogs: new Map()
};

function timestamp() {
  return new Date().toISOString();
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    orderId: row.order_id ?? row.orderId,
    quoteId: row.quote_id ?? row.quoteId,
    recipientEmail: row.recipient_email ?? row.recipientEmail,
    deliveryType: row.delivery_type ?? row.deliveryType,
    attemptCount: Number(row.attempt_count ?? row.attemptCount ?? 0),
    maxAttempts: Number(row.max_attempts ?? row.maxAttempts ?? 3),
    lastAttemptAt: row.last_attempt_at ?? row.lastAttemptAt ?? null,
    lastError: row.last_error ?? row.lastError ?? null,
    deliveredAt: row.delivered_at ?? row.deliveredAt ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

async function createDeliveryLog(log) {
  const pool = getPool();
  const id = log.id || randomUUID();
  const now = timestamp();

  if (!pool) {
    const saved = normalizeRow({
      ...log,
      id,
      attemptCount: log.attemptCount || 0,
      maxAttempts: log.maxAttempts || 3,
      status: log.status || "pending",
      metadata: log.metadata || {},
      createdAt: now,
      updatedAt: now
    });
    memory.deliveryLogs.set(id, saved);
    return saved;
  }

  const result = await pool.query(
    `INSERT INTO delivery_logs (
      id, order_id, quote_id, recipient_email, delivery_type, subject,
      status, attempt_count, max_attempts, last_attempt_at, last_error,
      delivered_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      id,
      log.orderId || null,
      log.quoteId || null,
      log.recipientEmail,
      log.deliveryType || "email",
      log.subject || null,
      log.status || "pending",
      log.attemptCount || 0,
      log.maxAttempts || 3,
      log.lastAttemptAt || null,
      log.lastError || null,
      log.deliveredAt || null,
      log.metadata || {}
    ]
  );

  return normalizeRow(result.rows[0]);
}

async function findDeliveryLogById(id) {
  const pool = getPool();
  if (!pool) {
    return memory.deliveryLogs.get(id) || null;
  }

  const result = await pool.query("SELECT * FROM delivery_logs WHERE id = $1", [id]);
  return normalizeRow(result.rows[0] || null);
}

async function listDeliveryLogsForOrder(orderId) {
  const pool = getPool();
  if (!pool) {
    return Array.from(memory.deliveryLogs.values())
      .filter((log) => log.orderId === orderId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const result = await pool.query(
    "SELECT * FROM delivery_logs WHERE order_id = $1 ORDER BY created_at DESC",
    [orderId]
  );
  return result.rows.map(normalizeRow);
}

/**
 * Find the delivery log for a quote email by the Message-ID Nodemailer
 * assigned when it was sent, so an incoming reply can be matched back to
 * the order/quote it's responding to via In-Reply-To/References.
 * @param {string} messageId
 * @returns {Promise<Object|null>}
 */
async function findDeliveryLogBySentMessageId(messageId) {
  if (!messageId) return null;

  const pool = getPool();
  if (!pool) {
    return (
      Array.from(memory.deliveryLogs.values()).find(
        (log) => log.metadata?.sentMessageId === messageId
      ) || null
    );
  }

  const result = await pool.query(
    "SELECT * FROM delivery_logs WHERE metadata->>'sentMessageId' = $1 ORDER BY created_at DESC LIMIT 1",
    [messageId]
  );
  return normalizeRow(result.rows[0] || null);
}

async function listAllDeliveryLogs() {
  const pool = getPool();
  if (!pool) {
    return Array.from(memory.deliveryLogs.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  const result = await pool.query("SELECT * FROM delivery_logs ORDER BY created_at DESC");
  return result.rows.map(normalizeRow);
}

async function updateDeliveryLog(id, changes) {
  const existing = await findDeliveryLogById(id);
  if (!existing) return null;

  const pool = getPool();
  const updated = normalizeRow({ ...existing, ...changes, updatedAt: timestamp() });

  if (!pool) {
    memory.deliveryLogs.set(id, updated);
    return updated;
  }

  const result = await pool.query(
    `UPDATE delivery_logs SET
      status = $2,
      attempt_count = $3,
      last_attempt_at = $4,
      last_error = $5,
      delivered_at = $6,
      metadata = $7,
      updated_at = NOW()
    WHERE id = $1 RETURNING *`,
    [
      id,
      updated.status,
      updated.attemptCount || 0,
      updated.lastAttemptAt || null,
      updated.lastError || null,
      updated.deliveredAt || null,
      updated.metadata || {}
    ]
  );

  return normalizeRow(result.rows[0]);
}

module.exports = {
  createDeliveryLog,
  findDeliveryLogById,
  findDeliveryLogBySentMessageId,
  listDeliveryLogsForOrder,
  listAllDeliveryLogs,
  updateDeliveryLog
};
