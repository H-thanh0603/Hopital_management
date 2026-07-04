const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const db = require('../db/connection');

/**
 * Verifies the Bearer token and attaches the authenticated user to req.user.
 * Re-checks the user against the database so deactivated accounts are
 * rejected immediately rather than trusting a stale token.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Authentication required. Provide a valid Bearer token.'));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token.'));
  }

  const user = db
    .prepare('SELECT id, full_name, email, role, doctor_id, is_active FROM users WHERE id = ?')
    .get(payload.sub);

  if (!user || !user.is_active) {
    return next(new ApiError(401, 'Account is inactive or no longer exists.'));
  }

  req.user = user;
  next();
}

/**
 * Restricts a route to one or more roles. Must run after `authenticate`.
 */
function authorize(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required.'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
