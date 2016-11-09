'use strict';
const mongojs = require('mongojs');
module.exports = mongojs(process.env.MONGODB_URI || 'mongodb://localhost:27017/backrest');