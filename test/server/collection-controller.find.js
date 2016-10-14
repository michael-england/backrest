const expect = require('expect.js');
module.exports = {
	'order': 4,
	'method': 'GET',
	'url': '/api/users',
	'description': 'should get a list of users',
	'assertions': function (result, done) {
		expect(result.data.length).to.be.greaterThan(0);
		done();
	}
};