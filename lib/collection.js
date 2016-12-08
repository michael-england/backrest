'use strict';

const _ = require('lodash');
const jsonfile = require('jsonfile');
const clone = require('clone');
const db = require('./db');
const Acl = require('./acl');
const Event = require('./event');
const constants = require('./constants');
const mongoify = require('mongoify');

module.exports = class Collection {
	constructor (name, user) {
		this.name = name;
		this.user = user;
		this.collection = db.collection(this.name);
		jsonfile.spaces = 2;
	}

	create (data) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.CREATE, constants.EVENT.BEFORE_CREATE, null, data).then((result) => {
				({data} = result);

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
						return Acl.sanitize(this.name, constants.ACTION.READ, this.user, sanitizedData).then(() => {
							this.writeToFile(data);
							resolve(sanitizedData);
						}, reject);
					}

					var _id = data._id.toString();
					this.collection.findAndModify({
						'query': {
							'_id': data._id
						},
						'update': {
							'$set': {
								'_createdBy': _id,
								'_modifiedBy': _id
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

	find (query, sort, limit, skip) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.READ, constants.EVENT.BEFORE_READ, query).then((result) => {
				({query} = result);
				// get the total
				this.collection.count(query, (error, total) => {
					if (error) {
						return reject(error);
					}

					// get the data
					this.collection.find(query)
						.sort(sort || {_created: -1})
						.limit(limit)
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

	findOne (query) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.READ, constants.EVENT.BEFORE_READ, query).then((result) => {
				({query} = result);
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

	update (query, data) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.UPDATE, constants.EVENT.BEFORE_UPDATE, query, data).then((result) => {
				({query, data} = result);
				var document = clone(data);
				document._modified = new Date();
				document._modifiedBy = this.user._id;
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

	delete (query) {
		return new Promise((resolve, reject) => {
			this.preCommand(constants.ACTION.DELETE, constants.EVENT.BEFORE_DELETE, query).then((result) => {
				({query} = result);
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

	preCommand (actionName, eventName, query, data) {
		return new Promise((resolve, reject) => {
			Event.trigger(this.name, eventName, this.user, {query, data}).then((result) => {
				({query, data} = result);
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

	postCommand (actionName, eventName, data) {
		return new Promise((resolve, reject) => {
			Acl.sanitize(this.name, actionName, this.user, data).then((data) => {
				Event.trigger(this.name, eventName, this.user, data).then(resolve, reject);
			}, reject);
		});
	}

	writeToFile (data) {
		if (process.env.NODE_ENV !== 'development') {
			return;
		}

		let clonedData = _.cloneDeep(data);
		mongoify(clonedData);
		jsonfile.writeFile('./data/' + this.name + '.' + data._id + '.json', clonedData);
	}
};