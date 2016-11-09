'use strict';

const constants = require('../lib/constants');

module.exports = class BaseController {
	constructor (server) {
		this.server = server;
	}

	respondWithDataFn (request, response) {
		return (data) => {
			this.server.result(request, response, data);
		};
	}

	respondWithErrorFn (request, response) {
		return (error) => {
			if (error === constants.ERROR.NOT_FOUND) {
				return this.server.error(request, response, error, 404);
			}

			if (error === constants.ERROR.FORBIDDEN) {
				return this.server.error(request, response, error, 403);
			}

			this.server.error(request, response, error);
		};
	}
};