'use strict';

const crypto = require('crypto');

module.exports = class Token {
	static generate (timeout, algorithm, password, data) {
		// determine expiration
		var expiration = new Date();
		expiration.setMinutes(expiration.getMinutes() + timeout);

		// create and encrypt the token
		var cipher = crypto.createCipher(algorithm, password);
		var token = {};
		token.data = data;
		token.expiration = expiration;
		token = cipher.update(JSON.stringify(token), 'utf8', 'hex');
		token += cipher.final('hex');
		return token;
	}

	static parse (algorithm, password, token) {
		var decipher = crypto.createDecipher(algorithm, password);
		token = decipher.update(token, 'hex', 'utf8');
		token += decipher.final('utf8');
		return JSON.parse(token);
	}

	static validate (token) {
		return new Date() < new Date(token.expiration);
	}
};