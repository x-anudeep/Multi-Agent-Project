/**
 * Quote Reply Service
 *
 * Matches an incoming email to a quote we previously sent (via the
 * In-Reply-To/References header against the Message-ID recorded when the
 * quote email was sent), classifies the reply, and acts on it: marks the
 * order customer_confirmed, or raises a review-queue ticket for a human
 * to handle a query. Returns null for emails that aren't a reply to any
 * tracked quote, so the caller can fall through to normal fresh intake.
 */

const deliveryRepository = require("../db/repositories/deliveryRepository");
const ordersRepository = require("../db/repositories/ordersRepository");
const reviewQueueRepository = require("../db/repositories/reviewQueueRepository");
const { classifyQuoteReply } = require("../agents/langchainAgentPipeline");

function extractReferencedMessageIds(emailData) {
  const ids = [];
  if (emailData.inReplyTo) ids.push(emailData.inReplyTo);

  if (Array.isArray(emailData.references)) {
    ids.push(...emailData.references);
  } else if (emailData.references) {
    ids.push(emailData.references);
  }

  return ids;
}

/**
 * If this email is a reply to a quote we sent, process it and return the
 * outcome. Otherwise returns null.
 * @param {Object} emailData - Parsed email, including inReplyTo/references
 * @returns {Promise<Object|null>}
 */
async function processIncomingEmail(emailData) {
  const candidateIds = extractReferencedMessageIds(emailData);
  if (candidateIds.length === 0) return null;

  let deliveryLog = null;
  for (const messageId of candidateIds) {
    deliveryLog = await deliveryRepository.findDeliveryLogBySentMessageId(messageId);
    if (deliveryLog) break;
  }

  if (!deliveryLog) return null;

  const replyText = emailData.text || emailData.html || "";
  const classification = await classifyQuoteReply(replyText);

  console.log("Quote reply matched:", {
    orderId: deliveryLog.orderId,
    quoteId: deliveryLog.quoteId,
    classification
  });

  if (classification === "confirmed") {
    const order = await ordersRepository.updateOrder(deliveryLog.orderId, {
      status: "customer_confirmed"
    });
    return { matched: true, classification, order };
  }

  const reviewEntry = await reviewQueueRepository.createReviewEntry({
    orderId: deliveryLog.orderId,
    reviewType: "customer_query",
    reason: "customer_query",
    rawData: {
      from: emailData.from,
      subject: emailData.subject,
      text: replyText,
      timestamp: emailData.timestamp
    },
    status: "pending"
  });

  return { matched: true, classification, reviewEntry };
}

module.exports = { processIncomingEmail };
