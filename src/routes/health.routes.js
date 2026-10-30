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
  const memory = process.memoryUsage();
  return ApiResponse.ok(res, {
    status: 'HEALTHY',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    memoryUsageMB: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
    },
  }, 'Service is operational.');
});

module.exports = router;
