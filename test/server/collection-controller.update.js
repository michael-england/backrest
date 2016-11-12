const expect = require('expect.js');
module.exports = {
	'order': 10,
	'method': 'PUT',
	'url': '/api/users/{_id}',
	'description': 'should update a user by id',
	'data': {
		'firstName': 'FirstNameUpdate',
		'lastName': 'LastNameUpdate',
		'email': 'emailUpdate@backrest.io'
	},
	'assertions': function (result, done) {
		expect(result.password).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameUpdate');
		expect(result.lastName).to.equal('LastNameUpdate');
		expect(result.email).to.equal('emailUpdate@backrest.io');
		done();
	}
};