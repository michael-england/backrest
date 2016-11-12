'use strict';

const db = require('./db');
const constants = require('./constants');

module.exports = class Property {
	static setValue () {
		// TODO: implement
	}

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