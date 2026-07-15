/**
 * Dashboard Service
 *
 * Aggregates order, review-queue, and delivery data into a single summary
 * for the monitoring view: intake status, failed parsing attempts, and
 * quote delivery status.
 */

const orderService = require("./orderService");
const reviewQueueRepository = require("../db/repositories/reviewQueueRepository");
const deliveryRepository = require("../db/repositories/deliveryRepository");

const RECENT_LIMIT = 10;

function countByStatus(items) {
  return items.reduce((counts, item) => {
    const status = item.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

async function getSummary() {
  const [orders, reviewEntries, deliveryLogs] = await Promise.all([
    orderService.listOrders(),
    reviewQueueRepository.listReviewQueue({}),
    deliveryRepository.listAllDeliveryLogs()
  ]);

  return {
    orders: {
      total: orders.length,
      byStatus: countByStatus(orders),
      recent: orders.slice(0, RECENT_LIMIT)
    },
    reviewQueue: {
      total: reviewEntries.length,
      byStatus: countByStatus(reviewEntries),
      recent: reviewEntries.slice(0, RECENT_LIMIT)
    },
    delivery: {
      total: deliveryLogs.length,
      byStatus: countByStatus(deliveryLogs),
      recent: deliveryLogs.slice(0, RECENT_LIMIT)
    }
  };
}

module.exports = { getSummary };
