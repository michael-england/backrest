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
	EVENT: {
		BEFORE_CREATE: 'beforeCreate',
		BEFORE_READ: 'beforeRead',
		BEFORE_UPDATE: 'beforeUpdate',
		BEFORE_DELETE: 'beforeDelete',
		AFTER_CREATE: 'afterCreate',
		AFTER_READ: 'afterRead',
		AFTER_UPDATE: 'afterUpdate',
		AFTER_DELETE: 'afterDelete'
	},
	COLLECTION: {
		COLLECTIONS: 'collections',
		EVENTS: 'events',
		USERS: 'users',
		PROPERTIES: 'properties'
	},
	ERROR: {
		INVALID_EVENT: 'Invalid event, event must be "before", "beforeCreate", "beforeRead", "beforeUpdate", "beforeDelete", "afterCreate", "afterRead", "afterUpdate", or "afterDelete"',
		INVALID_ACTION: 'Invalid action, action must be "create", "read", "update", or "delete"',
		FORBIDDEN: 'Forbidden',
		NOT_FOUND: 'Not Found'
	}
};