const expect = require('expect.js');
module.exports = {
	'order': 9,
	'method': 'GET',
	'url': '/api/users/current',
	'description': 'should get the currently logged in user',
	'assertions': function (result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameCreate');
		expect(result.lastName).to.equal('LastNameCreate');
		expect(result.email).to.equal('emailCreate@backrest.io');
		done();
	}
};