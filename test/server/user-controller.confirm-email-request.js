const expect = require('expect.js');
module.exports = {
	'order': 2,
	'method': 'POST',
	'url': '/api/users/confirm-email-request',
	'description': 'should request an email confirmation',
	'data': {
		'email': 'emailCreate@backrest.io'
	},
	'assertions': function (result, done) {
		expect(result).to.be(true);
		done();
	}
};
