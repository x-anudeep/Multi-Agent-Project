function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  res.status(status).json({
    error: {
      message: error.message || "Unexpected server error",
      status
    }
  });
}

module.exports = { errorHandler };
