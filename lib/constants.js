'use strict';

module.exports = {
	ROLE: {
		OWNER: 'owner',
		PUBLIC: 'public'
	},
	ACTION: {
		CREATE: 'create',
		READ: 'read',
		UPDATE: 'update',
		DELETE: 'delete'
	},
	COLLECTION: {
		COLLECTIONS: 'collections',
		USERS: 'users',
		PROPERTIES: 'properties'
	},
	ERROR: {
		INVALID_ACTION: 'Invalid action, action must be "create", "read", "update", or "delete"',
		FORBIDDEN: 'Forbidden',
		NOT_FOUND: 'Not Found'
	}
};