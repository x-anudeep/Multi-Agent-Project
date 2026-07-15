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

// Highest UID already seen. null means no baseline has been established yet
// -- the first poll after (re)starting only records where the mailbox
// currently stands rather than bulk-processing every pre-existing unread
// email in the inbox.
let lastSeenUid = null;

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
 * Connect the IMAP client and wait until it's ready to accept commands.
 * initializeImap() only constructs the client and wires up listeners --
 * without this, openBox()/search() run against a socket that never
 * actually performed the connect/login handshake.
 * @param {Imap} imap
 * @returns {Promise<Imap>}
 */
function connectImap(imap) {
  return new Promise((resolve, reject) => {
    if (imap.state === "authenticated") {
      return resolve(imap);
    }

    const onReady = () => {
      imap.removeListener("error", onError);
      resolve(imap);
    };
    const onError = (err) => {
      imap.removeListener("ready", onReady);
      reject(err);
    };

    imap.once("ready", onReady);
    imap.once("error", onError);
    imap.connect();
  });
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
  const imap = initializeImap();
  await connectImap(imap);

  return new Promise((resolve, reject) => {
    imap.openBox("INBOX", false, (err, box) => {
      if (err) {
        console.error("Error opening inbox:", err);
        return reject(err);
      }

      // Search for unread emails. A UID range like "N:*" is filtered
      // client-side below rather than trusted as-is: per RFC 3501, "N:*"
      // always includes the mailbox's highest-numbered message even when N
      // exceeds every real UID, so the server-side range alone would still
      // re-match the baseline message itself on the first poll with no
      // genuinely new mail.
      imap.search(["UNSEEN"], (err, allResults) => {
        if (err) {
          console.error("Error searching for emails:", err);
          imap.end();
          return reject(err);
        }

        if (lastSeenUid === null) {
          if (allResults.length === 0) {
            lastSeenUid = 0;
          } else {
            lastSeenUid = Math.max(...allResults);
          }
          console.log(
            `Baseline established at UID ${lastSeenUid}: skipping ${allResults.length} pre-existing unread email(s); only new mail will be processed from here on.`
          );
          imap.end();
          return resolve();
        }

        const results = allResults.filter((uid) => uid > lastSeenUid);

        if (results.length === 0) {
          imap.end();
          return resolve();
        }

        lastSeenUid = Math.max(lastSeenUid, ...results);
        console.log(`Found ${results.length} unread emails`);

        const f = imap.fetch(results, { bodies: "" });
        let emailCount = 0;
        let fetchEnded = false;
        let pendingMessages = 0;
        let settled = false;

        // The raw IMAP fetch (just downloading message bodies) finishes far
        // faster than our per-email processing (triage/order/quote/email
        // sending can take several seconds), so the connection must stay
        // open -- and setFlags must actually complete -- for every message
        // before ending it. Ending early on fetch completion silently drops
        // the \Seen flag, so the same email gets reprocessed on every poll.
        function finishIfDone() {
          if (fetchEnded && pendingMessages === 0 && !settled) {
            settled = true;
            console.log(`Processed ${emailCount} emails`);
            imap.end();
            resolve();
          }
        }

        function markSeen(uid) {
          return new Promise((res) => {
            if (!uid) {
              console.error("Error marking email as read: no UID captured for this message");
              return res();
            }
            // setFlags() always issues a UID STORE internally, so it must be
            // given the message's actual UID -- the "message" event's second
            // argument is a plain sequence number, not a UID, and passing
            // that silently flags the wrong message (or nothing).
            imap.setFlags(uid, ["\\Seen"], (err) => {
              if (err) {
                console.error("Error marking email as read:", err);
              }
              res();
            });
          });
        }

        f.on("message", (msg) => {
          pendingMessages++;
          let uid = null;

          msg.once("attributes", (attrs) => {
            uid = attrs.uid;
          });

          // ImapMessage isn't itself a stream -- the raw RFC822 body only
          // becomes available via its "body" event, which is what
          // simpleParser actually needs to read.
          msg.on("body", (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) {
                console.error("Error parsing email:", err);
                pendingMessages--;
                finishIfDone();
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

                await markSeen(uid);
                emailCount++;
              } catch (error) {
                console.error("Error processing email:", error);
              } finally {
                pendingMessages--;
                finishIfDone();
              }
            });
          });
        });

        f.on("error", (err) => {
          console.error("Error fetching emails:", err);
          settled = true;
          imap.end();
          reject(err);
        });

        f.on("end", () => {
          fetchEnded = true;
          finishIfDone();
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
