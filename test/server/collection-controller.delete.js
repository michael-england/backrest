const expect = require('expect.js');
module.exports = {
	'order': 12,
	'method': 'DELETE',
	'url': '/api/users/{_id}',
	'description': 'should delete a user by id',
	'assertions': function (result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameUpdate');
		expect(result.lastName).to.equal('LastNameUpdate');
		expect(result.email).to.equal('emailUpdate@backrest.io');
		done();
	}
};