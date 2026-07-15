/**
 * Delivery Service
 *
 * Orchestrates turning an approved quote into a PDF, emailing it to the
 * customer, and recording the outcome in delivery_logs.
 */

const { generateQuotePdf } = require("../../automation/pdf_quotes/quotePdfGenerator");
const { sendQuoteEmail } = require("../../automation/email_automation/emailService");
const ordersRepository = require("../db/repositories/ordersRepository");
const deliveryRepository = require("../db/repositories/deliveryRepository");
const { getOrder } = require("./orderService");

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

async function getOrderAndQuote(orderId, quoteId) {
  const order = await getOrder(orderId);
  const quote = await ordersRepository.findQuoteById(quoteId);

  if (!quote || quote.orderId !== orderId) {
    throw notFound(`Quote ${quoteId} not found for order ${orderId}`);
  }

  return { order, quote };
}

/**
 * Generate the quote PDF, email it to the customer, and log the attempt.
 * Refuses quotes that quoteReviewAgent flagged as requires_manual_review —
 * those must go through POST .../quotes/:quoteId/review/approve first.
 * @param {string} orderId
 * @param {string} quoteId
 * @returns {Promise<Object>} { deliveryLog, emailResult, pdfPath }
 */
async function sendQuotePdf(orderId, quoteId) {
  const { order, quote } = await getOrderAndQuote(orderId, quoteId);

  if (quote.status !== "approved") {
    throw conflict(
      `Quote ${quoteId} has status "${quote.status}" and cannot be emailed automatically. ` +
        "Approve it first via POST .../quotes/:quoteId/review/approve."
    );
  }

  const { filePath, fileName } = await generateQuotePdf({ order, quote });
  const subject = `Your Shipment Quote: ${order.origin || "-"} to ${order.destination || "-"}`;

  const deliveryLog = await deliveryRepository.createDeliveryLog({
    orderId,
    quoteId,
    recipientEmail: order.customerEmail || "",
    deliveryType: "email",
    subject,
    status: "pending",
    metadata: { pdfPath: filePath, fileName }
  });

  const emailResult = await sendQuoteEmail({ order, quote, pdfPath: filePath });
  const now = new Date().toISOString();

  const updated = await deliveryRepository.updateDeliveryLog(deliveryLog.id, {
    status: emailResult.success ? "delivered" : emailResult.skipped ? "skipped" : "failed",
    attemptCount: (deliveryLog.attemptCount || 0) + 1,
    lastAttemptAt: now,
    lastError: emailResult.success ? null : emailResult.reason || emailResult.error || null,
    deliveredAt: emailResult.success ? now : null,
    // Persisted so a later customer reply can be matched back to this
    // quote via its In-Reply-To/References header.
    metadata: {
      ...deliveryLog.metadata,
      ...(emailResult.messageId ? { sentMessageId: emailResult.messageId } : {})
    }
  });

  return { deliveryLog: updated, emailResult, pdfPath: filePath };
}

/**
 * List all delivery attempts logged for an order.
 * @param {string} orderId
 * @returns {Promise<Array>}
 */
async function getDeliveryStatus(orderId) {
  await getOrder(orderId);
  return deliveryRepository.listDeliveryLogsForOrder(orderId);
}

/**
 * Retry the most recent (non-delivered) delivery attempt for an order.
 * @param {string} orderId
 * @returns {Promise<Object>} Same shape as sendQuotePdf
 */
async function retryDelivery(orderId) {
  const logs = await deliveryRepository.listDeliveryLogsForOrder(orderId);
  const lastAttempt = logs.find((log) => log.status !== "delivered");

  if (!lastAttempt) {
    throw notFound(`No retryable delivery attempt found for order ${orderId}`);
  }

  return sendQuotePdf(orderId, lastAttempt.quoteId);
}

module.exports = {
  sendQuotePdf,
  getDeliveryStatus,
  retryDelivery
};
