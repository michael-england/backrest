exports.userExists = function(server, request, value, json, isValid) {
    var query = {};
    query[(!server.settings.httpAuthUsernameField ? "email" : server.settings.authentication.usernameField)] = value;
    server.db[server.settings.authentication.collection].count(query, function(error, result) {
        if (error) {
            isValid(false);
        } else {
            if (result === 0) {
                isValid(true);
            } else {
                isValid(false);
            }
        }
    });
};