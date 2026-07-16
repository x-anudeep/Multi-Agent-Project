/**
 * Twilio SMS Service
 *
 * Texts a registration link to callers who couldn't be matched to a known
 * customer email. Mirrors emailService's "skip gracefully if unconfigured"
 * pattern instead of throwing, so an unconfigured Twilio SMS setup never
 * fails the call-intake flow.
 */

const twilio = require("twilio");
const { env } = require("../../src/config/env");

let client = null;

function getClient() {
  if (!client && env.twilio.accountSid && env.twilio.authToken) {
    client = twilio(env.twilio.accountSid, env.twilio.authToken);
  }
  return client;
}

/**
 * @param {Object} params
 * @param {string} params.to - Recipient phone number (E.164).
 * @param {string} params.link - Registration link to send.
 * @returns {Promise<Object>} { success, sid } or { success:false, skipped:true, reason }
 */
async function sendRegistrationSms({ to, link }) {
  const smsClient = getClient();
  if (!smsClient || !env.twilio.phoneNumber) {
    console.warn("Twilio SMS is not configured; skipping registration text to", to);
    return { success: false, skipped: true, reason: "Twilio SMS is not configured" };
  }

  try {
    const message = await smsClient.messages.create({
      to,
      from: env.twilio.phoneNumber,
      body: `Thanks for calling! To get your shipment quote by email, please register here: ${link}`
    });
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error("Failed to send registration SMS:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendRegistrationSms };
