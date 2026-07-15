const quoteService = require("../services/quoteService");

async function createQuote(req, res, next) {
  try {
    const result = await quoteService.generateQuote(req.params.orderId);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

async function listQuotes(req, res, next) {
  try {
    const quotes = await quoteService.listQuotesForOrder(req.params.orderId);
    res.json({ data: quotes });
  } catch (error) {
    next(error);
  }
}

async function approveQuote(req, res, next) {
  try {
    const quote = await quoteService.approveQuote(req.params.orderId, req.params.quoteId, req.body?.notes);
    res.json({ data: quote });
  } catch (error) {
    next(error);
  }
}

async function rejectQuote(req, res, next) {
  try {
    const quote = await quoteService.rejectQuote(req.params.orderId, req.params.quoteId, req.body?.notes);
    res.json({ data: quote });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createQuote,
  listQuotes,
  approveQuote,
  rejectQuote
};
