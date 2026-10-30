/**
 * @file ApiResponse.js
 * @description Standardized API response format for consistent client contracts.
 */

const { HTTP_STATUS } = require('../constants/httpStatusCodes');

class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code (200, 201, etc.).
   * @param {*} [data=null] - The payload to send back.
   * @param {string} [message='Success'] - Descriptive success message.
   * @param {Object} [meta=null] - Optional pagination or contextual metadata.
   */
  constructor(statusCode = HTTP_STATUS.OK, data = null, message = 'Success', meta = null) {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    if (meta) {
      this.meta = meta;
    }
  }

  /**
   * Helper to send JSON response directly via Express Response object.
   * @param {import('express').Response} res - Express response instance.
   */
  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      statusCode: this.statusCode,
      message: this.message,
      data: this.data,
      ...(this.meta ? { meta: this.meta } : {}),
    });
  }

  // Factory methods
  static ok(res, data, message = 'Operation completed successfully', meta = null) {
    return new ApiResponse(HTTP_STATUS.OK, data, message, meta).send(res);
  }

  static created(res, data, message = 'Resource created successfully') {
    return new ApiResponse(HTTP_STATUS.CREATED, data, message).send(res);
  }

  static noContent(res) {
    return res.status(HTTP_STATUS.NO_CONTENT).send();
  }
}

module.exports = ApiResponse;
