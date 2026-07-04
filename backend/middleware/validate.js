const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Runs after express-validator field validators; short-circuits the
 * request with a 422 if any validation errors were collected.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ApiError(422, 'Validation failed.', errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }))));
  }
  next();
}

module.exports = validate;
