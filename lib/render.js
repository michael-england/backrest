var url = require("url");
var path = require("path");
var fs = require("fs");

module.exports = function(server) {
	return function(request, response, next) {
		// see if file exists
		var uri = url.parse(request.url).pathname;
		var filename = path.join(server.path, uri);
		fs.exists("./lib/" + filename + ".js", function(exists) {
			if (exists) {

				var file = require("./lib/" + filename + ".js");
				if (file.render !== undefined) {

					// respond with a rendered page
					file.render(server, request, response);
				} else {

					// respond with a 404
					response.writeHead(404, {
						"Content-Type": "text/plain"
					});
					response.write("404 Not Found\n");
					response.end();
				}
			} else {
				next();
			}
		}.bind(this));
	};
};