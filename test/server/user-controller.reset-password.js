const expect = require('expect.js');
const generateToken = require('../../lib/generate-token.js');
module.exports = {
	'order': 8,
	'method': 'POST',
	'url': '/api/users/reset-password',
	'description': 'should reset a password',
	'data': function (_id) {
		return {
			'token': generateToken(120, 'aes-256-cbc', '012345678', _id),
			'password': 'password'
		};
	},
	'assertions': function (result, done) {
		expect(result).to.be(true);
		done();
	}
};