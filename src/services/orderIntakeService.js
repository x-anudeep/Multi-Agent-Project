/**
 * Order Intake Service
 *
 * Orchestrates the flow from captured data (email/transcript) through
 * triage validation to order creation with deduplication. Per the
 * project handoff, this calls Person 1's backend through its own HTTP
 * API (POST /api/agents/triage, POST /api/orders) rather than importing
 * the service functions directly, treating those endpoints as the
 * integration boundary.
 */

const ordersRepository = require("../db/repositories/ordersRepository");
const reviewQueueRepository = require("../db/repositories/reviewQueueRepository");
const { env } = require("../config/env");

// Overridable so tests (which bind the app to an OS-assigned ephemeral
// port) can point this at their own instance instead of env.port.
let apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${env.port}`;

function setApiBaseUrl(url) {
  apiBaseUrl = url;
}

async function callApi(path, payload) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error?.message || `Request to ${path} failed`);
    error.status = response.status;
    throw error;
  }

  return body.data;
}

/**
 * Persist a low-confidence/failed extraction to the manual review queue
 * @param {Object} params
 * @returns {Promise<Object>} The created review queue entry
 */
async function flagForReview({ source, text, triageResult, metadata, reason }) {
  console.log(`Flagging intake for manual review (${reason}).`);

  const entry = await reviewQueueRepository.createReviewEntry({
    reviewType: "extraction_validation",
    reason,
    rawData: { source, text, metadata },
    triageResult,
    status: "pending"
  });

  console.log("Stored in review queue:", { reviewId: entry.id, reason });
  return entry;
}

/**
 * Process transcript/email through triage and create order if valid
 * @param {Object} input - Intake data
 * @param {string} input.text - Transcript or email body text
 * @param {string} input.source - Source type: "twilio_voice" or "outlook_imap"
 * @param {Object} input.metadata - Additional metadata (caller phone, sender email, etc.)
 * @returns {Promise<Object>} Order creation result with triage info
 */
async function processIntake(input) {
  const { text, source, metadata = {} } = input;

  console.log("Processing intake:", {
    source,
    textLength: text.length,
    metadata: Object.keys(metadata)
  });

  try {
    // Step 1: Run triage to validate shipment extraction
    console.log("Step 1: Running triage validation...");
    const triageResult = await callApi("/api/agents/triage", {
      transcript: text,
      source
    });

    console.log("Triage result:", {
      valid: triageResult.triage?.valid,
      confidence: triageResult.triage?.confidence,
      missingFields: triageResult.triage?.missingFields
    });

    // Step 2: Check if triage extracted valid shipment
    if (!triageResult.triage?.valid || triageResult.triage?.confidence < 0.6) {
      const reason = triageResult.triage?.valid ? "low_confidence" : "invalid_extraction";
      const reviewEntry = await flagForReview({ source, text, triageResult, metadata, reason });

      return {
        success: false,
        status: "requires_review",
        reason,
        reviewId: reviewEntry.id,
        triageResult
      };
    }

    // Step 3: Extract normalized shipment from triage result
    console.log("Step 3: Extracting normalized shipment data...");
    const shipmentData = extractShipmentFromTriage(triageResult);

    if (!shipmentData) {
      const reviewEntry = await flagForReview({
        source,
        text,
        triageResult,
        metadata,
        reason: "extraction_failed"
      });

      return {
        success: false,
        status: "extraction_failed",
        reviewId: reviewEntry.id,
        triageResult
      };
    }

    // Step 4: Check for duplicates
    console.log("Step 4: Checking for duplicate orders...");
    const isDuplicate = await checkForDuplicate(shipmentData, source, metadata);

    if (isDuplicate) {
      console.log("Duplicate order detected. Skipping creation.");
      return {
        success: false,
        status: "duplicate",
        duplicateOrderId: isDuplicate,
        triageResult,
        shipmentData
      };
    }

    // Step 5: Create order
    console.log("Step 5: Creating order...");
    const orderResult = await callApi("/api/orders", {
      customer: {
        name: shipmentData.customerName || "Unknown Customer",
        email: metadata.email || metadata.senderEmail || ""
      },
      shipment: {
        pickup: shipmentData.pickup || "",
        dropoff: shipmentData.dropoff || "",
        pickupDate: shipmentData.pickupDate || new Date().toISOString().split("T")[0],
        weight: shipmentData.weight ? `${shipmentData.weight} kg` : "",
        volume: shipmentData.volume ? `${shipmentData.volume} m3` : "",
        commodity: shipmentData.commodity || ""
      },
      metadata: {
        source,
        ...metadata,
        triageConfidence: triageResult.triage?.confidence
      }
    });

    console.log("Order created successfully:", {
      orderId: orderResult.id,
      status: orderResult.status
    });

    // Step 6: Automatically generate a quote (quoteService sends the PDF/
    // email itself if it comes out approved; a review-flagged quote is left
    // for a human). A failure here (e.g. unsupported route) shouldn't fail
    // the intake overall -- the order was already created successfully.
    let quoteResult = null;
    try {
      console.log("Step 6: Generating quote...");
      quoteResult = await callApi(`/api/orders/${orderResult.id}/quotes`, {});
      console.log("Quote generated:", {
        quoteId: quoteResult.quote?.id,
        status: quoteResult.quote?.status,
        deliveryStatus: quoteResult.delivery?.deliveryLog?.status
      });
    } catch (error) {
      console.error("Automatic quote generation failed:", error.message);
    }

    return {
      success: true,
      status: "order_created",
      orderId: orderResult.id,
      order: orderResult,
      quoteResult,
      triageResult,
      shipmentData
    };
  } catch (error) {
    console.error("Error processing intake:", error);
    throw error;
  }
}

/**
 * Extract normalized shipment data from triage result
 * @param {Object} triageResult - Result from triage agent
 * @returns {Object|null} Extracted shipment data or null
 */
function extractShipmentFromTriage(triageResult) {
  try {
    // The triage agent's actual output nests extracted fields under
    // normalizedShipment (see src/agents/triageAgent.js), not directly on triage.
    const normalized = triageResult.triage?.normalizedShipment;
    if (!normalized) {
      console.warn("Triage result has no normalizedShipment to extract from.");
      return null;
    }

    const shipmentData = {
      customerName: normalized.customerName,
      pickup: normalized.origin,
      dropoff: normalized.destination,
      pickupDate: normalized.pickupDate,
      weight: normalized.weightKg,
      volume: normalized.volumeM3,
      commodity: normalized.cargoType
    };

    // Mirrors shipmentNormalizer's validation: weight OR volume is enough.
    const missingFields = [];
    if (!shipmentData.pickup) missingFields.push("pickup");
    if (!shipmentData.dropoff) missingFields.push("dropoff");
    if (!shipmentData.weight && !shipmentData.volume) missingFields.push("weight or volume");

    if (missingFields.length > 0) {
      console.warn("Missing required fields:", missingFields);
      return null;
    }

    return shipmentData;
  } catch (error) {
    console.error("Error extracting shipment from triage:", error);
    return null;
  }
}

/**
 * Check if order is duplicate (same customer + date within 1 hour)
 * @param {Object} shipmentData - Extracted shipment data
 * @param {string} source - Intake source
 * @param {Object} metadata - Metadata with email/phone
 * @returns {Promise<string|null>} Existing order ID or null
 */
async function checkForDuplicate(shipmentData, source, metadata) {
  if (env.disableDuplicateCheck) {
    console.warn("Duplicate check disabled via DISABLE_DUPLICATE_CHECK. Skipping.");
    return null;
  }

  try {
    const customerEmail = metadata.email || metadata.senderEmail;
    const customerPhone = metadata.phone || metadata.callerPhone;

    if (!customerEmail && !customerPhone) {
      console.warn("No customer email or phone provided. Skipping duplicate check.");
      return null;
    }

    // shipmentNormalizer doesn't persist a top-level phone column, so phone
    // matching reads it back out of rawRequest.metadata instead.
    const oneHourAgo = Date.now() - 3600000;
    const orders = await ordersRepository.listOrders();

    const duplicate = orders.find((order) => {
      if (new Date(order.createdAt).getTime() <= oneHourAgo) return false;

      if (customerEmail && order.customerEmail === customerEmail) return true;

      const orderPhone = order.rawRequest?.metadata?.callerPhone || order.rawRequest?.metadata?.phone;
      return Boolean(customerPhone) && orderPhone === customerPhone;
    });

    if (duplicate) {
      console.log("Duplicate found:", duplicate.id);
      return duplicate.id;
    }

    return null;
  } catch (error) {
    console.error("Error checking for duplicates:", error);
    // Return null on error to allow order creation (fail open)
    return null;
  }
}

/**
 * Process email data for order creation
 * @param {Object} emailData - Email parsed data
 * @returns {Promise<Object>} Processing result
 */
async function processEmail(emailData) {
  console.log("Processing email intake...");

  const { text, html, from, subject, timestamp } = emailData;
  const emailText = text || html || "";

  // Extract customer email from sender
  const senderEmail = from?.split("<")[1]?.split(">")[0] || from || "";

  return processIntake({
    text: emailText,
    source: "outlook_imap",
    metadata: {
      email: senderEmail,
      senderEmail,
      subject,
      timestamp
    }
  });
}

/**
 * Process transcription data for order creation
 * @param {Object} transcriptionData - Whisper transcription result
 * @returns {Promise<Object>} Processing result
 */
async function processTranscription(transcriptionData) {
  console.log("Processing transcription intake...");

  const { cleanedTranscript, callerPhone, timestamp } = transcriptionData;

  return processIntake({
    text: cleanedTranscript,
    source: "twilio_voice",
    metadata: {
      phone: callerPhone,
      callerPhone,
      timestamp
    }
  });
}

module.exports = {
  processIntake,
  processEmail,
  processTranscription,
  extractShipmentFromTriage,
  checkForDuplicate,
  setApiBaseUrl
};
