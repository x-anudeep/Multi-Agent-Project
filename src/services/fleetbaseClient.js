const { env } = require("../config/env");

class FleetbaseClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || env.fleetbase.baseUrl;
    this.apiKey = options.apiKey || env.fleetbase.apiKey;
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async createOrder(order) {
    if (!this.isConfigured()) {
      return {
        skipped: true,
        reason: "Fleetbase credentials are not configured"
      };
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        customer: {
          name: order.customerName,
          email: order.customerEmail
        },
        payload: {
          pickup: order.origin,
          dropoff: order.destination,
          weight_kg: order.weightKg,
          volume_m3: order.volumeM3,
          cargo_type: order.cargoType
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Fleetbase order creation failed: ${response.status} ${text}`);
    }

    return response.json();
  }
}

module.exports = { FleetbaseClient };
