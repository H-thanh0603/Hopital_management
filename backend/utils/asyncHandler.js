/**
 * Wraps an async route handler so rejected promises/thrown errors
 * are forwarded to Express's error-handling middleware instead of
 * crashing the process or requiring repetitive try/catch blocks.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
