const expect = require('expect.js');
const Token = require('../../lib/token.js');
module.exports = {
	'order': 3,
	'method': 'POST',
	'url': '/api/users/confirm-email',
	'description': 'should confirm an email',
	'data': function (_id) {
		return {
			'token': Token.generate(1440, 'aes-256-cbc', '0123456', _id)
		};
	},
	'assertions': function (result, done) {
		expect(result).to.be(true);
		done();
	}
};