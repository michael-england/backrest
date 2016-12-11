'use strict';

/**
 * Handle server errors
 * @type {ErrorHandler}
 */
module.exports = class ErrorHandler {
	/**
	 * Creates a new error handler for the provided server
	 * @param server {Object}
	 */
	constructor (server) {
		/*eslint-disable */
		server.app.use((error, request, response, next) => {
			server.error(request, response, error);
		});
		/*eslint-enable */
	}
};