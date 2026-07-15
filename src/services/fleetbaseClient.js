const { env } = require("../config/env");

class FleetbaseClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || env.fleetbase.baseUrl;
    this.apiKey = options.apiKey || env.fleetbase.apiKey;
    this.orderEndpoint = options.orderEndpoint || env.fleetbase.orderEndpoint;
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  url(path) {
    return `${this.baseUrl.replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
  }

  headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`
    };
  }

  async status() {
    if (!this.baseUrl) {
      return {
        configured: false,
        reachable: false,
        reason: "FLEETBASE_BASE_URL is not configured"
      };
    }

    try {
      const response = await fetch(this.url("/"), {
        method: "GET",
        headers: this.apiKey ? this.headers() : { "Content-Type": "application/json" }
      });

      return {
        configured: this.isConfigured(),
        reachable: response.ok || response.status < 500,
        statusCode: response.status,
        baseUrl: this.baseUrl
      };
    } catch (error) {
      return {
        configured: this.isConfigured(),
        reachable: false,
        baseUrl: this.baseUrl,
        reason: error.message
      };
    }
  }

  async createOrder(order) {
    if (!this.isConfigured()) {
      return {
        skipped: true,
        reason: "Fleetbase credentials are not configured"
      };
    }

    const response = await fetch(this.url(this.orderEndpoint), {
      method: "POST",
      headers: this.headers(),
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
