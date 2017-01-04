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

				if (component.components && component.components.length > 0) {
					db.collection('components').find({
						_id: {
							$in: component.components.map((id) => {
								return db.ObjectId(id);
							})
						}
					}, (error, components) => {
						if (components.length > 0) {
							component.components = components;
						}

						response.render('../templates/component', { component, rmWhitespace: true});
					});
				} else {
					response.render('../templates/component', { component, rmWhitespace: true});
				}
			});
		});
	}
};