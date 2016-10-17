'use strict';

module.exports = class ErrorHandler{
	constructor (server) {
		server.app.use((error, request, response, next) => {
			server.error(request, response, error);
		});
	}	
};