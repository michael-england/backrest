'use strict';

const clone = require('clone');

module.exports = class CollectionController {
	constructor (server) {
		this.server = server;
		this.server.app.post('/api/:collection', this.create.bind(this));
		this.server.app.get('/api/:collection', this.find.bind(this));
		this.server.app.get('/api/:collection/:id', this.findById.bind(this));
		this.server.app.put('/api/:collection/:id', this.update.bind(this));
		this.server.app.delete('/api/:collection/:id', this.delete.bind(this));
	}

	create (request, response) {
		var collection = this.server.db.collection(request.params.collection);
		var document = clone(request.body);
		document._created = new Date();
		document._createdBy = request.user._id;
		document._modified = new Date();
		document._modifiedBy = request.user._id;

		// save the resource
		collection.save(document, (error, data) => {
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			// redirect to new resource
			this.server.result(request, response, data, 201, {
				'Content-Type': 'application/json',
				'Location': '/api/' + request.params.schema + '/' + data._id
			});
		});
	}

	find (request, response) {
		var collection = this.server.db.collection(request.params.collection);

		// set max limit
		if (request.query.limit && request.query.limit > 100) {
			request.query.limit = 100;
		}

		// parse query
		if (request.query.conditions) {
			try {
				request.query.conditions = JSON.parse(request.query.conditions);
			} catch (error) {
			}
		}

		// parse sort
		if (request.query.sort) {
			try {
				request.query.sort = JSON.parse(request.query.sort);
			} catch (error) {
			}
		}

		// get total
		collection.count(request.query.conditions, (error, total) => {
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			// get the data
			collection.find(request.query.conditions)
				.sort(request.query.sort || {_created: -1})
				.limit(parseInt(request.query.limit, 10))
				.skip(parseInt(request.query.skip, 10), (error, data) => {
					if (error) {
						return this.server.error(request, response, error, 500);
					}

					// response with data and total
					this.server.result(request, response, {
						'data': data,
						'total': total
					});
				});
		});
	}

	findById (request, response) {
		var collection = this.server.db.collection(request.params.collection);

		// find the item
		collection.findOne({
			'_id': this.server.db.ObjectId(request.params.id)
		}, (error, data) => {
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			if (!data) {
				return this.server.error(request, response, 'Not Found', 404);
			}

			this.server.result(request, response, data);
		});
	}

	update (request, response) {
		var collection = this.server.db.collection(request.params.collection);
		var document = clone(request.body);
		document._modified = new Date();
		document._modifiedBy = request.user._id;
		delete document._id;

		collection.findAndModify({
			'query': {'_id': this.server.db.ObjectId(request.params.id)},
			'update': {'$set': document},
			'new': true
		}, (error, data) => {
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			if (!data) {
				return this.server.error(request, response, 'Not Found', 404);
			}

			// update user session
			if (request.params.collection === 'users' &&
				request.user && request.user._id &&
				request.user._id.toString() === data._id.toString()) {
				request.user = clone(data);
			}

			// return updated user
			this.server.result(request, response, data);
		});
	}

	delete (request, response) {
		var collection = this.server.db.collection(request.params.collection);
		var condition = {
			'_id': this.server.db.ObjectId(request.params.id)
		};

		collection.findOne(condition, (error, data) => {
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			if (!data) {
				return this.server.error(request, response, 'Not Found', 404);
			}

			collection.remove(condition, (error) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				this.server.result(request, response, data);
			})
		});
	}
};