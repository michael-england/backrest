const expect = require('expect.js');
module.exports = {
	'order': 1,
	'method': 'POST',
	'url': '/api/users/login',
	'description': 'should fail to login a user',
	'data': {
		'email': 'invalid@backrest.io',
		'password': 'password'
	},
	'statusCode': 401,
	'assertions': function (result, done) {
		expect(result.password).to.be(undefined);
		expect(result.firstName).to.equal(undefined);
		expect(result.lastName).to.equal(undefined);
		expect(result.email).to.equal(undefined);
		done();
	}
};