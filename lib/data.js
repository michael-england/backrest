'use strict';

const db = require('./db');
const Collection = require('./collection');

module.exports = class Data {
	static collection (name, user) {
		return new Collection(name, user);
	}

	static ObjectId (id) {
		return db.ObjectId(id);
	}
};