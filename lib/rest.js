var mongoose = require('mongoose');
var url = require("url");


module.exports = function(server) {

    mongoose.connect(server.settings.databaseUrl);

    var schemas = Object.keys(server.settings.schemas);
    for (var i = 0; i < schemas.length; i++) {
        var schema = new mongoose.Schema(server.settings.schemas[schemas[i]]);
        module.exports.schemas[schemas[i]] = schema;
    }

    server.app.post("/rest/:schema", function(request, response) {
        module.exports.create(server, request, response);
    });

    server.app.get("/rest/:schema", function(request, response) {
        module.exports.find(server, request, response);
    });

    server.app.get("/rest/:schema/:id", function(request, response) {
        module.exports.findById(server, request, response);
    });

    server.app.put("/rest/:schema/:id", function(request, response) {
        module.exports.update(server, request, response);
    });

    server.app.delete("/rest/:schema/:id", function(request, response) {
        module.exports.delete(server, request, response);
    });

    return function(request, response, next) {
        next();
    }.bind(module.exports);
};

module.exports.schemas = {};

module.exports.create = function(server, request, response) {
    var schema = module.exports.schemas[request.route.params.schema];
    var model = mongoose.model(request.route.params.schema, schema);

    var a = new model(request.body);
    a.save(function (error) {
        if (!error) {

            // redirect to new resource
            response.writeHead(201, { 
                "Content-Type": "application/json", 
                "Location": "/rest/" + request.route.params.schema + "/" + a._id 
            });
            response.write(JSON.stringify(a));
            response.end();

        } else {    

            // respond with an error
            server.error(request, response, error);     
        }
    });
};

module.exports.find = function(server, request, response) {
    var schema = module.exports.schemas[request.route.params.schema];
    var model = mongoose.model(request.route.params.schema, schema);

    // set max limit
    if (request.query.limit) {
        if (request.query.limit > 100) {
            request.query.limit = 100;
        }
    }

    // parse query
    if (request.query.conditions) {
        try {
            request.query.conditions = JSON.parse(request.query.conditions);
        } catch (error) {

        }
    }

    // get total
    model.count(request.query.conditions, function (error, total) {
        if (!error) {

            // get the data
            model.find(request.query.conditions, undefined, {
                "skip": request.query.skip,
                "limit": request.query.limit || 20
            }, function(error, data) {
                if (!error) {

                    // response with data and total
                    server.result(request, response, {
                        "data": data,
                        "total": total
                    });
                } else {

                    // respond with an error
                    server.error(request, response, error);
                }
            });
        } else {

            // respond with an error
            server.error(request, response, error);
        }
    });
};

module.exports.findById = function(server, request, response) {
    var schema = module.exports.schemas[request.route.params.schema];
    var model = mongoose.model(request.route.params.schema, schema);

    model.findById(request.route.params.id, function(error, item) {
        if (!error) {
            server.result(request, response, item);
        } else {
            server.error(request, response, error);
        }
    });
};

module.exports.update = function(server, request, response) {
    var schema = module.exports.schemas[request.route.params.schema];
    var model = mongoose.model(request.route.params.schema, schema);

    model.findByIdAndUpdate(request.route.params.id, request.body, { "new": true }, function(error, item) {
        if (!error) {
            server.result(request, response, item);
        } else {
            server.error(request, response, error);
        }
    });
};

module.exports.delete = function(server, request, response) {
    var schema = module.exports.schemas[request.route.params.schema];
    var model = mongoose.model(request.route.params.schema, schema);

    model.findByIdAndRemove(request.route.params.id, function(error, item) {
        if (!error) {
            server.result(request, response, item);
        } else {
            server.error(request, response, error);
        }
    });
};