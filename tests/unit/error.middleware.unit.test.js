process.env.NODE_ENV = 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { errorHandler } = require('../../src/middlewares/error.middleware');

describe('Unit Tests: Production Error Redaction', () => {
  it('does not expose internal messages or stacks in production responses', async () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = express();
      app.get('/failure', () => {
        throw new Error('private database connection detail');
      });
      app.use(errorHandler);

      const response = await request(app).get('/failure');
      assert.strictEqual(response.status, 500);
      assert.strictEqual(response.body.message, 'An unexpected internal error occurred.');
      assert.strictEqual(response.body.stack, undefined);
      assert.doesNotMatch(JSON.stringify(response.body), /private database connection detail/);
    } finally {
      process.env.NODE_ENV = previousEnvironment;
    }
  });
});