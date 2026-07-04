const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error.'
    : err.message || 'Internal server error.';

  if (statusCode === 500) {
    console.error(err);
  }

  const response = { success: false, message };
  if (err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
}

module.exports = { notFoundHandler, errorHandler };
