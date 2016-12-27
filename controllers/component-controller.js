'use strict';

const BaseController = require('./base-controller');
const db = require('../lib/db');;

module.exports = class ComponentController extends BaseController {
	constructor (server) {
		super(server);
		this.server.app.get('/components/:id', function(request, response, next) {
			db.collection('components').findOne({
				_id: db.ObjectId(request.params.id)
			}, (error, component) => {
				if (!component) {
					return next();
				}

				response.render('../templates/component', { component });
			});
		});
	}
};