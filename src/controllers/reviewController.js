const reviewService = require("../services/reviewService");

async function listReviewQueue(req, res, next) {
  try {
    const entries = await reviewService.listReviewQueue(req.query.status);
    res.json({ data: entries });
  } catch (error) {
    next(error);
  }
}

async function getReviewEntry(req, res, next) {
  try {
    const entry = await reviewService.getReviewEntry(req.params.reviewId);
    res.json({ data: entry });
  } catch (error) {
    next(error);
  }
}

async function approveReviewEntry(req, res, next) {
  try {
    const result = await reviewService.approveReviewEntry(req.params.reviewId, req.body || {});
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

async function rejectReviewEntry(req, res, next) {
  try {
    const entry = await reviewService.rejectReviewEntry(req.params.reviewId, req.body?.notes);
    res.json({ data: entry });
  } catch (error) {
    next(error);
  }
}

async function sendNow(req, res, next) {
  try {
    const result = await reviewService.sendNow(req.params.reviewId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listReviewQueue,
  getReviewEntry,
  approveReviewEntry,
  rejectReviewEntry,
  sendNow
};
