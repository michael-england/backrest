const db = require('../../lib/db');
module.exports = {
	'order': 11.5,
	'method': 'DELETE',
	'url': '/api/users/' + db.ObjectId(),
	'description': 'should 404 when deleting a user that does\'t exist',
	'statusCode': 404
};