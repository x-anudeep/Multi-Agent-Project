/**
 * Quote PDF Generator
 *
 * Renders a shipment quote (order + quote) into a professional PDF using
 * PDFKit and saves it to PDF_OUTPUT_DIR.
 */

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { env } = require("../../src/config/env");

const BRAND_COLOR = "#1a3d5c";
const MUTED_COLOR = "#6b7280";

function ensureOutputDir() {
  const dir = path.resolve(env.pdf.outputDir || "./quotes");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function formatCurrency(amount, currency) {
  const value = Number(amount || 0);
  return `${currency || "USD"} ${value.toFixed(2)}`;
}

const STATUS_COLORS = {
  approved: "#15803d",
  requires_manual_review: "#b45309",
  rejected: "#b91c1c"
};

function formatStatusLabel(status) {
  return String(status || "draft").replace(/_/g, " ").toUpperCase();
}

function drawHeader(doc, order, quote) {
  const logoPath = env.pdf.logoPath && path.resolve(env.pdf.logoPath);
  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 45, { width: 90 });
    doc.fontSize(20).fillColor(BRAND_COLOR).text("Shipment Quote", 160, 50);
  } else {
    doc.fontSize(20).fillColor(BRAND_COLOR).text("Shipment Quote", 50, 50);
  }

  doc
    .fontSize(10)
    .fillColor(STATUS_COLORS[quote.status] || MUTED_COLOR)
    .text(`Status: ${formatStatusLabel(quote.status)}`, 400, 52, { width: 145, align: "right" });

  doc
    .fontSize(10)
    .fillColor(MUTED_COLOR)
    .text(`Order ID: ${order.id}`, 50, 90)
    .text(`Date: ${new Date().toLocaleDateString("en-US")}`, 50, 104);

  doc.moveTo(50, 130).lineTo(545, 130).strokeColor("#e5e7eb").stroke();
}

function drawCustomerAndShipment(doc, order) {
  doc.fillColor("#111827").fontSize(12).text("Customer", 50, 150, { underline: true });
  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(order.customerName || "Unknown Customer", 50, 168)
    .text(order.customerEmail || "-", 50, 182);

  doc.fillColor("#111827").fontSize(12).text("Shipment", 300, 150, { underline: true });
  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(`From: ${order.origin || "-"}`, 300, 168)
    .text(`To: ${order.destination || "-"}`, 300, 182)
    .text(`Pickup: ${order.pickupDate || "-"}`, 300, 196)
    .text(`Weight: ${order.weightKg ? `${order.weightKg} kg` : "-"}`, 300, 210)
    .text(`Volume: ${order.volumeM3 ? `${order.volumeM3} m3` : "-"}`, 300, 224)
    .text(`Cargo: ${order.cargoType || "-"}`, 300, 238);
}

function drawPricingTable(doc, quote) {
  const startY = 280;
  doc.fillColor("#111827").fontSize(12).text("Pricing Breakdown", 50, startY, { underline: true });

  const rows = [
    ["Base price", formatCurrency(quote.basePrice, quote.currency)],
    ["Discount", `-${formatCurrency(quote.discountAmount, quote.currency)}`],
    ["Final price", formatCurrency(quote.finalPrice, quote.currency)]
  ];

  let y = startY + 24;
  rows.forEach(([label, value], index) => {
    const isTotal = index === rows.length - 1;
    doc
      .fontSize(isTotal ? 12 : 10)
      .fillColor(isTotal ? BRAND_COLOR : "#374151")
      .text(label, 50, y, { continued: false })
      .text(value, 400, y, { width: 145, align: "right" });
    y += isTotal ? 22 : 18;
  });

  doc.moveTo(50, y + 6).lineTo(545, y + 6).strokeColor("#e5e7eb").stroke();
  return y + 24;
}

function drawTermsAndFooter(doc, y) {
  doc.fillColor("#111827").fontSize(12).text("Terms & Conditions", 50, y, { underline: true });
  doc
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text(
      "This quote is valid for 7 days from the date of issue. Final pricing is subject to " +
        "confirmation of shipment weight, volume, and route capacity at pickup. Payment terms " +
        "are net 15 days from delivery unless otherwise agreed in writing.",
      50,
      y + 18,
      { width: 495 }
    );

  doc
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text("Questions? Contact our shipping center for support.", 50, 760, { width: 495, align: "center" });
}

/**
 * Generate a quote PDF and save it to disk.
 * @param {Object} params
 * @param {Object} params.order - Order record
 * @param {Object} params.quote - Quote record
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
async function generateQuotePdf({ order, quote }) {
  if (!order || !quote) {
    throw new Error("generateQuotePdf requires both an order and a quote");
  }

  const outputDir = ensureOutputDir();
  const fileName = `quote-${quote.id}.pdf`;
  const filePath = path.join(outputDir, fileName);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const writeStream = fs.createWriteStream(filePath);

  const finished = new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  doc.pipe(writeStream);

  drawHeader(doc, order, quote);
  drawCustomerAndShipment(doc, order);
  const afterPricingY = drawPricingTable(doc, quote);
  drawTermsAndFooter(doc, afterPricingY);

  doc.end();
  await finished;

  return { filePath, fileName };
}

module.exports = { generateQuotePdf };
