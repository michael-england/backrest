'use strict';

const db = require('./db');
const constants = require('./constants');

/**
 * Access Control List for securing data.
 * @type {Acl}
 */
module.exports = class Acl {
	/**
	 * A set of allowed actions.
	 * @private
	 * @returns {string[]} Array of actions.
	 */
	static get actions () {
		return [constants.ACTION.CREATE, constants.ACTION.READ, constants.ACTION.UPDATE, constants.ACTION.DELETE];
	}

	/**
	 * Determines whether a user is permitted to perform the specified action against the
	 * specified collection. Additionally modifies a query to limit to the set of records
	 * a user has access to.
	 * @param {string} collectionName Name of the collection.
	 * @param {string} action Name of the action.
	 * @param {object} user User being checked for access.  Typically the logged in user.
	 * @param {object} query Query being performed on the collection.
	 * @returns {Promise}
	 */
	static permit (collectionName, action, user, query) {
		return new Promise((resolve, reject) => {
			if (this.actions.indexOf(action) === -1) {
				return reject(constants.ERROR.INVALID_ACTION);
			}

			if (!query) {
				query = {};
			}

			db.collection(constants.COLLECTION.COLLECTIONS).findOne({
				'name': collectionName
			}, (error, collection) => {
				if (error) {
					return reject(error);
				}

				if (!collection) {
					return reject(constants.ERROR.NOT_FOUND);
				}

				var roles;
				if (!collection.acl) {
					roles = [];
				} else if (collection.acl[action] instanceof Array) {
					roles = collection.acl[action];
				} else {
					roles = Object.keys(collection.acl[action]);
				}

				if (!user && roles.indexOf(constants.ROLE.PUBLIC) > -1) {
					return resolve(query);
				}

				var hasRole = roles.some((role) => {
					return user && user.roles && user.roles.indexOf(role) !== -1;
				});

				if (!hasRole && roles.indexOf(constants.ROLE.OWNER) !== -1) {
					hasRole = true;
					query._createdBy = user._id.toString();
				}

				if (!hasRole) {
					reject(constants.ERROR.FORBIDDEN);
				}

				return resolve(query);
			});
		});
	}

	/**
	 * Prevent the specified user from accessing fields of the data provided
	 * for the specified collection and actoin.
	 * @param {string} collectionName Name of the collection
	 * @param {string} action Name of the action.
	 * @param {object} user User being checked for access.  Typically the logged in user.
	 * @param {object} data Data being sanitized.
	 * @returns {Promise}
	 */
	static sanitize (collectionName, action, user, data) {
		return new Promise((resolve, reject) => {
			if (this.actions.indexOf(action) === -1) {
				return reject(constants.ERROR.INVALID_ACTION);
			}

			db.collection(constants.COLLECTION.COLLECTIONS).findOne({
				'name': collectionName
			}, (error, collection) => {
				if (error) {
					return reject(error);
				}

				if (!collection) {
					return reject(constants.ERROR.NOT_FOUND);
				}

				if (!collection.acl) {
					return resolve(data);
				}

				var roles;
				if (collection.acl[action] instanceof Array) {
					roles = collection.acl[action];
				} else {
					roles = Object.keys(collection.acl[action]);
				}

				var fields = [];
				roles.forEach((role) => {
					var userRoles = !user || !user.roles ? [] : user.roles;
					if (userRoles.indexOf(role) === -1 && role !== constants.ROLE.PUBLIC && role !== constants.ROLE.OWNER) {
						return;
					}

					if (role === constants.ROLE.OWNER && user && data._createdBy !== user._id.toString()) {
						return;
					}

					collection.acl[action][role].forEach((field) => {
						if (fields.indexOf(field) === -1) {
							fields.push(field);
						}
					});
				});

				function sanitizeData (data) {
					var sanitizeData = {};
					fields.forEach((field) => {
						if (!data[field]) {
							return;
						}

						sanitizeData[field] = data[field];
					});
					return sanitizeData;
				}

				if (data instanceof Array) {
					data = data.map(sanitizeData);
				} else {
					data = sanitizeData(data);
				}

				resolve(data);
			});
		});
	}
};