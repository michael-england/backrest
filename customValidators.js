exports.userExists = function (server, value, isValid) {
    var query = {};
    query[(!server.settings.httpAuthUsernameField ? "email" : server.settings.httpAuthUsernameField)] = value;
    
    server.db[server.settings.httpAuthCollection].count(query, function (error, result) {
        if(error) {
            isValid(false);
        } else {
            if (result === 0) {
                isValid(true);
            } else {
                isValid(false);  
            }
        }
    });
}