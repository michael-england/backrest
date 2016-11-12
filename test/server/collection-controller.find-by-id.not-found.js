const expect = require('expect.js');
const db = require('../../lib/db');
module.exports = {
	'order': 0,
	'method': 'GET',
	'url': '/api/users/' + db.ObjectId(),
	'description': 'should 404 when document can\'t be found by id',
	'statusCode': 404
};