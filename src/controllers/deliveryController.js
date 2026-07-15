const deliveryService = require("../services/deliveryService");

async function sendQuotePdf(req, res, next) {
  try {
    const { orderId, quoteId } = req.params;
    const result = await deliveryService.sendQuotePdf(orderId, quoteId);
    res.status(result.emailResult.success ? 200 : 202).json({ data: result });
  } catch (error) {
    next(error);
  }
}

async function getDeliveryStatus(req, res, next) {
  try {
    const logs = await deliveryService.getDeliveryStatus(req.params.orderId);
    res.json({ data: logs });
  } catch (error) {
    next(error);
  }
}

async function retryDelivery(req, res, next) {
  try {
    const result = await deliveryService.retryDelivery(req.params.orderId);
    res.status(result.emailResult.success ? 200 : 202).json({ data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  sendQuotePdf,
  getDeliveryStatus,
  retryDelivery
};
