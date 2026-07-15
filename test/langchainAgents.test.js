const test = require("node:test");
const assert = require("node:assert/strict");
const {
  runLangChainTriage,
  runLangChainQuotePipeline
} = require("../src/agents/langchainAgentPipeline");

test("LangChain triage chain handles structured shipment payloads", async () => {
  const result = await runLangChainTriage({
    customer: {
      name: "Acme Logistics",
      email: "ops@example.com"
    },
    shipment: {
      pickup: "Phoenix",
      dropoff: "Los Angeles",
      weight: "1200 kg",
      volume: "8 m3",
      commodity: "electronics"
    }
  });

  assert.equal(result.extractionSource, "structured_payload");
  assert.equal(result.triage.valid, true);
  assert.equal(result.triage.normalizedShipment.origin, "Phoenix");
});

test("LangChain triage chain extracts a usable shipment from raw text without an LLM key", async () => {
  const result = await runLangChainTriage({
    transcript: "Customer: Acme Logistics. Please pickup Phoenix to Los Angeles on 2026-07-16 with 1200 kg and 8 m3 cargo: electronics. Email ops@example.com"
  });

  assert.equal(result.extractionSource, "langchain_heuristic");
  assert.equal(result.triage.valid, true);
  assert.equal(result.triage.normalizedShipment.origin, "Phoenix");
  assert.equal(result.triage.normalizedShipment.destination, "Los Angeles");
});

test("LangChain quote pipeline runs every backend agent", async () => {
  const result = await runLangChainQuotePipeline({
    id: "order-1",
    origin: "Phoenix",
    destination: "Los Angeles",
    weightKg: 1200,
    volumeM3: 8,
    normalizedRequest: {
      customerName: "Acme Logistics",
      customerEmail: "ops@example.com",
      origin: "Phoenix",
      destination: "Los Angeles",
      weightKg: 1200,
      volumeM3: 8,
      cargoType: "electronics"
    }
  });

  assert.equal(result.triage.valid, true);
  assert.equal(result.routeCapacity.capacityAvailable, true);
  assert.ok(result.pricing.basePrice > 0);
  assert.ok(result.loadOptimization.finalPrice <= result.pricing.basePrice);
  assert.equal(result.review.approved, true);
});
