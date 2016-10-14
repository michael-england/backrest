const expect = require('expect.js');
module.exports = {
	'order': 6,
	'method': 'POST',
	'url': '/api/users/current/change-password',
	'description': 'should change the currently logged in user password',
	'data': {
		'oldPassword': 'password',
		'newPassword': 'password1'
	},
	'assertions': function (result, done) {
		expect(result).to.be(true);
		done();
	}
};