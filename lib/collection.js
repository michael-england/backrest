'use strict';

const clone = require('clone');
const db = require('./db');
const Acl = require('./acl');
const constants = require('./constants');

module.exports = class Collection {
	constructor (name, user) {
		this.name = name;
		this.user = user;
		this.collection = db.collection(this.name);
	}

	create (data) {
		return new Promise((resolve, reject) => {
			Acl.permit(this.name, constants.ACTION.CREATE, this.user).then(() => {
				Acl.sanitize(this.name, constants.ACTION.CREATE, this.user, data).then((data) => {
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
							return Acl.sanitize(this.name, constants.ACTION.READ, this.user, data).then(resolve, reject);
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
							Acl.sanitize(this.name, constants.ACTION.READ, data, data).then(resolve, reject);
						});
					});
				}, reject);
			}, reject);
		});
	}

	find (query, sort, limit, skip) {
		return new Promise((resolve, reject) => {
			Acl.permit(this.name, constants.ACTION.READ, this.user, query).then((query) => {

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
							Acl.sanitize(this.name, constants.ACTION.READ, this.user, data).then((data) => {
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
			Acl.permit(this.name, constants.ACTION.READ, this.user, query).then((query) => {

				// find the item
				this.collection.findOne(query, (error, data) => {
					if (error) {
						return reject(error);
					}

					if (!data) {
						return reject(constants.ERROR.NOT_FOUND);
					}

					Acl.sanitize(this.name, constants.ACTION.READ, this.user, data).then(resolve, reject);
				}, reject);
			}, reject);
		});
	}

	update (query, data) {
		return new Promise((resolve, reject) => {
			Acl.permit(this.name, constants.ACTION.UPDATE, this.user, query).then((query) => {
				Acl.sanitize(this.name, constants.ACTION.UPDATE, this.user, data).then((data) => {
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

						Acl.sanitize(this.name, constants.ACTION.READ, this.user, data).then(resolve, reject);
					});
				}, reject);
			}, reject);
		});
	}

	delete (query) {
		return new Promise((resolve, reject) => {
			Acl.permit(this.name, constants.ACTION.DELETE, this.user, query).then((query) => {
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

						Acl.sanitize(this.name, constants.ACTION.READ, this.user, data).then(resolve, reject);
					})
				});
			}, reject);
		});
	}
};