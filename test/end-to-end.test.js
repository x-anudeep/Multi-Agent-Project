/**
 * End-to-end tests for the Person 2 automation layer: phone-to-order,
 * email-to-order, order-to-Fleetbase, quote-to-PDF, and PDF-to-email,
 * plus deduplication and manual review workflows.
 *
 * Runs against a live instance of the real Express app (ephemeral port,
 * in-memory repositories since DATABASE_URL isn't set in test envs).
 * Fleetbase is left as whatever .env has (its client already no-ops
 * without a real key); LLM extraction and SMTP are force-disabled for
 * this whole file in test.before() regardless of .env, so these tests
 * exercise the graceful-skip paths deterministically and never dispatch
 * a real email, even when real credentials are configured for live use.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { createApp } = require("../src/app");
const orderIntakeService = require("../src/services/orderIntakeService");
const registrationService = require("../src/services/registrationService");
const { env } = require("../src/config/env");

let server;
let baseUrl;

// Force every intake path's auto-quote-generation to hit the deterministic
// heuristic extractor and the "SMTP not configured" skip path for this
// entire file, regardless of real credentials sitting in .env for live
// demo use. emailService caches its transporter in a module-level variable
// the first time it's created, so overriding this per-test would be too
// late once any earlier test in the file has already triggered a real send.
const savedEnv = {};

test.before(() => {
  savedEnv.openaiKey = env.openai.apiKey;
  savedEnv.groqKey = env.groq.apiKey;
  savedEnv.smtpUser = env.smtp.user;
  savedEnv.smtpPassword = env.smtp.password;
  savedEnv.twilioAccountSid = env.twilio.accountSid;
  savedEnv.twilioAuthToken = env.twilio.authToken;
  savedEnv.customerCsvPath = env.customerLookup.csvPath;
  env.openai.apiKey = "";
  env.groq.apiKey = "";
  env.smtp.user = "";
  env.smtp.password = "";
  // smsService caches its Twilio client in a module-level variable the first
  // time it's created (same caveat as emailService's transporter above), so
  // this must be forced off before any test can trigger a real SMS send.
  env.twilio.accountSid = "";
  env.twilio.authToken = "";
  // data/customers.csv is gitignored (real customer data, populated locally);
  // tests use the always-committed dummy template instead.
  env.customerLookup.csvPath = "data/customers.example.csv";

  const app = createApp();
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
  // orderIntakeService calls the app's own HTTP API (not a direct function
  // call), so it needs to know this test instance's ephemeral port.
  orderIntakeService.setApiBaseUrl(baseUrl);
});

test.after(() => {
  server.close();
  env.openai.apiKey = savedEnv.openaiKey;
  env.groq.apiKey = savedEnv.groqKey;
  env.smtp.user = savedEnv.smtpUser;
  env.smtp.password = savedEnv.smtpPassword;
  env.twilio.accountSid = savedEnv.twilioAccountSid;
  env.twilio.authToken = savedEnv.twilioAuthToken;
  env.customerLookup.csvPath = savedEnv.customerCsvPath;
});

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { status: response.status, body };
}

async function apiForm(path, form) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString()
  });
  return { status: response.status, text: await response.text() };
}

// The voice webhook responds to Twilio immediately and creates the order
// asynchronously afterward (a caller shouldn't wait on hold for an LLM
// call), so tests must poll rather than check once right after the response.
async function waitFor(checkFn, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

test("phone-to-order: Gather speech intake creates an order", async () => {
  const callSid = "CA-e2e-phone-1";
  const from = "+15550001111";

  const greeting = await apiForm("/api/integrations/twilio/voice-webhook", {
    From: from,
    To: "+15559998888",
    CallSid: callSid
  });
  assert.equal(greeting.status, 200);
  assert.match(greeting.text, /<Gather/);

  const speech = await apiForm("/api/integrations/twilio/speech-result", {
    SpeechResult: "Pick up 500 kg from Chicago to Denver",
    Confidence: "0.9",
    CallSid: callSid,
    From: from
  });
  assert.equal(speech.status, 200);
  assert.match(speech.text, /<Hangup/);

  const created = await waitFor(async () => {
    const { body: orders } = await api("/api/orders");
    return orders.data.find((order) => order.customerPhone === from || order.rawRequest?.metadata?.callerPhone === from);
  });
  assert.ok(created, "expected an order created from the phone call");
  assert.equal(created.origin, "Chicago");
  assert.equal(created.destination, "Denver");
  assert.equal(created.weightKg, 500);
});

test("phone-match: caller found in the customer CSV gets their order emailed automatically", async () => {
  const callSid = "CA-e2e-phone-match-1";
  const from = "+15551234567"; // matches data/customers.example.csv -> jane.doe@example.com

  await apiForm("/api/integrations/twilio/voice-webhook", {
    From: from,
    To: "+15559998888",
    CallSid: callSid
  });

  await apiForm("/api/integrations/twilio/speech-result", {
    SpeechResult: "Pick up 800 kg from Phoenix to Los Angeles",
    Confidence: "0.9",
    CallSid: callSid,
    From: from
  });

  const created = await waitFor(async () => {
    const { body: orders } = await api("/api/orders");
    return orders.data.find((order) => order.rawRequest?.metadata?.callerPhone === from);
  });

  assert.ok(created, "expected an order created from the phone call");
  assert.equal(created.customerEmail, "jane.doe@example.com");
  assert.equal(created.customerName, "Jane Doe");
});

test("phone-no-match + registration: caller not in the CSV completes a link and the held quote sends", async () => {
  const callSid = "CA-e2e-phone-no-match-1";
  const from = "+15550002222"; // not in data/customers.example.csv

  await apiForm("/api/integrations/twilio/voice-webhook", {
    From: from,
    To: "+15559998888",
    CallSid: callSid
  });

  await apiForm("/api/integrations/twilio/speech-result", {
    SpeechResult: "Pick up 900 kg from Phoenix to Denver",
    Confidence: "0.9",
    CallSid: callSid,
    From: from
  });

  const created = await waitFor(async () => {
    const { body: orders } = await api("/api/orders");
    return orders.data.find((order) => order.rawRequest?.metadata?.callerPhone === from);
  });

  assert.ok(created, "expected an order created from the phone call");
  assert.equal(created.customerEmail, "", "unmatched caller's order shouldn't have an email yet");

  // Registration link is normally texted to the caller; the SMS itself is
  // skipped in tests (Twilio creds forced off above), so create the link
  // directly the same way the SMS body would have pointed to it.
  const { token } = await registrationService.createRegistrationLink(created.id, from);

  const { status, body: registerBody } = await api(`/api/registration/${token}`, {
    method: "POST",
    body: JSON.stringify({ name: "Austin Caller", email: "e2e-registered@example.com", phone: from })
  });
  assert.equal(status, 200);
  assert.equal(registerBody.data.orderId, created.id);
  assert.ok(registerBody.data.delivery, "expected registration to retry the held delivery");
  assert.equal(registerBody.data.delivery.emailResult.skipped, true); // SMTP forced unconfigured for this whole file

  const { body: updatedOrder } = await api(`/api/orders/${created.id}`);
  assert.equal(updatedOrder.data.customerEmail, "e2e-registered@example.com");
  assert.equal(updatedOrder.data.customerName, "Austin Caller");

  const reuseAttempt = await api(`/api/registration/${token}`, {
    method: "POST",
    body: JSON.stringify({ name: "Austin Caller", email: "e2e-registered@example.com", phone: from })
  });
  assert.equal(reuseAttempt.status, 409);
});

test("email-to-order: complete email creates an order", async () => {
  const { status, body } = await api("/api/intake/email", {
    method: "POST",
    body: JSON.stringify({
      from: "e2e-email-test@example.com",
      subject: "Shipment request",
      text: "Customer: E2E Freight. Pickup Dallas to Atlanta with 2000 kg and 10 m3 cargo: furniture. Email e2e-email-test@example.com"
    })
  });

  assert.equal(status, 201);
  // /api/intake/email returns the intake result directly (no {data} wrapper),
  // unlike the ordersController/quotesController endpoints.
  assert.equal(body.success, true);
  assert.equal(body.status, "order_created");
  assert.ok(body.orderId);
});

test("deduplication: repeat email intake within the window is rejected", async () => {
  const payload = {
    from: "e2e-dedup@example.com",
    subject: "Shipment request",
    text: "Customer: Dedup Test. Pickup Phoenix to Denver with 1000 kg and 5 m3 cargo: electronics. Email e2e-dedup@example.com"
  };

  const first = await api("/api/intake/email", { method: "POST", body: JSON.stringify(payload) });
  assert.equal(first.body.status, "order_created");

  const second = await api("/api/intake/email", { method: "POST", body: JSON.stringify(payload) });
  assert.equal(second.body.success, false);
  assert.equal(second.body.status, "duplicate");
  assert.equal(second.body.duplicateOrderId, first.body.orderId);
});

test("order-to-Fleetbase: order creation degrades gracefully without Fleetbase configured", async () => {
  const { status, body } = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Fleetbase Skip Test", email: "e2e-fleetbase@example.com" },
      shipment: {
        pickup: "Phoenix",
        dropoff: "Los Angeles",
        pickupDate: "2026-07-16",
        weight: "1000 kg",
        volume: "6 m3",
        commodity: "general"
      }
    })
  });

  assert.equal(status, 201);
  // FLEETBASE_API_KEY is unset/"replace-me" in test envs, so fleetbaseClient
  // skips the sync and the order stays in its pre-Fleetbase status.
  assert.equal(body.data.status, "normalized");
  assert.ok(!body.data.fleetbaseOrderId);
});

test("quote-to-PDF-to-email: approved quote auto-generates a PDF and logs a delivery attempt", async () => {
  const { body: orderBody } = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "PDF Test Co", email: "e2e-pdf-test@example.com" },
      shipment: {
        pickup: "Phoenix",
        dropoff: "Los Angeles",
        pickupDate: "2026-07-16",
        weight: "1200 kg",
        volume: "8 m3",
        commodity: "electronics"
      }
    })
  });
  const orderId = orderBody.data.id;

  // Generating an approved quote now auto-sends the PDF/email itself
  // (quoteService.generateQuote), rather than requiring a separate send-pdf call.
  const { body: quoteBody } = await api(`/api/orders/${orderId}/quotes`, { method: "POST" });
  assert.equal(quoteBody.data.quote.status, "approved");

  const delivery = quoteBody.data.delivery;
  assert.ok(delivery, "expected quote generation to auto-trigger delivery");
  assert.ok(fs.existsSync(delivery.pdfPath), "expected the quote PDF to be written to disk");
  assert.ok(fs.statSync(delivery.pdfPath).size > 0);
  assert.equal(delivery.emailResult.skipped, true); // SMTP forced unconfigured for this whole file
  assert.equal(delivery.deliveryLog.status, "skipped");

  const { body: statusBody } = await api(`/api/orders/${orderId}/delivery-status`);
  assert.equal(statusBody.data.length, 1);
  assert.equal(statusBody.data[0].id, delivery.deliveryLog.id);

  fs.unlinkSync(delivery.pdfPath);
});

test("quote review: a manually rejected quote cannot be sent or re-approved", async () => {
  const { body: orderBody } = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Review Reject Co", email: "e2e-quote-reject@example.com" },
      shipment: {
        pickup: "Phoenix",
        dropoff: "Los Angeles",
        pickupDate: "2026-07-16",
        weight: "1200 kg",
        volume: "8 m3",
        commodity: "electronics"
      }
    })
  });
  const orderId = orderBody.data.id;

  const { body: quoteBody } = await api(`/api/orders/${orderId}/quotes`, { method: "POST" });
  const quoteId = quoteBody.data.quote.id;

  const { body: rejectBody } = await api(`/api/orders/${orderId}/quotes/${quoteId}/review/reject`, {
    method: "POST",
    body: JSON.stringify({ notes: "test rejection" })
  });
  assert.equal(rejectBody.data.status, "rejected");

  const sendAttempt = await api(`/api/orders/${orderId}/quotes/${quoteId}/send-pdf`, { method: "POST" });
  assert.equal(sendAttempt.status, 409);

  const approveAttempt = await api(`/api/orders/${orderId}/quotes/${quoteId}/review/approve`, { method: "POST" });
  assert.equal(approveAttempt.status, 400);
});

test("manual review workflow: low-confidence intake can be approved into an order", async () => {
  const { body: intakeBody } = await api("/api/intake/email", {
    method: "POST",
    body: JSON.stringify({
      from: "e2e-review@example.com",
      subject: "Vague request",
      text: "Hi, I might need a shipment sometime, not sure of details yet."
    })
  });

  assert.equal(intakeBody.success, false);
  assert.equal(intakeBody.status, "requires_review");
  const reviewId = intakeBody.reviewId;
  assert.ok(reviewId);

  const { body: queueBody } = await api("/api/orders/review-queue?status=pending");
  assert.ok(queueBody.data.some((entry) => entry.id === reviewId));

  const { status, body: approveBody } = await api(`/api/orders/review-queue/${reviewId}/approve`, {
    method: "POST",
    body: JSON.stringify({
      customerName: "Reviewed Customer",
      customerEmail: "e2e-review@example.com",
      pickup: "Dallas",
      dropoff: "Atlanta",
      weight: "1500 kg",
      volume: "7 m3",
      commodity: "general"
    })
  });

  assert.equal(status, 201);
  assert.equal(approveBody.data.reviewEntry.status, "approved");
  assert.equal(approveBody.data.reviewEntry.orderId, approveBody.data.order.id);
});

test("delivery retry: an order with no delivery attempts returns 404", async () => {
  const { body: orderBody } = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "No Delivery Yet", email: "e2e-no-delivery@example.com" },
      shipment: {
        pickup: "Dallas",
        dropoff: "Atlanta",
        pickupDate: "2026-07-16",
        weight: "500 kg",
        volume: "3 m3",
        commodity: "general"
      }
    })
  });

  const { status, body } = await api(`/api/orders/${orderBody.data.id}/delivery/retry`, { method: "POST" });
  assert.equal(status, 404);
  assert.match(body.error.message, /No retryable delivery attempt/);
});
