const expect = require('expect.js');
module.exports = {
	'order': 1,
	'method': 'POST',
	'url': '/api/users/login',
	'description': 'should login a user',
	'data': {
		'email': 'emailCreate@backrest.io',
		'password': 'password'
	},
	'assertions': function (result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameCreate');
		expect(result.lastName).to.equal('LastNameCreate');
		expect(result.email).to.equal('emailCreate@backrest.io');
		done();
	}
};