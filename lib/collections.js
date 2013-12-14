(function() {
  'use strict';

  var mongooseAcl = require('mongoose-acl');
  var mongooseTimes = require('mongoose-times');
  var mongooseFilter = require('mongoose-filter-denormalize').filter;

  module.exports = function(server) {

    // init settings.json collections
    for (var i = 0; i < server.settings.collections.length; i++) {
      module.exports.registerCollection(
        server,
        server.settings.collections[i].name,
        server.settings.collections[i].definition,
        server.settings.collections[i].filter);
    }

    // init mongo schemas
    if (module.exports.schemas.collections) {

      var schema = module.exports.schemas.collections;
      var model = server.mongoose.model('collections', schema);

      // get the data
      model.find(function(error, data) {
        if (!error) {

          for (var i = 0; i < data.length; i++) {
            module.exports.registerCollection(
              server,
              data[i].name,
              data[i].definition,
              data[i].filter);
          }

        } else {
          throw 'Failed to load schemas from MongoDB';
        }
      });
    }

    // create
    server.app.post('/api/:schema', function(request, response) {
      module.exports.create(server, request, response);
    });

    // read list
    server.app.get('/api/:schema', function(request, response) {
      module.exports.find(server, request, response);
    });

    // read single
    server.app.get('/api/:schema/:id', function(request, response) {
      module.exports.findById(server, request, response);
    });

    // update
    server.app.put('/api/:schema/:id', function(request, response) {
      module.exports.update(server, request, response);
    });

    // delete
    server.app.delete('/api/:schema/:id', function(request, response) {
      module.exports.delete(server, request, response);
    });

    return function(request, response, next) {
      next();
    }.bind(module.exports);
  };


  module.exports.schemas = {};
  module.exports.models = {};
  module.exports.registerCollection = function(server, name, definition, filter) {

    var schema = new server.mongoose.Schema(definition);
    if (name === 'users') {

      // acl plugin
      schema.plugin(mongooseAcl.subject, {
        key: function() {
          return 'user:' + this._id;
        },
        additionalKeys: function() {
          return this.roles.map(function(role) {
            return 'role:' + role;
          });
        }
      });
      schema.plugin(mongooseAcl.object);
    } else {

      // acl plugin
      schema.plugin(mongooseAcl.object);
    }

    // timestamp plugin
    schema.plugin(mongooseTimes, {
      created: '_created',
      lastUpdated: '_modified'
    });

    // filter properties plugin
    schema.plugin(mongooseFilter, filter);

    // save schema
    module.exports.schemas[name] = schema;

    // create model from scema
    module.exports.models[name] = server.mongoose.model(name, schema);
  };
  module.exports.unregisterCollection = function(server, name) {

    delete module.exports.schemas[name];
    delete module.exports.models[name];
    delete server.mongoose.models[name];
    delete server.mongoose.modelSchemas[name];

    for (var i = 0; i < server.mongoose.connections.length; i++) {
      delete server.mongoose.connections[i].collections[name];
    }
  };

  module.exports.create = function(server, request, response) {

    // create model from scema
    var Model = module.exports.models[request.route.params.schema];

    // create resource from request body
    var a = new Model(request.body);

    // set acl
    a.asObject.setAccess(request.user, ['read', 'write', 'delete']);
    a.asObject.setAccess('role:admin', ['read', 'write', 'delete']);

    // save the resource
    a.save(function(error) {

      // respond with an error
      if (error) {
        server.error(request, response, error, 500);
        return;
      }

      if (request.route.params.schema === 'collections') {
        module.exports.registerCollection(server, a.name, a.definition, a.filter);
      }

      // redirect to new resource
      response.writeHead(201, {
        'Content-Type': 'application/json',
        'Location': '/api/collections/' + request.route.params.schema + '/' + a._id
      });
      response.write(JSON.stringify(a));
      response.end();
    });
  };

  module.exports.find = function(server, request, response) {

    var model = module.exports.models[request.route.params.schema];

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

    // parse query
    if (request.query.sort) {
      try {
        request.query.sort = JSON.parse(request.query.sort);
      } catch (error) {

      }
    }

    // get total
    model.count(request.query.conditions, function(error, total) {

      // respond with an error
      if (error) {
        server.error(request, response, error, 500);
        return;
      }

      // role for filtering
      var role = module.exports.getUserRole(request);

      // get the data
      model.find(request.query.conditions, model.getReadFilterKeys(role), {
        'skip': request.query.skip,
        'limit': request.query.limit || 20,
        'sort': request.query.sort || {
          _created: -1
        }
      }, function(error, data) {

        // respond with an error
        if (error) {
          server.error(request, response, error, 500);
        }

        // response with data and total
        server.result(request, response, {
          'data': data,
          'total': total
        });
      });
    });
  };

  module.exports.findById = function(server, request, response) {

    // role for filtering
    var role = module.exports.getUserRole(request);

    // find the item
    var model = module.exports.models[request.route.params.schema];
    model.findById(request.route.params.id, model.getReadFilterKeys(role), function(error, item) {

      // respond with an error
      if (error) {
        server.error(request, response, error, 500);
        return;
      }

      // respond with a 404
      if (!item) {
        server.error(request, response, 'Not Found', 404);
        return;
      }

      server.result(request, response, item);
    });
  };

  module.exports.update = function(server, request, response) {

    var model = module.exports.models[request.route.params.schema];

    // role for filtering
    var role = module.exports.getUserRole(request);

    // id's can't be updated
    if (request.body._id) {
      request.body._id = undefined;
    }

    // find by id and update
    model.findByIdAndUpdate(request.route.params.id, request.body, {
      'new': true
    }, function(error, item) {

      // respond with an error
      if (error) {
        server.error(request, response, error, 500);
        return;
      }

      // respond with a 404
      if (!item) {
        server.error(request, response, 'Not Found', 404);
        return;
      }

      // register updated collection
      // TODO: update to change collection name
      if (request.route.params.schema === 'collections') {
        module.exports.unregisterCollection(server, request.body.name);
        module.exports.registerCollection(server, request.body.name, request.body.definition, request.body.filter);
      }

      // update user session
      if (request.route.params.schema === 'users') {
        if (request.user && request.user._id && item) {
          if (request.user._id.toString() === item._id.toString()) {
            request.user = JSON.parse(JSON.stringify(item));
          }
        }
      }

      // apply filter to the item
      item.applyReadFilter(role);

      // return updated user
      server.result(request, response, item);
    });
  };

  module.exports.delete = function(server, request, response) {

    // role for filtering
    var role = module.exports.getUserRole(request);

    // delete the item by id
    var model = module.exports.models[request.route.params.schema];
    model.findByIdAndRemove(request.route.params.id, function(error, item) {

      // respond with an error
      if (error) {
        server.error(request, response, error, 500);
        return;
      }

      // respond with a 404
      if (!item) {
        server.error(request, response, 'Not Found', 404);
        return;
      }

      // un-register the collection
      if (request.route.params.schema === 'collections') {
        module.exports.unregisterCollection(server, item.name);
      }

      // apply filter to the item
      item.applyReadFilter(role);

      server.result(request, response, item);
    });
  };

  module.exports.getUserRole = function(request) {
    // filter data
    var role, user;
    if (request.user) {
      user = JSON.parse(JSON.stringify(request.user));
      // user = request.user;
    }

    // determine user's role
    if (user && user.roles && user.roles.length > 0) {

      // TODO: update to support multiple rows.
      role = user.roles[0];
    } else {
      role = 'public';
    }

    return role;
  };
})();