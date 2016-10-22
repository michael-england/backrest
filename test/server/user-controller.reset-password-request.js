const expect = require('expect.js');
module.exports = {
	'order': 7,
	'delay': 1000,
	'method': 'POST',
	'url': '/api/users/reset-password-request',
	'description': 'should request a password reset',
	'data': {
		'email': 'emailCreate@backrest.io'
	},
	'assertions': function (result, done) {
		expect(result).to.be(true);
		done();
	}
};