'use strict';

var crypto = require('crypto');
var passwordHash = require('password-hash');
var passport = require('passport');
var passportLocalMongoose = require('passport-local-mongoose');
var mongoose = require('mongoose');
var mongooseAcl = require('mongoose-acl');
var mongooseTimes = require('mongoose-times');
var mongooseFilter = require('mongoose-filter-denormalize').filter;
var Schema = mongoose.Schema;

module.exports.UserModel = undefined

module.exports = function(server) {

  server.app.use(passport.initialize());
  server.app.use(passport.session());

  // look for user schema in settings
  var collection;
  for (var i = 0; i < server.settings.collections.length; i++) {
    if (server.settings.collections[i].name === 'users') {
      collection = server.settings.collections[i];
      break;
    }
  }
  var UserSchema = new Schema(collection.definition);

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

  // passport plugin
  UserSchema.plugin(passportLocalMongoose, {
    usernameField: 'email'
  });

  // timestamp plugin
  UserSchema.plugin(mongooseTimes, {
    created: '_created',
    lastUpdated: '_modified'
  });

  // filter properties plugin
  UserSchema.plugin(mongooseFilter, collection.filter);

  // create model from schema
  module.exports.UserModel = mongoose.model('user', UserSchema);

  // setup passport
  passport.use(module.exports.UserModel.createStrategy());
  passport.serializeUser(module.exports.UserModel.serializeUser());
  passport.deserializeUser(module.exports.UserModel.deserializeUser());

  // login
  server.app.post('/api/users/login', passport.authenticate('local'), function(request, response) {
    module.exports.login(server, request, response);
  });

  // logout
  server.app.get('/api/users/logout', function(request, response) {
    module.exports.logout(server, request, response);
  });

  // register
  server.app.post('/api/users', function(request, response) {
    module.exports.create(server, request, response);
  });

  // reset password
  server.app.post('/api/users/reset-password', function(request, response) {
    module.exports.resetPassword(server, request, response);
  });

  // reset password request
  server.app.post('/api/users/reset-password-request', function(request, response) {
    module.exports.resetPasswordRequest(server, request, response);
  });

  // confirm email
  server.app.post('/api/users/confirm-email', function(request, response) {
    module.exports.confirmEmail(server, request, response);
  });

  // confirm email request
  server.app.post('/api/users/confirm-email-request', function(request, response) {
    module.exports.confirmEmailRequest(server, request, response);
  });

  // current
  server.app.get('/api/users/current', function(request, response) {
    module.exports.current(server, request, response);
  });

  // current user is in role
  server.app.post('/api/users/current/is-in-role', function(request, response) {
    module.exports.currentIsInRole(server, request, response);
  });

  // current user change password
  server.app.post('/api/users/current/change-password', function(request, response) {
    module.exports.currentChangePassword(server, request, response);
  });

  return function(request, response, next) {
    next();
  }.bind(module.exports);
};

module.exports.login = function(server, request, response) {
  request.user.applyReadFilter('owner');
  server.result(request, response, request.user);
};

module.exports.logout = function(server, request, response) {
  request.logout();
  server.result(request, response, true);
};

module.exports.create = function(server, request, response) {
  var a = new module.exports.UserModel(request.body);

  // set acl
  a.setAccess(a, ['read', 'write', 'delete']);
  a.setAccess('role:admin', ['read', 'write', 'delete']);

  // create th15e new user
  module.exports.UserModel.register(a, request.body.password, function(error, user) {
    if (error) {
      server.error(request, response, error);
    } else {
      user.applyReadFilter('owner');
      server.result(request, response, user);
    }
  });
};

module.exports.resetPassword = function(server, request, response) {

};

module.exports.resetPasswordRequest = function(server, request, response) {

  var model = new module.exports.UserModel();
  var condition = {
    'email': request.body.email
  };

  // get the data
  model.findOne(condition, undefined, function(error, user) {
    if (!error) {
      if (!user) {

        // return result
        server.result(request, response, false);

      } else {

        this.sendConfirmEmail(function(error) {
          if (!error) {

            // return result
            server.result(request, response, true);
          } else {

            // log error
            console.log(error);

            // error sending mail
            server.error(request, response, error);
          }
        }.bind(this));
      }
    } else {

      // respond with an error
      server.error(request, response, error);
    }
  });
};

module.exports.confirmEmail = function(server, request, response) {

};

module.exports.confirmEmailRequest = function(server, request, response) {

  var model = new module.exports.UserModel();
  var condition = {
    'email': request.body.email
  };

  // get the data
  model.findOne(condition, undefined, function(error, user) {
    if (!error) {
      if (!user) {

        // return result
        server.result(request, response, false);

      } else {

        this.sendConfirmEmail(server, request, response, user, function(error) {
          if (!error) {

            // return result
            server.result(request, response, true);

          } else {

            // log error
            console.log(error);

            // error sending mail
            server.error(request, response, error);
          }
        }.bind(this));
      }

    } else {

      // respond with an error
      server.error(request, response, error);
    }
  });
};

module.exports.current = function(server, request, response) {
  if (request.user) {
    request.user.applyReadFilter('owner');
    server.result(request, response, request.user);
  } else {
    server.result(request, response, undefined);
  }
};

module.exports.currentIsInRole = function(server, request, response) {
  if (request.user) {

    // change the authenticated user
    var isInRole = false;

    var roles = request.user[server.settings.authentication.rolesField !== undefined ? server.settings.authentication.rolesField : 'roles'];
    if (roles !== undefined) {
      for (var i = 0; i < roles.length; i++) {
        if (roles[i] === request.body.role) {
          isInRole = true;
          break;
        }
      }
    }

    // return result
    server.result(request, response, isInRole);

  } else {
    server.result(request, response, false);
  }
};





module.exports.changePassword = function(server, request, response, params) {

  if (request.session.user) {
    var isValid = true;

    // filter the params
    params = filters.filter(server.settings, server.settings.authentication.collection, 'changePassword', 'default', params, 'in');

    // validate
    validators.validate(server, request, server.settings.authentication.collection, 'changePassword', 'default', params, function(validationSummary) {
      if (validationSummary !== true) {
        isValid = false;
      }

      if (isValid) {

        // temporarily save password and remove it from params
        var passwordField = (!server.settings.authentication.passwordField ? 'password' : server.settings.authentication.passwordField);
        var password = params[passwordField];
        delete params[passwordField];

        if (passwordHash.verify(password, request.session.user[passwordField])) {

          // ensure new password and password confirmation match
          if (params.newPassword == params.confirmPassword) {

            // encrypt the new password
            params[passwordField] = passwordHash.generate(params.newPassword);

            // removed new password and password confirmation
            delete params.newPassword;
            delete params.confirmPassword;

            // save changes to db
            var dbResult = function(error, result) {
              if (error) {

                // collection not provided, create procedure not found response
                server.error(request, response, -32603, 'Internal JSON-RPC error.');

              } else {
                // log password change
                console.log('Session ' + request.sessionID + ' has changed their password');

                // store new password in session
                request.session.user[passwordField] = params.newPassword;

                // return success
                server.result(request, response, 'Password successfully changed.');
              }

            };

            var update = {
              '$set': params
            };

            // write command to log
            console.log(request.sessionID + ': server.db.' + server.settings.authentication.collection + '.update({\'_id\':server.db.ObjectId(\'' + request.session.user._id.toString() + '\')},' + JSON.stringify(update) + ', dbResult);');

            // execute command
            server.db[server.settings.authentication.collection].update({
              '_id': request.session.user._id
            }, update, dbResult.bind(this));
          } else {

            // new password and password confirmation do not match
            server.error(request, response, -32000, 'New password and confirm password do not match.', validationSummary);
          }
        } else {

          // write to log
          console.log(request.sessionID + ': Invalid credentials.');

          // user currently not logged in
          server.error(request, response, -32000, 'Invalid credentials.', validationSummary);
        }
      } else {

        // write to log
        console.log(request.sessionID + ': Internal JSON-RPC error.');

        // validation not passed, return with error and validation summary
        server.error(request, response, -32603, 'Internal JSON-RPC error.', validationSummary);
      }
    }.bind(this));
  } else {

    // write to log
    console.log(request.sessionID + ': User not logged in.');

    // user currently not logged in
    server.error(request, response, -32000, 'User not logged in.', undefined);
    return;
  }
};

module.exports.passwordReset = function(server, request, response, params) {

  var isValid = true;

  // filter the params
  params = filters.filter(server.settings, server.settings.authentication.collection, 'passwordReset', 'default', params, 'in');

  var algorithm = server.settings.authentication.passwordResetToken.algorithm;
  var password = server.settings.authentication.passwordResetToken.password;
  var decipher = crypto.createDecipher(algorithm, password);
  var token = decipher.update(params.token, 'hex', 'utf8');
  token += decipher.final('utf8');
  token = JSON.parse(token);

  if (new Date() < new Date(token.expiration)) {

    var passwordField = (!server.settings.authentication.passwordField ? 'password' : server.settings.authentication.passwordField);
    var password = params[passwordField];

    // ensure new password and password confirmation match
    if (params.newPassword == params.confirmPassword) {

      // create params and encrypt the new password
      var params = {};
      params[passwordField] = passwordHash.generate(params.newPassword);

      // update the user
      server.db[server.settings.authentication.collection].update({
        '_id': server.db.ObjectId(token._id)
      }, {
        '$set': params
      }, function(error, result) {
        if (error) {

          // collection not provided, create procedure not found response
          server.error(request, response, -32603, 'Internal JSON-RPC error.');

        } else {
          // log password change
          console.log('Session ' + request.sessionID + ' has reset their password');

          // return success
          server.result(request, response, 'Password successfully reset.');
        }
      }.bind(this));
    } else {

      // new password and password confirmation do not match
      server.error(request, response, -32000, 'New password and confirm password do not match.', validationSummary);
    }
  } else {

    // new password and password confirmation do not match
    server.error(request, response, -32000, 'Password reset token has expired.');
  }
};

module.exports.confirmEmail = function(server, request, response, params) {

  var isValid = true;

  // filter the params
  params = filters.filter(server.settings, server.settings.authentication.collection, 'confirmEmail', 'default', params, 'in');

  // validate
  validators.validate(server, request, server.settings.authentication.collection, 'confirmEmail', 'default', params, function(validationSummary) {
    if (validationSummary !== true) {
      isValid = false;
    }

    if (isValid) {

      var algorithm = server.settings.authentication.confirmEmailToken.algorithm;
      var password = server.settings.authentication.confirmEmailToken.password;
      var decipher = crypto.createDecipher(algorithm, password);
      var token = decipher.update(params.token, 'hex', 'utf8');
      token += decipher.final('utf8');
      token = JSON.parse(token);

      if (new Date() < new Date(token.expiration)) {

        // create params
        var params = {};
        params[(!server.settings.authentication.confirmEmailField ? 'isConfirmed' : server.settings.authentication.confirmEmailField)] = true;

        // update the user
        server.db[server.settings.authentication.collection].update({
          '_id': server.db.ObjectId(token._id)
        }, {
          '$set': params
        }, function(error, result) {
          if (error) {

            // collection not provided, create procedure not found response
            server.error(request, response, -32603, 'Internal JSON-RPC error.');

          } else {

            // log email confirmation
            console.log('Session ' + request.sessionID + ' has confirmed their email');

            // return success
            server.result(request, response, 'Email successfully confirmed.');
          }
        }.bind(this));
      } else {

        // new password and password confirmation do not match
        server.error(request, response, -32000, 'Email confirmation token has expired.');
      }

    } else {

      // validation not passed, return with error and validation summary
      server.error(request, response, -32603, 'Internal JSON-RPC error.', validationSummary);
      return;
    }
  }.bind(this));
};



module.exports.resetPasswordEnabled = function(server) {

  var enabled = false
  if (server.settings.mail) {
    if (server.settings.mail.messages && server.settings.authentication.passwordResetToken) {
      if (server.settings.mail.messages.passwordResetRequest) {
        if (server.settings.mail.messages.passwordResetRequest.enabled) {
          enabled = true;
        }
      }
    }
  }
  return enabled;
};

module.exports.sendResetPassword = function(server, request, response, user, callback) {

  if (this.confirmEmailEnabled(server)) {
    // create and encrypt the token
    var expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + server.settings.authentication.passwordResetToken.timeout);

    var algorithm = server.settings.authentication.passwordResetToken.algorithm;
    var password = server.settings.authentication.passwordResetToken.password;
    var cipher = crypto.createCipher(algorithm, password);

    var token = {};
    token._id = user._id;
    token.expiration = expiration;
    token = cipher.update(JSON.stringify(token), 'utf8', 'hex');
    token += cipher.final('hex');

    // format the email message - textevents.js
    var mailMessage = JSON.parse(JSON.stringify(server.settings.mail.messages.passwordResetRequest));
    mailMessage.text = mailMessage.text.replace(/{firstName}/g, (user.firstName || ''));
    mailMessage.text = mailMessage.text.replace(/{lastName}/g, (user.lastName || ''));
    mailMessage.text = mailMessage.text.replace(/{token}/g, encodeURIComponent(token));
    mailMessage.to = (user.firstName || '') + ' ' + (user.lastName || '') + ' <' + user.email + '>';

    // format the email message - html
    if (mailMessage.attachment) {
      for (var a = 0; a < mailMessage.attachment.length; a++) {
        if (mailMessage.attachment[a].alternative === true) {
          mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{firstName}/g, (user.firstName || ''));
          mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{lastName}/g, (user.lastName || ''));
          mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, encodeURIComponent(token));
          mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, '');
        }
      }
    }

    // send the email
    server.mail.send(mailMessage, callback);
  } else {

    // reset not enabled
    callback('Password reset is not enabled.');
  }
};

module.exports.confirmEmailEnabled = function(server) {

  var enabled = false;
  if (server.settings.mail) {
    if (server.settings.mail.messages && server.settings.authentication.confirmEmailToken) {
      if (server.settings.mail.messages.confirmEmail) {
        if (server.settings.mail.messages.confirmEmail.enabled) {
          enabled = true;
        }
      }
    }
  }
  return enabled;
};

module.exports.sendConfirmEmail = function(server, request, response, user, callback) {
  if (this.confirmEmailEnabled(server)) {
    if (user.isConfirmed !== true) {

      // create and encrypt the token
      var expiration = new Date();
      expiration.setMinutes(expiration.getMinutes() + server.settings.authentication.confirmEmailTimeout);

      var algorithm = server.settings.authentication.confirmEmailToken.algorithm;
      var password = server.settings.authentication.confirmEmailToken.password;
      var cipher = crypto.createCipher(algorithm, password);

      var token = {};
      token._id = user._id;
      token.expiration = expiration;
      token = cipher.update(JSON.stringify(token), 'utf8', 'hex');
      token += cipher.final('hex');

      // format the email message - textevents.js
      var mailMessage = JSON.parse(JSON.stringify(server.settings.mail.messages.confirmEmail));
      mailMessage.text = mailMessage.text.replace(/{firstName}/g, (user.firstName || ''));
      mailMessage.text = mailMessage.text.replace(/{lastName}/g, (user.lastName || ''));
      mailMessage.text = mailMessage.text.replace(/{token}/g, encodeURIComponent(token));
      mailMessage.to = (user.firstName || '') + ' ' + (user.lastName || '') + ' <' + user.email + '>';

      // format the email message - html
      if (mailMessage.attachment) {
        for (var a = 0; a < mailMessage.attachment.length; a++) {
          if (mailMessage.attachment[a].alternative === true) {
            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{firstName}/g, (user.firstName || ''));
            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{lastName}/g, (user.lastName || ''));
            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, encodeURIComponent(token));
            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, '');
          }
        }
      }

      // send the email
      server.mail.send(mailMessage, callback);
    } else {

      // email already confirmed
      callback('Email already confirmed.');
    }
  } else {

    // reset not enabled
    callback('Email confirmation is not enabled.');
  }
};