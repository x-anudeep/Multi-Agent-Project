const orderService = require("../services/orderService");

async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.body);
    res.status(201).json({ data: order });
  } catch (error) {
    next(error);
  }
}

async function listOrders(req, res, next) {
  try {
    const orders = await orderService.listOrders();
    res.json({ data: orders });
  } catch (error) {
    next(error);
  }
}

async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id);
    res.json({ data: order });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  listOrders,
  getOrder
};
