const BASE_RATE_PER_KM = 1.85;
const WEIGHT_RATE_PER_KG = 0.18;
const VOLUME_RATE_PER_M3 = 12;
const MINIMUM_QUOTE = 250;

const routeDistancesKm = {
  "phoenix|los angeles": 600,
  "phoenix|denver": 1320,
  "dallas|atlanta": 1250
};

function routeKey(origin, destination) {
  return `${String(origin).toLowerCase()}|${String(destination).toLowerCase()}`;
}

function estimateDistanceKm(order) {
  return routeDistancesKm[routeKey(order.origin, order.destination)] || 900;
}

function calculateBasePrice(order) {
  const distanceKm = estimateDistanceKm(order);
  const transport = distanceKm * BASE_RATE_PER_KM;
  const weight = Number(order.weightKg || 0) * WEIGHT_RATE_PER_KG;
  const volume = Number(order.volumeM3 || 0) * VOLUME_RATE_PER_M3;
  return Math.max(Math.round((transport + weight + volume) * 100) / 100, MINIMUM_QUOTE);
}

function runPricingAgent(order, routeCapacityResult) {
  const basePrice = calculateBasePrice(order);
  const vehicle = routeCapacityResult.selectedVehicle;

  return {
    agent: "pricing",
    orderId: order.id,
    vehicleId: vehicle?.id || null,
    basePrice,
    finalPrice: basePrice,
    discountAmount: 0,
    currency: "USD",
    pricingRules: {
      baseRatePerKm: BASE_RATE_PER_KM,
      weightRatePerKg: WEIGHT_RATE_PER_KG,
      volumeRatePerM3: VOLUME_RATE_PER_M3,
      minimumQuote: MINIMUM_QUOTE,
      estimatedDistanceKm: estimateDistanceKm(order)
    },
    nextAction: "load_optimization"
  };
}

module.exports = {
  runPricingAgent,
  calculateBasePrice,
  estimateDistanceKm
};
