const expect = require('expect.js');
const mongojs = require('mongojs');
const settings = require('../../settings.json');

module.exports = {
	'order': 0,
	'method': 'POST',
	'url': '/api/users',
	'statusCode': 201,
	'description': 'should create a new user',
	'data': {
		'firstName': 'FirstNameCreate',
		'lastName': 'LastNameCreate',
		'email': 'emailCreate@backrest.io',
		'password': 'password'
	},
	'assertions': function (result, done) {
		expect(result.firstName).to.equal('FirstNameCreate');
		expect(result.lastName).to.equal('LastNameCreate');
		expect(result.email).to.equal('emailCreate@backrest.io');

		// TODO: Move this
		// manually add the user to the admin role
		var db = mongojs(settings.databaseUrl, ['users']);
		db.users.update({
			'_id': db.ObjectId(result._id)
		}, {
			'$set': {
				'roles': ['admin']
			}
		}, () => {
			done();
		});
	}
};

