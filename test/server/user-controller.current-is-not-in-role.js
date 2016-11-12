const expect = require('expect.js');
module.exports = {
	'order': 11,
	'method': 'POST',
	'url': '/api/users/current/is-in-role',
	'description': 'should check whether a user is not in a role',
	'data': {
		'role': 'non-admin'
	},
	'assertions': function (result, done) {
		expect(result).to.be(false);
		done();
	}
};