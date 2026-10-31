const tokenService = require('../services/token.service');
const ApiError = require('../utils/ApiError');

function requireStepUp(purpose) {
  return (req, res, next) => {
    try {
      const token = req.get('X-Step-Up-Token');
      if (!token) throw ApiError.forbidden('Verify your identity before performing this action.');

      const decoded = tokenService.verifyStepUpToken(token);
      if (decoded.sub !== req.user.id || decoded.purpose !== purpose) {
        throw ApiError.forbidden('This verification does not authorize the requested action.');
      }
      if ((decoded.pwdv ?? null) !== (req.user.passwordChangedAt ?? null)) {
        throw ApiError.unauthorized('Verification expired after a password change. Verify your identity again.');
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requireStepUp };
