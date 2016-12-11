'use strict';
const mongojs = require('mongojs');

/**
 * Singleton connection
 */
module.exports = mongojs(process.env.MONGODB_URI || 'mongodb://localhost:27017/backrest');