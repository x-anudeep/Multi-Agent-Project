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
  toast: document.querySelector("#toast"),
  monitorOrderCount: document.querySelector("#monitorOrderCount"),
  monitorReviewPending: document.querySelector("#monitorReviewPending"),
  monitorDeliveredCount: document.querySelector("#monitorDeliveredCount"),
  monitorFailedCount: document.querySelector("#monitorFailedCount"),
  reviewQueueList: document.querySelector("#reviewQueueList"),
  reviewQueueCount: document.querySelector("#reviewQueueCount"),
  deliveryLogList: document.querySelector("#deliveryLogList"),
  deliveryLogCount: document.querySelector("#deliveryLogCount"),
  monitoringRefreshButton: document.querySelector("#monitoringRefreshButton")
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

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function truncate(text, max) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function renderReviewQueue(entries) {
  const pendingCount = entries.filter((entry) => entry.status === "pending").length;
  elements.reviewQueueCount.textContent = `${entries.length} entries`;
  elements.monitorReviewPending.textContent = pendingCount;

  if (!entries.length) {
    elements.reviewQueueList.className = "orders-list empty-state";
    elements.reviewQueueList.textContent = "No entries yet.";
    return;
  }

  elements.reviewQueueList.className = "orders-list";
  elements.reviewQueueList.innerHTML = entries
    .map((entry) => {
      const normalized = entry.triageResult?.triage?.normalizedShipment || {};
      const isPending = entry.status === "pending";

      return `
        <article class="order-row review-row" data-review-id="${entry.id}">
          <div>
            <strong>${entry.reason}</strong>
            <p>${truncate(entry.rawData?.text, 140)}</p>
            <p>Status: ${entry.status} / ${formatDate(entry.createdAt)}</p>
          </div>
          ${
            isPending
              ? `
            <div class="review-actions">
              <input class="mini-input" data-field="pickup" placeholder="Pickup" value="${normalized.origin || ""}">
              <input class="mini-input" data-field="dropoff" placeholder="Dropoff" value="${normalized.destination || ""}">
              <input class="mini-input" data-field="weight" placeholder="Weight, e.g. 500 kg">
              <input class="mini-input" data-field="volume" placeholder="Volume, e.g. 5 m3">
              <div class="row-actions">
                <button class="secondary-button" data-action="reject-review" data-id="${entry.id}" type="button">Reject</button>
                <button class="primary-button" data-action="approve-review" data-id="${entry.id}" type="button">Approve</button>
              </div>
            </div>
          `
              : `<span class="pill">${entry.status}</span>`
          }
        </article>
      `;
    })
    .join("");
}

function renderDeliveryLog(logs) {
  elements.deliveryLogCount.textContent = `${logs.length} entries`;
  elements.monitorDeliveredCount.textContent = logs.filter((log) => log.status === "delivered").length;
  elements.monitorFailedCount.textContent = logs.filter((log) => ["failed", "skipped"].includes(log.status)).length;

  if (!logs.length) {
    elements.deliveryLogList.className = "orders-list empty-state";
    elements.deliveryLogList.textContent = "No delivery attempts yet.";
    return;
  }

  elements.deliveryLogList.className = "orders-list";
  elements.deliveryLogList.innerHTML = logs
    .map(
      (log) => `
        <article class="order-row">
          <div>
            <strong>${log.subject || "Quote email"}</strong>
            <p>To: ${log.recipientEmail || "-"}</p>
            <p>Attempts: ${log.attemptCount} / ${formatDate(log.lastAttemptAt)}${log.lastError ? ` / ${log.lastError}` : ""}</p>
          </div>
          <span class="pill status-${log.status}">${log.status}</span>
        </article>
      `
    )
    .join("");
}

async function loadMonitoring() {
  elements.monitoringRefreshButton.disabled = true;
  try {
    const summary = await api("/api/dashboard/summary");
    elements.monitorOrderCount.textContent = summary.orders.total;
    renderReviewQueue(summary.reviewQueue.recent);
    renderDeliveryLog(summary.delivery.recent);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.monitoringRefreshButton.disabled = false;
  }
}

async function approveReviewEntry(reviewId, row) {
  const fields = {};
  row.querySelectorAll(".mini-input").forEach((input) => {
    fields[input.dataset.field] = input.value;
  });

  await api(`/api/orders/review-queue/${reviewId}/approve`, {
    method: "POST",
    body: JSON.stringify(fields)
  });
  showToast("Review approved, order created");
  await Promise.all([loadMonitoring(), loadOrders()]);
}

async function rejectReviewEntry(reviewId) {
  await api(`/api/orders/review-queue/${reviewId}/reject`, { method: "POST" });
  showToast("Review rejected");
  await loadMonitoring();
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

elements.reviewQueueList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  const row = button.closest(".review-row");
  button.disabled = true;
  try {
    if (action === "approve-review") await approveReviewEntry(id, row);
    if (action === "reject-review") await rejectReviewEntry(id);
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

elements.refreshButton.addEventListener("click", loadOrders);
elements.sampleButton.addEventListener("click", loadSample);
elements.monitoringRefreshButton.addEventListener("click", loadMonitoring);

checkHealth();
checkFleetbase();
loadOrders();
loadMonitoring();
