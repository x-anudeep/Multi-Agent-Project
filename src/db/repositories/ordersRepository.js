const { randomUUID } = require("crypto");
const { getPool } = require("../pool");

const memory = {
  orders: new Map(),
  quotes: new Map()
};

function timestamp() {
  return new Date().toISOString();
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    weightKg: Number(row.weight_kg ?? row.weightKg ?? 0),
    volumeM3: Number(row.volume_m3 ?? row.volumeM3 ?? 0),
    customerName: row.customer_name ?? row.customerName,
    customerEmail: row.customer_email ?? row.customerEmail,
    pickupDate: row.pickup_date ?? row.pickupDate,
    deliveryDate: row.delivery_date ?? row.deliveryDate,
    cargoType: row.cargo_type ?? row.cargoType,
    rawRequest: row.raw_request ?? row.rawRequest ?? {},
    normalizedRequest: row.normalized_request ?? row.normalizedRequest ?? {},
    fleetbaseOrderId: row.fleetbase_order_id ?? row.fleetbaseOrderId,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function normalizeQuoteRow(row) {
  if (!row) return row;
  return {
    ...row,
    orderId: row.order_id ?? row.orderId,
    vehicleId: row.vehicle_id ?? row.vehicleId,
    basePrice: Number(row.base_price ?? row.basePrice ?? 0),
    discountAmount: Number(row.discount_amount ?? row.discountAmount ?? 0),
    finalPrice: Number(row.final_price ?? row.finalPrice ?? 0),
    reviewNotes: row.review_notes ?? row.reviewNotes ?? [],
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

async function createOrder(order) {
  const pool = getPool();
  const id = order.id || randomUUID();
  const now = timestamp();

  if (!pool) {
    const saved = normalizeRow({
      ...order,
      id,
      status: order.status || "new",
      createdAt: now,
      updatedAt: now
    });
    memory.orders.set(id, saved);
    return saved;
  }

  const result = await pool.query(
    `INSERT INTO orders (
      id, customer_name, customer_email, origin, destination, pickup_date,
      delivery_date, weight_kg, volume_m3, cargo_type, status, raw_request,
      normalized_request, fleetbase_order_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    ) RETURNING *`,
    [
      id,
      order.customerName,
      order.customerEmail || null,
      order.origin,
      order.destination,
      order.pickupDate || null,
      order.deliveryDate || null,
      order.weightKg || 0,
      order.volumeM3 || 0,
      order.cargoType || null,
      order.status || "new",
      order.rawRequest || {},
      order.normalizedRequest || {},
      order.fleetbaseOrderId || null
    ]
  );

  return normalizeRow(result.rows[0]);
}

async function listOrders() {
  const pool = getPool();
  if (!pool) {
    return Array.from(memory.orders.values());
  }

  const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
  return result.rows.map(normalizeRow);
}

async function findOrderById(id) {
  const pool = getPool();
  if (!pool) {
    return memory.orders.get(id) || null;
  }

  const result = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  return normalizeRow(result.rows[0] || null);
}

async function updateOrder(id, changes) {
  const existing = await findOrderById(id);
  if (!existing) return null;

  const pool = getPool();
  const updated = normalizeRow({ ...existing, ...changes, updatedAt: timestamp() });

  if (!pool) {
    memory.orders.set(id, updated);
    return updated;
  }

  const result = await pool.query(
    `UPDATE orders SET
      customer_name = $2,
      customer_email = $3,
      origin = $4,
      destination = $5,
      pickup_date = $6,
      delivery_date = $7,
      weight_kg = $8,
      volume_m3 = $9,
      cargo_type = $10,
      status = $11,
      raw_request = $12,
      normalized_request = $13,
      fleetbase_order_id = $14,
      updated_at = NOW()
    WHERE id = $1 RETURNING *`,
    [
      id,
      updated.customerName,
      updated.customerEmail || null,
      updated.origin,
      updated.destination,
      updated.pickupDate || null,
      updated.deliveryDate || null,
      updated.weightKg || 0,
      updated.volumeM3 || 0,
      updated.cargoType || null,
      updated.status,
      updated.rawRequest || {},
      updated.normalizedRequest || {},
      updated.fleetbaseOrderId || null
    ]
  );

  return normalizeRow(result.rows[0]);
}

async function createQuote(quote) {
  const pool = getPool();
  const id = quote.id || randomUUID();
  const now = timestamp();

  if (!pool) {
    const saved = normalizeQuoteRow({
      ...quote,
      id,
      status: quote.status || "draft",
      createdAt: now,
      updatedAt: now
    });
    memory.quotes.set(id, saved);
    return saved;
  }

  const result = await pool.query(
    `INSERT INTO quotes (
      id, order_id, vehicle_id, base_price, discount_amount,
      final_price, currency, status, review_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      id,
      quote.orderId,
      quote.vehicleId || null,
      quote.basePrice,
      quote.discountAmount || 0,
      quote.finalPrice,
      quote.currency || "USD",
      quote.status || "draft",
      quote.reviewNotes || []
    ]
  );

  return normalizeQuoteRow(result.rows[0]);
}

async function listQuotesByOrderId(orderId) {
  const pool = getPool();
  if (!pool) {
    return Array.from(memory.quotes.values()).filter((quote) => quote.orderId === orderId);
  }

  const result = await pool.query(
    "SELECT * FROM quotes WHERE order_id = $1 ORDER BY created_at DESC",
    [orderId]
  );
  return result.rows.map(normalizeQuoteRow);
}

async function findQuoteById(id) {
  const pool = getPool();
  if (!pool) {
    return memory.quotes.get(id) || null;
  }

  const result = await pool.query("SELECT * FROM quotes WHERE id = $1", [id]);
  return normalizeQuoteRow(result.rows[0] || null);
}

async function updateQuote(id, changes) {
  const existing = await findQuoteById(id);
  if (!existing) return null;

  const pool = getPool();
  const updated = normalizeQuoteRow({ ...existing, ...changes, updatedAt: timestamp() });

  if (!pool) {
    memory.quotes.set(id, updated);
    return updated;
  }

  const result = await pool.query(
    `UPDATE quotes SET
      status = $2,
      review_notes = $3,
      updated_at = NOW()
    WHERE id = $1 RETURNING *`,
    [id, updated.status, updated.reviewNotes || []]
  );

  return normalizeQuoteRow(result.rows[0]);
}

module.exports = {
  createOrder,
  listOrders,
  findOrderById,
  updateOrder,
  createQuote,
  listQuotesByOrderId,
  findQuoteById,
  updateQuote,
  memory
};
