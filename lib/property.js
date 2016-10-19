'use strict';

const db = require('./db');

module.exports = class Property {
	static setValue (name, value) {
		// TODO: implement
	}

	static getValue (name, defaultValue) {
		return new Promise((resolve) => {
			db.collection('properties').findOne({
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