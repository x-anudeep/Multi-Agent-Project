/**
 * Customer Lookup Service
 *
 * Matches an inbound caller's phone number against a CSV of known
 * customers (phone,email,name) so their quote can be emailed directly
 * without a registration round-trip.
 */

const fs = require("fs");
const path = require("path");
const { env } = require("../config/env");

let cache = null; // { mtimeMs, byPhone: Map<normalizedPhone, {phone,email,name}> }

/**
 * Normalize a phone number to its last 10 digits so "+15551234567",
 * "15551234567", and "555-123-4567" all compare equal.
 */
function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-10);
}

function loadCsv() {
  const csvPath = path.resolve(env.customerLookup.csvPath);
  const stat = fs.statSync(csvPath);

  if (cache && cache.mtimeMs === stat.mtimeMs) {
    return cache.byPhone;
  }

  const lines = fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const [headerLine, ...rows] = lines;
  const columns = (headerLine || "").split(",").map((col) => col.trim().toLowerCase());
  const phoneIdx = columns.indexOf("phone");
  const emailIdx = columns.indexOf("email");
  const nameIdx = columns.indexOf("name");

  const byPhone = new Map();
  for (const row of rows) {
    const cells = row.split(",").map((cell) => cell.trim());
    const normalizedPhone = normalizePhone(cells[phoneIdx]);
    if (!normalizedPhone) continue;

    byPhone.set(normalizedPhone, {
      phone: cells[phoneIdx] || "",
      email: cells[emailIdx] || "",
      name: cells[nameIdx] || ""
    });
  }

  cache = { mtimeMs: stat.mtimeMs, byPhone };
  return byPhone;
}

/**
 * @param {string} phone - Caller's phone number (any format).
 * @returns {{phone: string, email: string, name: string}|null}
 */
function findByPhone(phone) {
  try {
    const byPhone = loadCsv();
    return byPhone.get(normalizePhone(phone)) || null;
  } catch (error) {
    console.error("customerLookupService: failed to read customer CSV:", error.message);
    return null;
  }
}

module.exports = { findByPhone };
