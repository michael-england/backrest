const crypto = require('crypto');

module.exports = function generateToken (timeout, algorithm, password, _id) {

	// determine expiration
	var expiration = new Date();
	expiration.setMinutes(expiration.getMinutes() + timeout);

	// create and encrypt the token
	var cipher = crypto.createCipher(algorithm, password);
	var token = {};
	token._id = _id;
	token.expiration = expiration;
	token = cipher.update(JSON.stringify(token), 'utf8', 'hex');
	token += cipher.final('hex');
	return token;
};