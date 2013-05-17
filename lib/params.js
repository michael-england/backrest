exports.get = function (server, collection, method, action, params) {

	var settingsParams = server.settings.collections[collection][method][action].params;
	if (settingsParams !== null && settingsParams !== undefined) {
		var keys = Object.keys(settingsParams);
		for (var i = 0; i < keys.length; i++) {
			params[keys[i]] = settingsParams[keys[i]];
		}
	}

	return params;
};