'use strict';

const db = require('./db');
const Collection = require('./collection');

/**
 * Access data securely.
 * @type {Data}
 */
module.exports = class Data {

	/**
	 * Gets a collection for performing CRUD operations
	 * @param {string} name Name of the collection
	 * @param {object} user User for ACLs
	 * @returns {Collection|exports|module.exports}
	 */
	static collection (name, user) {
		return new Collection(name, user);
	}

	/**
	 * Converts a string into a BSON Object ID
	 * @param {string} id
	 * @returns {*} BSON Object ID
	 * @constructor
	 */
	static ObjectId (id) {
		return db.ObjectId(id);
	}
};