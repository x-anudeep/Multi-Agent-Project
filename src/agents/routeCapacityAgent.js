const defaultVehicles = [
  {
    id: "truck-phx-la-01",
    route: ["Phoenix", "Los Angeles"],
    maxWeightKg: 12000,
    usedWeightKg: 8500,
    maxVolumeM3: 70,
    usedVolumeM3: 48,
    availableDate: "2026-07-16"
  },
  {
    id: "truck-phx-den-02",
    route: ["Phoenix", "Denver"],
    maxWeightKg: 10000,
    usedWeightKg: 4200,
    maxVolumeM3: 62,
    usedVolumeM3: 25,
    availableDate: "2026-07-16"
  },
  {
    id: "truck-dal-atl-03",
    route: ["Dallas", "Atlanta"],
    maxWeightKg: 14000,
    usedWeightKg: 6000,
    maxVolumeM3: 82,
    usedVolumeM3: 40,
    availableDate: "2026-07-17"
  }
];

function routeMatches(vehicle, order) {
  const route = vehicle.route.map((stop) => stop.toLowerCase());
  return route.includes(String(order.origin).toLowerCase()) &&
    route.includes(String(order.destination).toLowerCase()) &&
    route.indexOf(String(order.origin).toLowerCase()) < route.indexOf(String(order.destination).toLowerCase());
}

function remainingCapacity(vehicle) {
  return {
    weightKg: Math.max(vehicle.maxWeightKg - vehicle.usedWeightKg, 0),
    volumeM3: Math.max(vehicle.maxVolumeM3 - vehicle.usedVolumeM3, 0)
  };
}

function canFit(vehicle, order) {
  const remaining = remainingCapacity(vehicle);
  return remaining.weightKg >= order.weightKg && remaining.volumeM3 >= order.volumeM3;
}

function runRouteCapacityAgent(order, vehicles = defaultVehicles) {
  const candidates = vehicles
    .filter((vehicle) => routeMatches(vehicle, order))
    .map((vehicle) => ({
      ...vehicle,
      remainingCapacity: remainingCapacity(vehicle),
      canFit: canFit(vehicle, order)
    }));

  const selectedVehicle = candidates.find((vehicle) => vehicle.canFit) || null;

  return {
    agent: "route_capacity",
    routeSupported: candidates.length > 0,
    capacityAvailable: Boolean(selectedVehicle),
    selectedVehicle,
    candidates,
    nextAction: selectedVehicle ? "price_quote" : "manual_capacity_review"
  };
}

module.exports = {
  runRouteCapacityAgent,
  defaultVehicles,
  remainingCapacity
};
