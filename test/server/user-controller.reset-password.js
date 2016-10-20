const expect = require('expect.js');
const Token = require('../../lib/token.js');
module.exports = {
	'order': 8,
	'method': 'POST',
	'url': '/api/users/reset-password',
	'description': 'should reset a password',
	'data': function (_id) {
		return {
			'token': Token.generate(120, 'aes-256-cbc', '0123456', _id),
			'password': 'password'
		};
	},
	'assertions': function (result, done) {
		expect(result).to.be(true);
		done();
	}
};