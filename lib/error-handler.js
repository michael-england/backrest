'use strict';

module.exports = class ErrorHandler {
	constructor (server) {
		/*eslint-disable */
		server.app.use((error, request, response, next) => {
			server.error(request, response, error);
		});
		/*eslint-enable */
	}
};