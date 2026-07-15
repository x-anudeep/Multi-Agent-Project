const MAX_DISCOUNT_RATE = 0.15;
const TARGET_SPARE_CAPACITY_RATE = 0.3;

function calculateSpareCapacityRate(vehicle) {
  if (!vehicle) return 0;
  const remainingWeightRate = vehicle.remainingCapacity.weightKg / vehicle.maxWeightKg;
  const remainingVolumeRate = vehicle.remainingCapacity.volumeM3 / vehicle.maxVolumeM3;
  return Math.min(remainingWeightRate, remainingVolumeRate);
}

function calculateDiscount(basePrice, vehicle) {
  const spareCapacityRate = calculateSpareCapacityRate(vehicle);
  if (spareCapacityRate <= 0) {
    return {
      discountRate: 0,
      discountAmount: 0,
      reason: "No spare capacity discount available"
    };
  }

  const discountRate = Math.min(spareCapacityRate * TARGET_SPARE_CAPACITY_RATE, MAX_DISCOUNT_RATE);
  const discountAmount = Math.round(basePrice * discountRate * 100) / 100;

  return {
    discountRate: Math.round(discountRate * 10000) / 10000,
    discountAmount,
    reason: "Controlled spare-capacity discount applied"
  };
}

function runLoadOptimizationAgent(pricing, routeCapacityResult) {
  const selectedVehicle = routeCapacityResult.selectedVehicle;
  const discount = calculateDiscount(pricing.basePrice, selectedVehicle);
  const finalPrice = Math.max(Math.round((pricing.basePrice - discount.discountAmount) * 100) / 100, 0);

  return {
    agent: "load_optimization",
    vehicleId: selectedVehicle?.id || null,
    basePrice: pricing.basePrice,
    discountAmount: discount.discountAmount,
    discountRate: discount.discountRate,
    finalPrice,
    reason: discount.reason,
    nextAction: "quote_review"
  };
}

module.exports = {
  runLoadOptimizationAgent,
  calculateDiscount,
  calculateSpareCapacityRate,
  MAX_DISCOUNT_RATE
};
