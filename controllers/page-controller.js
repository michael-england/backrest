'use strict';

const BaseController = require('./base-controller');
const db = require('../lib/db');

module.exports = class PageController extends BaseController {
	constructor (server) {
		super(server);
		this.server.app.get('/:path*?', function (request, response, next) {
			db.collection('pages').findOne({
				path: request.params.path || 'index'
			}, (error, page) => {
				if (!page) {
					return next();
				}

				db.collection('components').find({
					_id: {
						$in: page.components.map((id) => {
							return db.ObjectId(id);
						})
					}
				}, (error, components) => {
					if (components.length > 0) {
						page.components = components;
					}

					response.render('../templates/page', {page, rmWhitespace: true});
				});
			});
		});
	}
};