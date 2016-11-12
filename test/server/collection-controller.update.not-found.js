const db = require('../../lib/db');
module.exports = {
	'order': 9.5,
	'method': 'PUT',
	'url': '/api/users/' + db.ObjectId(),
	'description': 'should 404 when updating a user that does\'t exist',
	'data': {
		'firstName': 'FirstNameUpdate',
		'lastName': 'LastNameUpdate',
		'email': 'emailUpdate@backrest.io'
	},
	'statusCode': 404
};