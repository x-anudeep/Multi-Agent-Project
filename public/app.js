const state = {
  orders: [],
  quotesByOrder: new Map(),
  selectedOrderId: null
};

const elements = {
  apiDot: document.querySelector("#apiDot"),
  apiStatus: document.querySelector("#apiStatus"),
  apiService: document.querySelector("#apiService"),
  fleetbaseDot: document.querySelector("#fleetbaseDot"),
  fleetbaseStatus: document.querySelector("#fleetbaseStatus"),
  fleetbaseService: document.querySelector("#fleetbaseService"),
  orderForm: document.querySelector("#orderForm"),
  ordersList: document.querySelector("#ordersList"),
  orderCount: document.querySelector("#orderCount"),
  selectedOrderPill: document.querySelector("#selectedOrderPill"),
  quoteSummary: document.querySelector("#quoteSummary"),
  agentTimeline: document.querySelector("#agentTimeline"),
  totalOrders: document.querySelector("#totalOrders"),
  approvedQuotes: document.querySelector("#approvedQuotes"),
  averageQuote: document.querySelector("#averageQuote"),
  workflowState: document.querySelector("#workflowState"),
  refreshButton: document.querySelector("#refreshButton"),
  sampleButton: document.querySelector("#sampleButton"),
  toast: document.querySelector("#toast")
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Request failed");
  }
  return payload.data ?? payload;
}

async function checkHealth() {
  try {
    const health = await api("/health");
    elements.apiDot.className = "status-dot online";
    elements.apiStatus.textContent = "API online";
    elements.apiService.textContent = health.service;
  } catch (error) {
    elements.apiDot.className = "status-dot offline";
    elements.apiStatus.textContent = "API offline";
    elements.apiService.textContent = error.message;
  }
}

async function checkFleetbase() {
  try {
    const status = await api("/api/integrations/fleetbase/status");
    elements.fleetbaseDot.className = `status-dot ${status.reachable ? "online" : "offline"}`;
    elements.fleetbaseStatus.textContent = status.reachable ? "Fleetbase reachable" : "Fleetbase offline";
    elements.fleetbaseService.textContent = status.baseUrl || status.reason || "Not configured";
  } catch (error) {
    elements.fleetbaseDot.className = "status-dot offline";
    elements.fleetbaseStatus.textContent = "Fleetbase check failed";
    elements.fleetbaseService.textContent = error.message;
  }
}

function getAllQuotes() {
  return Array.from(state.quotesByOrder.values()).flat();
}

function renderMetrics() {
  const quotes = getAllQuotes();
  const approved = quotes.filter((quote) => quote.status === "approved");
  const total = quotes.reduce((sum, quote) => sum + Number(quote.finalPrice || 0), 0);

  elements.totalOrders.textContent = state.orders.length;
  elements.approvedQuotes.textContent = approved.length;
  elements.averageQuote.textContent = money(quotes.length ? total / quotes.length : 0);
  elements.workflowState.textContent = state.selectedOrderId ? "Order selected" : "Ready";
}

function orderSubtitle(order) {
  return `${order.origin} to ${order.destination} / ${order.weightKg} kg / ${order.volumeM3} m3`;
}

function renderOrders() {
  elements.orderCount.textContent = `${state.orders.length} loaded`;

  if (!state.orders.length) {
    elements.ordersList.className = "orders-list empty-state";
    elements.ordersList.textContent = "No orders yet.";
    renderMetrics();
    return;
  }

  elements.ordersList.className = "orders-list";
  elements.ordersList.innerHTML = state.orders
    .map((order) => `
      <article class="order-row">
        <div>
          <strong>${order.customerName || "Unknown Customer"}</strong>
          <p>${orderSubtitle(order)}</p>
          <p>Status: ${order.status || "new"}</p>
        </div>
        <div class="row-actions">
          <button class="secondary-button" data-action="select" data-id="${order.id}" type="button">View</button>
          <button class="primary-button" data-action="quote" data-id="${order.id}" type="button">Run Quote</button>
        </div>
      </article>
    `)
    .join("");

  renderMetrics();
}

function renderQuote(orderId, quoteResult) {
  state.selectedOrderId = orderId;
  const order = state.orders.find((item) => item.id === orderId);
  const quotes = state.quotesByOrder.get(orderId) || [];
  const latestQuote = quoteResult?.quote || quotes[0];

  elements.selectedOrderPill.textContent = order ? order.customerName : "Selected order";

  if (!latestQuote) {
    elements.quoteSummary.innerHTML = `
      <span>No quote generated</span>
      <strong>${order ? orderSubtitle(order) : "Select an order and run quote generation."}</strong>
    `;
    elements.agentTimeline.innerHTML = "";
    renderMetrics();
    return;
  }

  const statusClass = latestQuote.status === "approved" ? "approved" : "review";
  elements.quoteSummary.innerHTML = `
    <span>Final quote</span>
    <strong>${money(latestQuote.finalPrice)}</strong>
    <span class="${statusClass}">${latestQuote.status}</span>
    <span>Base ${money(latestQuote.basePrice)} / Discount ${money(latestQuote.discountAmount)}</span>
    <span>Vehicle ${latestQuote.vehicleId || "not assigned"}</span>
  `;

  const agents = quoteResult?.agents;
  if (agents) {
    const timeline = [
      ["Triage Agent", agents.triage.nextAction, `Confidence ${agents.triage.confidence}`],
      ["Route & Capacity Agent", agents.routeCapacity.nextAction, agents.routeCapacity.selectedVehicle?.id || "No vehicle"],
      ["Pricing Agent", agents.pricing.nextAction, money(agents.pricing.basePrice)],
      ["Load Optimization Agent", agents.loadOptimization.reason, `${money(agents.loadOptimization.discountAmount)} discount`],
      ["Quote Review Agent", agents.review.nextAction, agents.review.approved ? "Approved" : agents.review.issues.join(", ")]
    ];

    elements.agentTimeline.innerHTML = timeline
      .map(([title, result, detail]) => `
        <article class="timeline-item">
          <strong>${title}</strong>
          <p>${result}</p>
          <p>${detail}</p>
        </article>
      `)
      .join("");
  }

  renderMetrics();
}

async function loadOrders() {
  elements.refreshButton.disabled = true;
  try {
    state.orders = await api("/api/orders");
    await Promise.all(state.orders.map(async (order) => {
      const quotes = await api(`/api/orders/${order.id}/quotes`);
      state.quotesByOrder.set(order.id, quotes);
    }));
    renderOrders();
    if (state.selectedOrderId) {
      renderQuote(state.selectedOrderId);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function createOrder(formData) {
  const payload = {
    customer: {
      name: formData.get("customerName"),
      email: formData.get("customerEmail")
    },
    shipment: {
      pickup: formData.get("origin"),
      dropoff: formData.get("destination"),
      pickupDate: formData.get("pickupDate"),
      weight: formData.get("weightKg"),
      volume: formData.get("volumeM3"),
      commodity: formData.get("cargoType")
    }
  };

  const result = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.orders.unshift(result);
  state.selectedOrderId = result.id;
  renderOrders();
  renderQuote(result.id);
  showToast("Order created");
}

async function runQuote(orderId) {
  const result = await api(`/api/orders/${orderId}/quotes`, { method: "POST" });
  const existing = state.quotesByOrder.get(orderId) || [];
  state.quotesByOrder.set(orderId, [result.quote, ...existing]);
  renderQuote(orderId, result);
  renderMetrics();
  showToast("Quote generated");
}

function loadSample() {
  const sample = {
    customerName: "Acme Logistics",
    customerEmail: "ops@example.com",
    origin: "Phoenix",
    destination: "Los Angeles",
    pickupDate: "2026-07-16",
    cargoType: "electronics",
    weightKg: "2500",
    volumeM3: "12.5"
  };

  for (const [name, value] of Object.entries(sample)) {
    const input = elements.orderForm.elements[name];
    if (input) input.value = value;
  }
  showToast("Sample loaded");
}

elements.orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.orderForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await createOrder(new FormData(elements.orderForm));
    elements.orderForm.reset();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

elements.ordersList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  button.disabled = true;
  try {
    if (action === "select") renderQuote(id);
    if (action === "quote") await runQuote(id);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

elements.refreshButton.addEventListener("click", loadOrders);
elements.sampleButton.addEventListener("click", loadSample);

checkHealth();
checkFleetbase();
loadOrders();
