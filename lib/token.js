'use strict';

const crypto = require('crypto');

/**
 * Utility class for generating, parsing, and validating tokens.
 * @type {Token}
 */
module.exports = class Token {
	/**
	 * Generates a token.
	 * @param {number} timeout Number of minutes before the token is expired.
	 * @param {string} algorithm Algorithm for cipher.
	 * @param {string} password Password for cipher.
	 * @param {string} data Data to be encrypted.
	 * @returns {string} Encrypted token.
	 */
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

	/**
	 * Parses a token
	 * @param {string} algorithm Algorithm for cipher.
	 * @param {string} password Password for cipher.
	 * @param {string} token The token string to parse.
	 * @returns {object} The token containing the expiration and data.
	 */
	static parse (algorithm, password, token) {
		var decipher = crypto.createDecipher(algorithm, password);
		token = decipher.update(token, 'hex', 'utf8');
		token += decipher.final('utf8');
		return JSON.parse(token);
	}

	/**
	 * Validate a token's expiration
	 * @param {object} token The parsed token object.
	 * @returns {boolean} Token validation.
	 */
	static validate (token) {
		return new Date() < new Date(token.expiration);
	}
};