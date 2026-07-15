const ordersRepository = require("../db/repositories/ordersRepository");
const { FleetbaseClient } = require("./fleetbaseClient");
const {
  normalizeShipment,
  validateNormalizedShipment
} = require("./shipmentNormalizer");

async function createOrder(input, options = {}) {
  const fleetbaseClient = options.fleetbaseClient || new FleetbaseClient();
  const normalized = normalizeShipment(input);
  const validation = validateNormalizedShipment(normalized);

  if (!validation.valid) {
    const error = new Error(`Missing required shipment fields: ${validation.missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const saved = await ordersRepository.createOrder({
    ...normalized,
    normalizedRequest: normalized,
    status: "normalized"
  });

  const fleetbaseResult = await fleetbaseClient.createOrder(saved);
  if (fleetbaseResult && !fleetbaseResult.skipped) {
    return ordersRepository.updateOrder(saved.id, {
      fleetbaseOrderId: fleetbaseResult.id || fleetbaseResult.order?.id,
      status: "sent_to_fleetbase"
    });
  }

  return saved;
}

async function listOrders() {
  return ordersRepository.listOrders();
}

async function getOrder(id) {
  const order = await ordersRepository.findOrderById(id);
  if (!order) {
    const error = new Error("Order not found");
    error.status = 404;
    throw error;
  }
  return order;
}

/**
 * Mark an order as reviewed (or not) by a human. Purely a review-tracking
 * flag -- independent of Fleetbase sync, which still happens automatically
 * at order creation regardless of this flag.
 * @param {string} id
 * @param {boolean} verified
 */
async function setVerified(id, verified) {
  await getOrder(id);
  return ordersRepository.updateOrder(id, { verified: Boolean(verified) });
}

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  setVerified
};
