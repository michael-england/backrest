'use strict';

const _ = require('lodash');
const jsonfile = require('jsonfile');
const clone = require('clone');
const db = require('./db');
const Acl = require('./acl');
const Event = require('./event');
const constants = require('./constants');
const mongoify = require('mongoify');

/**
 * Collection of documents.
 * @type {Collection}
 */
module.exports = class Collection {
	constructor (name, user) {
		this.name = name;
		this.user = user;
		this.collection = db.collection(this.name);
		jsonfile.spaces = 2;
	}

	/**
	 * Inserts a new document.
	 * @param {object} data Data of new document.
	 * @returns {Promise}
	 */
	create (data) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.CREATE, constants.EVENT.BEFORE_CREATE, null, data).then((result) => {
				var {data} = result;

				if (this.user && this.user._id) {
					data._createdBy = this.user._id.toString();
					data._modifiedBy = data._createdBy
				}

				data._created = new Date();
				data._modified = new Date();
				delete data._id;

				this.collection.save(data, (error, data) => {
					if (error) {
						return reject(error);
					}

					// TODO: move user collection logic to events once they're updated
					if (this.name !== constants.COLLECTION.USERS || this.user) {
						return Acl.sanitize(this.name, constants.ACTION.READ, this.user, data).then(() => {
							this.postCommand(constants.ACTION.READ, constants.EVENT.AFTER_CREATE, data).then(resolve, reject);
							this.writeToFile(data);
						}, reject);
					}

					var _id = data._id.toString();
					this.collection.findAndModify({
						'query': {
							'_id': data._id
						},
						'update': {
							'$set': {
								'_createdBy': _id.toString(),
								'_modifiedBy': _id.toString()
							}
						},
						'new': true
					}, (error, data) => {
						this.postCommand(constants.ACTION.READ, constants.EVENT.AFTER_CREATE, data).then(resolve, reject);
						this.writeToFile(data);
					});
				});
			}, reject);
		});
	}

	/**
	 * Retrieves multiple documents.
	 * @param {query} [query] Query to filter the documents.
	 * @param {object} [sort] Sorts the documents being returned.
	 * @param {number} [limit] Limit the number of documents being returned.
	 * @param {number} [skip] Skip the provided number of documents.
	 * @returns {Promise}
	 */
	find (query, sort, limit, skip, fields) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.READ, constants.EVENT.BEFORE_READ, query).then((result) => {
				var {query} = result;
				// get the total
				this.collection.count(query, (error, total) => {
					if (error) {
						return reject(error);
					}

					let projection;
					if (fields && fields.length > 0) {
						projection = {};
						fields.split(',').forEach((field) => {
							projection[field] = true;
						});
					}

					// get the data
					this.collection.find(query, projection)
						.sort(sort || {_created: -1})
						.limit(limit || 100)
						.skip(skip || 0, (error, data) => {
							if (error) {
								return reject(error);
							}

							// resolve sanitized data and total
							this.postCommand(constants.ACTION.READ, constants.EVENT.AFTER_READ, data).then((data) => {
								resolve({
									'data': data,
									'total': total
								});
							}, reject);
						});
				});
			}, reject);
		});
	}

	/**
	 * Retrieves a single document
	 * @param {object} [query] Query to filter the documents.
	 * @returns {Promise}
	 */
	findOne (query) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.READ, constants.EVENT.BEFORE_READ, query).then((result) => {
				var {query} = result;
				// find the item
				this.collection.findOne(query, (error, data) => {
					if (error) {
						return reject(error);
					}

					if (!data) {
						return reject(constants.ERROR.NOT_FOUND);
					}

					this.postCommand(constants.ACTION.READ, constants.EVENT.AFTER_READ, data).then(resolve, reject);
				}, reject);
			}, reject);
		});
	}

	/**
	 * Update documents
	 * @param {object} query Update documents matching the specified query.
	 * @param {object} data Updated document data.
	 * @returns {Promise}
	 */
	update (query, data) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.UPDATE, constants.EVENT.BEFORE_UPDATE, query, data).then((result) => {
				var {query, data} = result;
				var document = clone(data);
				document._modified = new Date();
				document._modifiedBy = this.user ? this.user._id.toString() : 'anonymous';
				delete document._id;

				this.collection.findAndModify({
					'query': query,
					'update': {'$set': document},
					'new': true
				}, (error, data) => {
					if (error) {
						return reject(error);
					}

					if (!data) {
						return reject(constants.ERROR.NOT_FOUND);
					}

					this.postCommand(constants.ACTION.READ, constants.EVENT.AFTER_UPDATE, data).then(resolve, reject);
					this.writeToFile(data);
				});
			}, reject);
		});
	}

	/**
	 * Delete documents
	 * @param {object} query Delete documents matching the specified query.
	 * @returns {Promise}
	 */
	delete (query) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.DELETE, constants.EVENT.BEFORE_DELETE, query).then((result) => {
				var {query} = result;
				this.collection.findOne(query, (error, data) => {
					if (error) {
						return reject(error);
					}

					if (!data) {
						return reject(constants.ERROR.NOT_FOUND);
					}

					this.collection.remove(query, (error) => {
						if (error) {
							return reject(error);
						}

						this.postCommand(constants.ACTION.READ, constants.EVENT.AFTER_DELETE, data).then(resolve, reject);
					})
				});
			}, reject);
		});
	}

	/**
	 * Trigger events and perform ACLs before CRUD operations are executed.
	 * @private
	 * @param {string} actionName Name of the action being performed.
	 * @param {string} eventName Name of the event to trigger.
	 * @param {object} query Query of the CRUD operation.
	 * @param {object} data Data of the CRUD operation.
	 * @returns {Promise}
	 */
	preCommand (actionName, eventName, query, data) {
		return new Promise((resolve, reject) => {
			Event.trigger(this.name, eventName, this.user, query, data).then((result) => {
				var {query, data} = result;
				Acl.permit(this.name, actionName, this.user, query).then((query) => {
					if (data) {
						Acl.sanitize(this.name, actionName, this.user, data).then((data) => {
							resolve({query, data});
						}, reject);
					} else {
						resolve({query});
					}
				}, reject);
			}, reject);
		});
	}

	/**
	 * Trigger events and perform ACLs after CRUD operations are executed.
	 * @private
	 * @param {string} actionName Name of the action being performed.
	 * @param {string} eventName Name of the event to trigger.
	 * @param {object} data Data of the CRUD operation.
	 * @returns {Promise}
	 */
	postCommand (actionName, eventName, data) {
		return new Promise((resolve, reject) => {
			Acl.sanitize(this.name, actionName, this.user, data).then((data) => {
				Event.trigger(this.name, eventName, this.user, null, data).then((result) => {
					resolve(result.data)
				}, reject);
			}, reject);
		});
	}

	/**
	 * Writes the specified document to the ../data folder when in development mode;
	 * @private
	 * @param {object} data Data to write.
	 */
	writeToFile (data) {
		if (process.env.NODE_ENV !== 'development') {
			return;
		}

		let clonedData = _.cloneDeep(data);
		mongoify(clonedData);
		jsonfile.writeFile('./data/' + this.name + '.' + data._id + '.json', clonedData);
	}
};