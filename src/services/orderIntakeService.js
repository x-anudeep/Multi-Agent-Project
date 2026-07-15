/**
 * Order Intake Service
 * 
 * Orchestrates the flow from captured data (email/transcript) through
 * triage validation to order creation with deduplication.
 */

const { triage } = require("./agentService");
const { createOrder } = require("./orderService");
const { normalizeShipment, validateNormalizedShipment } = require("./shipmentNormalizer");
const { getPool } = require("../db/pool");

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
    const triageResult = await triage({
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
      console.log("Triage validation failed or low confidence. Flagging for manual review.");

      // Store for manual review
      const reviewRecord = {
        source,
        rawText: text,
        triageResult,
        metadata,
        timestamp: new Date().toISOString(),
        status: "requires_review",
        reason: triageResult.triage?.valid ? "low_confidence" : "invalid_extraction"
      };

      // TODO: Store in review queue table
      console.log("Stored for manual review:", reviewRecord);

      return {
        success: false,
        status: "requires_review",
        reason: reviewRecord.reason,
        triageResult
      };
    }

    // Step 3: Extract normalized shipment from triage result
    console.log("Step 3: Extracting normalized shipment data...");
    const shipmentData = extractShipmentFromTriage(triageResult);

    if (!shipmentData) {
      return {
        success: false,
        status: "extraction_failed",
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
    const orderResult = await createOrder({
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

    return {
      success: true,
      status: "order_created",
      orderId: orderResult.id,
      order: orderResult,
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
    const shipmentData = {};

    // The triage result should have extracted fields in the triage object
    if (triageResult.triage) {
      // Map common field names from triage result
      shipmentData.customerName = triageResult.triage.customerName || triageResult.triage.company;
      shipmentData.pickup = triageResult.triage.pickup || triageResult.triage.origin;
      shipmentData.dropoff = triageResult.triage.dropoff || triageResult.triage.destination;
      shipmentData.pickupDate = triageResult.triage.pickupDate || triageResult.triage.date;
      shipmentData.weight = triageResult.triage.weight;
      shipmentData.volume = triageResult.triage.volume;
      shipmentData.commodity = triageResult.triage.commodity || triageResult.triage.cargoType;
    }

    // Validate that required fields are present
    const requiredFields = ["pickup", "dropoff", "weight", "volume"];
    const missingFields = requiredFields.filter((field) => !shipmentData[field]);

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
  try {
    const db = getPool();
    if (!db) {
      console.warn("Database not configured. Skipping duplicate check.");
      return null;
    }

    const customerEmail = metadata.email || metadata.senderEmail;
    const customerPhone = metadata.phone || metadata.callerPhone;

    if (!customerEmail && !customerPhone) {
      console.warn("No customer email or phone provided. Skipping duplicate check.");
      return null;
    }

    // Query for existing orders from same customer within 1 hour
    const oneHourAgo = new Date(Date.now() - 3600000);

    let query = `
      SELECT id FROM orders
      WHERE created_at > $1
    `;
    const params = [oneHourAgo];

    if (customerEmail) {
      query += ` AND customer_email = $${params.length + 1}`;
      params.push(customerEmail);
    } else if (customerPhone) {
      query += ` AND customer_phone = $${params.length + 1}`;
      params.push(customerPhone);
    }

    query += ` LIMIT 1`;

    const result = await db.query(query, params);

    if (result.rows.length > 0) {
      console.log("Duplicate found:", result.rows[0].id);
      return result.rows[0].id;
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
  checkForDuplicate
};
