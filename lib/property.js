'use strict';

const db = require('./db');
const constants = require('./constants');

/**
 * Retrieve and set properties.
 * @type {Property}
 */
module.exports = class Property {
	/**
	 * Set a property.  NOT IMPLEMENTED
	 */
	static setValue () {
		// TODO: implement
	}

	/**
	 * Retrieves a property.  Resolves with default value if property is not set.
	 * @param {string} name Name of property
	 * @param {Object} [defaultValue] Value when property is not set.
	 * @returns {Promise} Resolves with property value or default value.
	 */
	static getValue (name, defaultValue) {
		return new Promise((resolve) => {
			db.collection(constants.COLLECTION.PROPERTIES).findOne({
				'name': name
			}, (error, property) => {
				if (error || !property) {
					return resolve(defaultValue);
				}

				return resolve(property.value);
			});
		});
	}
};