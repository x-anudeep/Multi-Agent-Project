const test = require("node:test");
const assert = require("node:assert/strict");
const { runRouteCapacityAgent } = require("../src/agents/routeCapacityAgent");
const { runPricingAgent } = require("../src/agents/pricingAgent");
const {
  runLoadOptimizationAgent,
  MAX_DISCOUNT_RATE
} = require("../src/agents/loadOptimizationAgent");
const { runQuoteReviewAgent } = require("../src/agents/quoteReviewAgent");

const order = {
  id: "order-1",
  origin: "Phoenix",
  destination: "Los Angeles",
  weightKg: 1000,
  volumeM3: 4
};

test("route capacity agent selects a compatible vehicle", () => {
  const result = runRouteCapacityAgent(order);

  assert.equal(result.routeSupported, true);
  assert.equal(result.capacityAvailable, true);
  assert.equal(result.selectedVehicle.id, "truck-phx-la-01");
});

test("pricing, optimization, and review produce an approved quote", () => {
  const routeCapacity = runRouteCapacityAgent(order);
  const pricing = runPricingAgent(order, routeCapacity);
  const optimized = runLoadOptimizationAgent(pricing, routeCapacity);
  const review = runQuoteReviewAgent(order, routeCapacity, optimized);

  assert.ok(pricing.basePrice >= 250);
  assert.ok(optimized.discountRate <= MAX_DISCOUNT_RATE);
  assert.ok(optimized.finalPrice < pricing.basePrice);
  assert.equal(review.approved, true);
  assert.equal(review.status, "approved");
});
