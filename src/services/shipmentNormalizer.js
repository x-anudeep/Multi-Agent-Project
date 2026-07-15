function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstValue(source, keys, fallback = "") {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return fallback;
}

function normalizeShipment(input = {}) {
  const customer = input.customer || {};
  const shipment = input.shipment || input;

  return {
    customerName: firstValue(input, ["customerName", "name"], customer.name || "Unknown Customer"),
    customerEmail: firstValue(input, ["customerEmail", "email"], customer.email || ""),
    origin: String(firstValue(shipment, ["origin", "pickup", "pickupLocation"], "")).trim(),
    destination: String(firstValue(shipment, ["destination", "dropoff", "deliveryLocation"], "")).trim(),
    pickupDate: firstValue(shipment, ["pickupDate", "pickup_date"], ""),
    deliveryDate: firstValue(shipment, ["deliveryDate", "delivery_date"], ""),
    weightKg: toNumber(firstValue(shipment, ["weightKg", "weight", "weight_kg"], 0)),
    volumeM3: toNumber(firstValue(shipment, ["volumeM3", "volume", "volume_m3"], 0)),
    cargoType: String(firstValue(shipment, ["cargoType", "cargo", "commodity"], "general")).trim(),
    rawRequest: input
  };
}

function validateNormalizedShipment(shipment) {
  const missing = [];
  for (const field of ["origin", "destination"]) {
    if (!shipment[field]) missing.push(field);
  }
  if (!shipment.weightKg && !shipment.volumeM3) {
    missing.push("weightKg or volumeM3");
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

module.exports = {
  normalizeShipment,
  validateNormalizedShipment
};
