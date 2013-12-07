'use strict';

var read = require('read');
var crypto = require('crypto');
var fs = require('fs');
var passport = require('passport');
var passportLocalMongoose = require('passport-local-mongoose');
var mongooseAcl = require('mongoose-acl');
var mongooseTimes = require('mongoose-times');
var mongooseFilter = require('mongoose-filter-denormalize').filter;

module.exports = function(server, callback) {

  // create the roles
  module.exports.createRoles(server, function() {

    // create the admin account
    module.exports.createAdminAccount(server, function() {

      // mark as completed and save to settings
      server.settings.setup.completed = true;
      fs.writeFileSync('./INSTALLED', '');

      // clear the screen
      console.log('\u001B[2J\u001B[0;0f');

      // execute any callback
      if (callback) {
        callback();
      }
    });
  });
};

module.exports.createRoles = function(server, callback) {

  function saveRole() {
    var name = roles.pop();

    var role = module.exports.RoleModel({
      'name': name
    });

    role.save(function(error, role) {
      if (error) {
        throw error;
      }

      if (--total) {
        saveRole();
      } else {

        // clean up mongoose    
        delete server.mongoose.models.role;
        delete server.mongoose.modelSchemas.role;
        for (var i = 0; i < server.mongoose.connections.length; i++) {
          delete server.mongoose.connections[i].collections.roles;
        }

        if (callback) {
          callback();
        }
      }
    })
  };

  try {

    // clear the screen
    console.log('\u001B[2J\u001B[0;0f');

    // look for user schema in settings
    var collection;
    for (var i = 0; i < server.settings.collections.length; i++) {
      if (server.settings.collections[i].name === 'roles') {
        collection = server.settings.collections[i];
        break;
      }
    }
    var RoleSchema = new server.mongoose.Schema(collection.definition);

    //timestamp plugin
    RoleSchema.plugin(mongooseTimes, {
      'created': '_created',
      'lastUpdated': '_modified'
    });

    // create model from schema
    module.exports.RoleModel = server.mongoose.model('role', RoleSchema);

    var roles = JSON.parse(JSON.stringify(server.settings.setup.defaults.roles));
    var total = roles.length;

    saveRole();

  } catch (error) {
    console.log('Failed to create roles, so exiting.')
    process.exit();
  }
};

module.exports.createAdminAccount = function(server, callback) {
  try {

    // clear the screen for setup
    console.log('\u001B[2J\u001B[0;0f');

    server.app.use(passport.initialize());

    // look for user schema in settings
    var collection;
    for (var i = 0; i < server.settings.collections.length; i++) {
      if (server.settings.collections[i].name === 'users') {
        collection = server.settings.collections[i];
        break;
      }
    }
    var UserSchema = new server.mongoose.Schema(collection.definition);

    // acl plugin
    UserSchema.plugin(mongooseAcl.subject, {
      key: function() {
        return 'user:' + this._id;
      },
      additionalKeys: function() {
        return this.roles.map(function(role) {
          return 'role:' + role;
        });
      }
    });
    UserSchema.plugin(mongooseAcl.object);

    //passport plugin
    UserSchema.plugin(passportLocalMongoose, {
      'usernameField': 'email'
    });

    //timestamp plugin
    UserSchema.plugin(mongooseTimes, {
      'created': '_created',
      'lastUpdated': '_modified'
    });

    // create model from schema
    module.exports.UserModel = server.mongoose.model('user', UserSchema);

    // setup passport
    passport.use(module.exports.UserModel.createStrategy());

    console.log('Before you get started, let\'s create an admin account.');
    read({
      'prompt': 'Email Address: '
    }, function(error, email) {
      module.exports.createAdminAccountPassword(function(password) {
        read({
          'prompt': 'First Name: '
        }, function(error, firstName) {
          process.stdout.write('\n');
          read({
            'prompt': 'Last Name: '
          }, function(error, lastName) {

            var user = module.exports.UserModel({
              'email': email,
              'firstName': firstName,
              'lastName': lastName,
              'roles': ['admin'],
              'isConfirmed': true,
              '_acl': {}
            });

            user._acl['user:' + user._id] = [
              'read',
              'write',
              'delete'
            ];

            user._acl['role:admin'] =
              [
              'read',
              'write',
              'delete'
            ];

            user.setPassword(password, function(error, user) {
              try {
                user.save(function(error) {

                  // log any errors
                  if (error) {
                    console.log(error);
                    return;
                  }

                  // failed to create user
                  if (!user) {
                    console.log('Failed to create user. Restart Backrest to create an admin account.');
                    return;
                  }

                  // clean up mongoose    
                  delete server.mongoose.models.user;
                  delete server.mongoose.modelSchemas.user;
                  for (var i = 0; i < server.mongoose.connections.length; i++) {
                    delete server.mongoose.connections[i].collections.users;
                  }

                  if (callback) {
                    callback(error, user);
                  }
                });
              } catch (error) {
                console.log('Failed to create admin account, so exiting.')
                process.exit();
              }
            });
          });
        });
      });
    });
  } catch (error) {
    console.log('Failed to create admin account, so exiting.')
    process.exit();
  }
};

module.exports.createAdminAccountPassword = function(callback) {
  process.stdout.write('\n');
  read({
    'prompt': 'Password: \r',
    'silent': true,
    'replace': '*'
  }, function(error, password) {
    read({
      'prompt': 'Confirm Password: \r',
      'silent': true,
      'replace': '*'
    }, function(error, confirmPassword) {
      if (password !== confirmPassword) {
        console.log('Passwords do not match.')
        module.exports.createAdminAccountPassword(callback);
      } else {
        if (callback) {
          callback(password);
        }
      }
    });
  });
};