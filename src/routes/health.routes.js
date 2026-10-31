/**
 * @file health.routes.js
 * @description Health and readiness probe endpoints for monitoring and orchestrators (e.g. Docker, Kubernetes).
 */

const express = require('express');
const ApiResponse = require('../utils/ApiResponse');

const router = express.Router();

/**
 * Health check endpoint
 * GET /api/v1/health
 */
router.get('/', (req, res) => {
  return ApiResponse.ok(res, {
    status: 'HEALTHY',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }, 'Service is operational.');
});

module.exports = router;
