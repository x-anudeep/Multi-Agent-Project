const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeShipment,
  validateNormalizedShipment
} = require("../src/services/shipmentNormalizer");

test("normalizes nested customer and shipment payloads", () => {
  const shipment = normalizeShipment({
    customer: { name: "Acme Logistics", email: "ops@example.com" },
    shipment: {
      pickup: "Phoenix",
      dropoff: "Los Angeles",
      weight: "2,500 kg",
      volume: "12.5 m3",
      commodity: "electronics"
    }
  });

  assert.equal(shipment.customerName, "Acme Logistics");
  assert.equal(shipment.origin, "Phoenix");
  assert.equal(shipment.destination, "Los Angeles");
  assert.equal(shipment.weightKg, 2500);
  assert.equal(shipment.volumeM3, 12.5);
  assert.equal(shipment.cargoType, "electronics");
});

test("detects missing route and capacity information", () => {
  const shipment = normalizeShipment({ customerName: "Missing Fields" });
  const validation = validateNormalizedShipment(shipment);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.missing, ["origin", "destination", "weightKg or volumeM3"]);
});
