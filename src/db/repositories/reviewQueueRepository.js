const { randomUUID } = require("crypto");
const { getPool } = require("../pool");

const memory = {
  reviewEntries: new Map()
};

function timestamp() {
  return new Date().toISOString();
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    orderId: row.order_id ?? row.orderId ?? null,
    transcriptionId: row.transcription_id ?? row.transcriptionId ?? null,
    reviewType: row.review_type ?? row.reviewType,
    rawData: row.raw_data ?? row.rawData ?? {},
    triageResult: row.triage_result ?? row.triageResult ?? null,
    reviewedAt: row.reviewed_at ?? row.reviewedAt ?? null,
    reviewedBy: row.reviewed_by ?? row.reviewedBy ?? null,
    reviewNotes: row.review_notes ?? row.reviewNotes ?? null,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

async function createReviewEntry(entry) {
  const pool = getPool();
  const id = entry.id || randomUUID();
  const now = timestamp();

  if (!pool) {
    const saved = normalizeRow({
      ...entry,
      id,
      reviewType: entry.reviewType || "extraction_validation",
      status: entry.status || "pending",
      createdAt: now,
      updatedAt: now
    });
    memory.reviewEntries.set(id, saved);
    return saved;
  }

  const result = await pool.query(
    `INSERT INTO order_review_queue (
      id, order_id, transcription_id, review_type, reason, raw_data,
      triage_result, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      id,
      entry.orderId || null,
      entry.transcriptionId || null,
      entry.reviewType || "extraction_validation",
      entry.reason,
      entry.rawData || {},
      entry.triageResult || null,
      entry.status || "pending"
    ]
  );

  return normalizeRow(result.rows[0]);
}

async function findReviewEntryById(id) {
  const pool = getPool();
  if (!pool) {
    return memory.reviewEntries.get(id) || null;
  }

  const result = await pool.query("SELECT * FROM order_review_queue WHERE id = $1", [id]);
  return normalizeRow(result.rows[0] || null);
}

async function listReviewQueue({ status } = {}) {
  const pool = getPool();
  if (!pool) {
    const entries = Array.from(memory.reviewEntries.values());
    return (status ? entries.filter((entry) => entry.status === status) : entries).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  if (status) {
    const result = await pool.query(
      "SELECT * FROM order_review_queue WHERE status = $1 ORDER BY created_at DESC",
      [status]
    );
    return result.rows.map(normalizeRow);
  }

  const result = await pool.query("SELECT * FROM order_review_queue ORDER BY created_at DESC");
  return result.rows.map(normalizeRow);
}

async function updateReviewEntry(id, changes) {
  const existing = await findReviewEntryById(id);
  if (!existing) return null;

  const pool = getPool();
  const updated = normalizeRow({ ...existing, ...changes, updatedAt: timestamp() });

  if (!pool) {
    memory.reviewEntries.set(id, updated);
    return updated;
  }

  const result = await pool.query(
    `UPDATE order_review_queue SET
      order_id = $2,
      status = $3,
      reviewed_at = $4,
      reviewed_by = $5,
      review_notes = $6,
      updated_at = NOW()
    WHERE id = $1 RETURNING *`,
    [
      id,
      updated.orderId || null,
      updated.status,
      updated.reviewedAt || null,
      updated.reviewedBy || null,
      updated.reviewNotes || null
    ]
  );

  return normalizeRow(result.rows[0]);
}

module.exports = {
  createReviewEntry,
  findReviewEntryById,
  listReviewQueue,
  updateReviewEntry
};
