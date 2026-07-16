/**
 * Registration Service
 *
 * Handles the "no CSV phone match" path: a registration link (texted to
 * the caller) lets them submit their name/email/phone, which gets
 * attached to the order that was already created from their call, and
 * then retries delivery of the quote that was generated but held back
 * for lack of a recipient email.
 */

const registrationRepository = require("../db/repositories/registrationRepository");
const ordersRepository = require("../db/repositories/ordersRepository");
const deliveryService = require("./deliveryService");
const { env } = require("../config/env");

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

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

/**
 * @param {string} orderId - Order created from the caller's transcript.
 * @param {string} phone - Caller's phone number.
 * @returns {Promise<{token: string, link: string}>}
 */
async function createRegistrationLink(orderId, phone) {
  const registration = await registrationRepository.createRegistration({ orderId, phone });
  const base = (env.twilio.webhookUrl || "").replace(/\/$/, "");
  return { token: registration.token, link: `${base}/register/${registration.token}` };
}

async function getRegistration(token) {
  const registration = await registrationRepository.findByToken(token);
  if (!registration) {
    throw notFound("Registration link not found or expired");
  }
  return registration;
}

/**
 * @param {string} token
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.phone
 * @returns {Promise<{orderId: string, delivery: Object|null}>}
 */
async function completeRegistration(token, { name, email, phone }) {
  const registration = await getRegistration(token);

  if (registration.status === "completed") {
    throw conflict("This registration link has already been used");
  }

  if (!name || !email || !phone) {
    throw badRequest("Name, email, and phone are required");
  }

  await ordersRepository.updateOrder(registration.orderId, {
    customerName: name,
    customerEmail: email
  });

  await registrationRepository.markCompleted(token);

  let delivery = null;
  try {
    delivery = await deliveryService.retryDelivery(registration.orderId);
  } catch (error) {
    console.error("Failed to send quote after registration:", error.message);
  }

  return { orderId: registration.orderId, delivery };
}

module.exports = {
  createRegistrationLink,
  getRegistration,
  completeRegistration
};
