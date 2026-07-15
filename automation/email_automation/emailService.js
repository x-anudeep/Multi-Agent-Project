/**
 * Email Delivery Service
 *
 * Sends quote PDFs to customers via Outlook SMTP using Nodemailer, with
 * retry (exponential backoff) for transient failures.
 */

const path = require("path");
const nodemailer = require("nodemailer");
const { env } = require("../../src/config/env");

const MAX_SEND_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;

let transporter = null;

function isConfigured() {
  return Boolean(env.smtp.user && env.smtp.password);
}

function getTransporter() {
  if (!transporter && isConfigured()) {
    transporter = nodemailer.createTransport({
      host: env.smtp.server,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.password
      }
    });
  }
  return transporter;
}

function buildEmailHtml({ order, quote }) {
  const greetingName = order.customerName && order.customerName !== "Unknown Customer"
    ? order.customerName
    : "there";

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #1a3d5c;">Your Shipment Quote</h2>
      <p>Hi ${greetingName},</p>
      <p>Thanks for reaching out. Here's the quote for your shipment from
        <strong>${order.origin || "-"}</strong> to <strong>${order.destination || "-"}</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Final price</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">
            ${quote.currency || "USD"} ${Number(quote.finalPrice || 0).toFixed(2)}
          </td>
        </tr>
      </table>
      <p>The full breakdown and terms are in the attached PDF.</p>
      <p style="margin-top: 24px;">
        <a href="mailto:${env.smtp.user || ""}"
           style="background: #1a3d5c; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 4px;">
          Reply to Confirm Booking
        </a>
      </p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">
        Questions? Just reply to this email and our team will help.
      </p>
    </div>
  `;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a quote PDF to the customer via email, retrying on failure.
 * @param {Object} params
 * @param {Object} params.order - Order record (needs customerEmail, customerName, origin, destination)
 * @param {Object} params.quote - Quote record (needs finalPrice, currency)
 * @param {string} params.pdfPath - Path to the generated quote PDF
 * @returns {Promise<Object>} Delivery result
 */
async function sendQuoteEmail({ order, quote, pdfPath }) {
  if (!order.customerEmail) {
    return { success: false, skipped: true, reason: "Order has no customer email address" };
  }

  const client = getTransporter();
  if (!client) {
    return { success: false, skipped: true, reason: "SMTP credentials are not configured" };
  }

  const subject = `Your Shipment Quote: ${order.origin || "-"} to ${order.destination || "-"}`;
  const mailOptions = {
    from: env.smtp.user,
    to: order.customerEmail,
    subject,
    html: buildEmailHtml({ order, quote }),
    attachments: [
      {
        filename: path.basename(pdfPath),
        path: pdfPath
      }
    ]
  };

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      const info = await client.sendMail(mailOptions);
      return { success: true, subject, attempt, messageId: info.messageId };
    } catch (error) {
      lastError = error;
      console.error(`Email send attempt ${attempt} failed:`, error.message);
      if (attempt < MAX_SEND_ATTEMPTS) {
        await delay(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  return { success: false, subject, attempts: MAX_SEND_ATTEMPTS, error: lastError?.message };
}

module.exports = { sendQuoteEmail, isConfigured };
