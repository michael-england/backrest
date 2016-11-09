'use strict';

const clone = require('clone');
const BaseController = require('./base-controller');
const Data = require('../lib/data');
const constants = require('../lib/constants');

module.exports = class CollectionController extends BaseController {
	constructor (server) {
		super(server);
		this.server.app.post('/api/:collection', this.create.bind(this));
		this.server.app.get('/api/:collection', this.find.bind(this));
		this.server.app.get('/api/:collection/:id', this.findById.bind(this));
		this.server.app.put('/api/:collection/:id', this.update.bind(this));
		this.server.app.delete('/api/:collection/:id', this.delete.bind(this));
	}

	create (request, response) {
		Data.collection(request.params.collection, request.user)
			.create(request.body)
			.then((data) => {
				this.server.result(request, response, data, 201, {
					'Content-Type': 'application/json',
					'Location': '/api/' + request.params.schema + '/' + data._id
				});
			})
			.catch(this.respondWithErrorFn(request, response));
	}

	find (request, response) {

		// set max limit
		if (request.query.limit && request.query.limit > 100) {
			request.query.limit = 100;
		} else {
			request.query.limit = parseInt(request.query.limit, 10);
		}

		//  set skip
		if (request.query.skip) {
			request.query.skip = parseInt(request.query.skip, 10);
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

		Data.collection(request.params.collection, request.user)
			.find(request.query.conditions, request.query.sort, request.query.limit, request.query.skip)
			.then(this.respondWithDataFn(request, response))
			.catch(this.respondWithErrorFn(request, response));
	}

	findById (request, response) {
		Data.collection(request.params.collection, request.user)
			.findOne({
				'_id': Data.ObjectId(request.params.id)
			})
			.then(this.respondWithDataFn(request, response))
			.catch(this.respondWithErrorFn(request, response));
	}

	update (request, response) {
		Data.collection(request.params.collection, request.user)
			.update({'_id': Data.ObjectId(request.params.id)}, request.body)
			.then((data) => {

				// update user session
				if (request.params.collection === constants.COLLECTION.USERS &&
					request.user && request.user._id &&
					request.user._id.toString() === data._id.toString()) {
					request.user = clone(data);
				}

				this.server.result(request, response, data);
			})
			.catch(this.respondWithErrorFn(request, response));
	}

	delete (request, response) {
		Data.collection(request.params.collection, request.user)
			.delete({
				'_id': Data.ObjectId(request.params.id)
			})
			.then(this.respondWithDataFn(request, response))
			.catch(this.respondWithErrorFn(request, response));
	}
};