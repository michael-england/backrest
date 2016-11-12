const db = require('../../lib/db');
module.exports = {
	'order': 0,
	'method': 'DELETE',
	'url': '/api/users/' + db.ObjectId(),
	'description': 'should 403 Forbidden when deleting a user when not logged in',
	'statusCode': 403
};