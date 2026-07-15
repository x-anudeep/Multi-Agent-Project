/**
 * Outlook IMAP Email Parser
 * 
 * Polls Outlook IMAP inbox for incoming emails, extracts shipment details,
 * deduplicates to prevent re-processing, and queues for order creation.
 */

const Imap = require("imap");
const { simpleParser } = require("mailparser");
const { env } = require("../../src/config/env");

let imapConnection = null;
let pollingInterval = null;

/**
 * Initialize IMAP connection
 */
function initializeImap() {
  if (imapConnection) {
    return imapConnection;
  }

  imapConnection = new Imap({
    user: env.imap.email,
    password: env.imap.password,
    host: env.imap.server,
    port: 993,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false
    }
  });

  imapConnection.on("error", (err) => {
    console.error("IMAP connection error:", err);
  });

  imapConnection.on("end", () => {
    console.log("IMAP connection ended");
    imapConnection = null;
  });

  return imapConnection;
}

/**
 * Start polling for new emails
 * @param {Function} onNewEmail - Callback when new email is received
 */
async function startPolling(onNewEmail) {
  if (!env.imap.email || !env.imap.password) {
    console.warn("IMAP credentials not configured. Email polling disabled.");
    return;
  }

  if (pollingInterval) {
    console.warn("Email polling already started");
    return;
  }

  // Poll immediately, then at configured interval
  await pollEmails(onNewEmail);

  pollingInterval = setInterval(async () => {
    try {
      await pollEmails(onNewEmail);
    } catch (error) {
      console.error("Error during email polling:", error);
    }
  }, env.imap.pollingIntervalMs);

  console.log(`Email polling started (interval: ${env.imap.pollingIntervalMs}ms)`);
}

/**
 * Stop polling for new emails
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("Email polling stopped");
  }

  if (imapConnection) {
    try {
      imapConnection.closeBox(false, () => {
        imapConnection.end();
      });
    } catch (error) {
      console.error("Error closing IMAP connection:", error);
    }
  }
}

/**
 * Poll for unread emails
 * @param {Function} onNewEmail - Callback when new email is received
 */
async function pollEmails(onNewEmail) {
  return new Promise((resolve, reject) => {
    const imap = initializeImap();

    imap.openBox("INBOX", false, (err, box) => {
      if (err) {
        console.error("Error opening inbox:", err);
        return reject(err);
      }

      // Search for unread emails
      imap.search(["UNSEEN"], (err, results) => {
        if (err) {
          console.error("Error searching for emails:", err);
          imap.end();
          return reject(err);
        }

        if (results.length === 0) {
          imap.end();
          return resolve();
        }

        console.log(`Found ${results.length} unread emails`);

        const f = imap.fetch(results, { bodies: "" });
        let emailCount = 0;

        f.on("message", (msg, seqno) => {
          simpleParser(msg, async (err, parsed) => {
            if (err) {
              console.error("Error parsing email:", err);
              return;
            }

            try {
              const emailData = {
                messageId: parsed.messageId,
                from: parsed.from.text,
                to: parsed.to.text,
                subject: parsed.subject,
                text: parsed.text || "",
                html: parsed.html || "",
                timestamp: parsed.date,
                source: "outlook_imap"
              };

              console.log("Processing email:", {
                from: emailData.from,
                subject: emailData.subject,
                timestamp: emailData.timestamp
              });

              // Call the callback to process the email
              if (onNewEmail) {
                await onNewEmail(emailData);
              }

              // Mark email as read
              imap.setFlags(seqno, ["\\Seen"], (err) => {
                if (err) {
                  console.error("Error marking email as read:", err);
                }
              });

              emailCount++;
            } catch (error) {
              console.error("Error processing email:", error);
            }
          });
        });

        f.on("error", (err) => {
          console.error("Error fetching emails:", err);
          imap.end();
          reject(err);
        });

        f.on("end", () => {
          console.log(`Processed ${emailCount} emails`);
          imap.end();
          resolve();
        });
      });
    });
  });
}

/**
 * Check if email has already been processed (deduplication)
 * @param {string} messageId - Email message ID
 * @param {string} senderEmail - Email sender
 * @param {Date} timestamp - Email timestamp
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} True if email already processed
 */
async function isDuplicateEmail(messageId, senderEmail, timestamp, db) {
  try {
    // Check within 1-hour window for same sender
    const onHourAgo = new Date(timestamp.getTime() - 3600000);
    
    const result = await db.query(
      `SELECT id FROM orders 
       WHERE customer_email = $1 
       AND created_at BETWEEN $2 AND $3
       LIMIT 1`,
      [senderEmail, onHourAgo, timestamp]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error("Error checking for duplicate email:", error);
    return false; // Allow through on error to prevent data loss
  }
}

/**
 * Extract shipment details from email text
 * @param {string} emailText - Email body text
 * @returns {Object} Extracted shipment data
 */
function extractShipmentFromEmail(emailText) {
  // Simple heuristic extraction (will be enhanced by LangChain triage)
  const shipmentData = {};

  // Try to extract key fields using regex patterns
  const patterns = {
    pickup: /pickup\s+(?:from|at)?\s*:?\s*([A-Za-z\s]+?)(?:\s+to|\s+drop|\s*,|$)/i,
    dropoff: /(?:drop(?:off)?|destination|to)\s*:?\s*([A-Za-z\s]+?)(?:\s*,|\s+on|\s+by|$)/i,
    weight: /(\d+(?:,\d+)?)\s*kg|kilogram|lb|pound/i,
    volume: /(\d+(?:\.\d+)?)\s*m3|m³|cbm|cubic\s*meter/i,
    date: /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    commodity: /cargo|commodity|freight|(?:shipping|transporting)\s+([A-Za-z\s]+?)(?:\s+to|\s+from|\s*,|$)/i
  };

  // Extract each field
  if (patterns.pickup.test(emailText)) {
    shipmentData.pickup = emailText.match(patterns.pickup)[1].trim();
  }

  if (patterns.dropoff.test(emailText)) {
    shipmentData.dropoff = emailText.match(patterns.dropoff)[1].trim();
  }

  const weightMatch = emailText.match(/(\d+(?:,\d+)?)\s*kg/i);
  if (weightMatch) {
    shipmentData.weight = parseInt(weightMatch[1].replace(/,/g, ""), 10);
  }

  const volumeMatch = emailText.match(/(\d+(?:\.\d+)?)\s*m3|m³|cbm/i);
  if (volumeMatch) {
    shipmentData.volume = parseFloat(volumeMatch[1]);
  }

  if (patterns.commodity.test(emailText)) {
    const commodityMatch = emailText.match(patterns.commodity);
    shipmentData.commodity = commodityMatch[1]?.trim() || "general";
  }

  return shipmentData;
}

module.exports = {
  initializeImap,
  startPolling,
  stopPolling,
  pollEmails,
  isDuplicateEmail,
  extractShipmentFromEmail
};
