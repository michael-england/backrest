const expect = require('expect.js');
module.exports = {
	'order': 5,
	'method': 'GET',
	'url': '/api/users/{_id}',
	'description': 'should get a user by id',
	'assertions': function (result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameCreate');
		expect(result.lastName).to.equal('LastNameCreate');
		expect(result.email).to.equal('emailCreate@backrest.io');
		done();
	}
};