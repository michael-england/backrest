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

module.exports = function(server) {

  server.app.use(passport.initialize());
  server.app.use(passport.session());

  var collection = server.settings.collections[1];
  var UserSchema = new Schema(collection.schema);

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
  var UserModel = mongoose.model('user', UserSchema);

  // setup passport
  passport.use(UserModel.createStrategy());
  passport.serializeUser(UserModel.serializeUser());
  passport.deserializeUser(UserModel.deserializeUser());

  // login
  server.app.post('/api/users/login', passport.authenticate('local'), function(request, response) {
    request.user.applyReadFilter('owner');
    server.result(request, response, request.user);
  });

  // logout
  server.app.get('/api/users/logout', function(request, response) {
    request.logout();
    server.result(request, response, true);
  });

  // register
  server.app.post('/api/users', function(request, response) {

    var a = new UserModel(request.body);

    console.log(request.body.password);


    // set acl
    a.setAccess(a, ['read', 'write', 'delete']);
    a.setAccess('role:admin', ['read', 'write', 'delete']);

    // create the new user
    UserModel.register(a, request.body.password, function(error, user) {
      if (error) {
        server.error(request, response, error);
      } else {
        user.applyReadFilter('owner');
        server.result(request, response, user);
      }
    });
  });

  // current
  server.app.get('/api/users/current', function(request, response) {
    if (request.user) {
      request.user.applyReadFilter('owner');
      server.result(request, response, request.user);
    } else {
      server.result(request, response, undefined);
    }
  });

  return function(request, response, next) {
    next();
  }.bind(module.exports);
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

module.exports.passwordResetRequest = function(server, request, response, params) {

  var isValid = true;

  // filter the params
  params = filters.filter(server.settings, server.settings.authentication.collection, 'passwordResetRequest', 'default', params, 'in');

  // validate
  validators.validate(server, request, server.settings.authentication.collection, 'passwordResetRequest', 'default', params, function(validationSummary) {
    if (validationSummary !== true) {
      isValid = false;
    }

    if (isValid) {

      // the login response
      var dbResult = function(error, result) {
        if (error) {

          // internal MongoDB error
          server.error(request, response, -32603, 'Internal JSON-RPC error.');

        } else {

          if (!result) {

            // return result
            server.result(request, response, false);

          } else {

            if (server.settings.mail) {
              if (server.settings.mail.messages && server.settings.authentication.passwordResetToken) {

                // create and encrypt the token
                var expiration = new Date();
                expiration.setMinutes(expiration.getMinutes() + server.settings.authentication.passwordResetToken.timeout);

                var algorithm = server.settings.authentication.passwordResetToken.algorithm;
                var password = server.settings.authentication.passwordResetToken.password;
                var cipher = crypto.createCipher(algorithm, password);

                var token = {};
                token._id = result._id;
                token.expiration = expiration;
                token = cipher.update(JSON.stringify(token), 'utf8', 'hex');
                token += cipher.final('hex');

                // format the email message - textevents.js
                var mailMessage = JSON.parse(JSON.stringify(server.settings.mail.messages.passwordResetRequest));
                mailMessage.text = mailMessage.text.replace(/{firstName}/g, (result.firstName || ''));
                mailMessage.text = mailMessage.text.replace(/{lastName}/g, (result.lastName || ''));
                mailMessage.text = mailMessage.text.replace(/{token}/g, encodeURIComponent(token));
                mailMessage.to = (result.firstName || '') + ' ' + (result.lastName || '') + ' <' + result[(!server.settings.authentication.usernameField ? 'email' : server.settings.authentication.usernameField)] + '>';

                // format the email message - html
                if (mailMessage.attachment) {
                  for (var a = 0; a < mailMessage.attachment.length; a++) {
                    if (mailMessage.attachment[a].alternative === true) {
                      mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{firstName}/g, (result.firstName || ''));
                      mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{lastName}/g, (result.lastName || ''));
                      mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, encodeURIComponent(token));
                      mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, '');
                    }
                  }
                }

                // send the email
                server.mail.send(mailMessage, function(error, message) {
                  if (error) {

                    // error sending mail
                    server.error(request, response, -32000, error.message);
                  } else {

                    // return result
                    server.result(request, response, true);
                  }
                }.bind(this));

              } else {

                // reset not enabled
                server.error(request, response, -32000, 'Reset password not enabled.');
              }
            } else {

              // reset not enabled
              server.error(request, response, -32000, 'Reset password not enabled.');
            }
          }
        }
      };

      // write command to log
      console.log(request.sessionID + ': server.db.' + server.settings.authentication.collection + '.findOne(' + JSON.stringify(params) + ', dbResult);');

      // execute command
      server.db[server.settings.authentication.collection].findOne(params, dbResult.bind(this));
    } else {

      // validation not passed, return with error and validation summary
      server.error(request, response, -32603, 'Internal JSON-RPC error.', validationSummary);
      return;
    }
  }.bind(this));
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

module.exports.confirmEmailRequest = function(server, request, response, params) {

  var isValid = true;

  // filter the params
  params = filters.filter(server.settings, server.settings.authentication.collection, 'confirmEmailRequest', 'default', params, 'in');

  // validate
  validators.validate(server, request, server.settings.authentication.collection, 'confirmEmailRequest', 'default', params, function(validationSummary) {
    if (validationSummary !== true) {
      isValid = false;
    }

    if (isValid) {

      // the login response
      var dbResult = function(error, result) {

        if (error) {

          // internal MongoDB error
          server.error(request, response, -32603, 'Internal JSON-RPC error.');

        } else {

          if (!result) {

            // return result
            server.result(request, response, false);

          } else {

            this.sendConfirmEmail(server, request, response, result, function(errorMail) {
              if (errorMail) {

                // log error
                console.log(errorMail);

                // error sending mail
                server.error(request, response, -32000, errorMail.message);
              } else {

                // return result
                server.result(request, response, true);
              }
            }.bind(this));
          }
        }
      };

      // write command to log
      console.log(request.sessionID + ': server.db.' + server.settings.authentication.collection + '.findOne(' + JSON.stringify(params) + ', dbResult);');

      // execute command
      server.db[server.settings.authentication.collection].findOne(params, dbResult.bind(this));
    } else {

      // validation not passed, return with error and validation summary
      server.error(request, response, -32603, 'Internal JSON-RPC error.', validationSummary);
      return;
    }
  }.bind(this));
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

module.exports.isInRole = function(server, request, response, params) {

  // change the authenticated user
  var isInRole = false;

  if (request.session.user && params !== undefined && params !== null) {
    if (params.name !== undefined) {
      var roles = request.session.user[server.settings.authentication.rolesField !== undefined ? server.settings.authentication.rolesField : 'roles'];
      if (roles !== undefined) {
        for (var i = 0; i < roles.length; i++) {
          if (roles[i] == params.name) {
            isInRole = true;
            break;
          }
        }
      }
    }
  }

  // return result
  server.result(request, response, isInRole);
  return;
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
  return true;
};

module.exports.sendConfirmEmail = function(server, request, response, user, callback) {
  if (this.confirmEmailEnabled(server)) {
    if (user[(!server.settings.authentication.confirmEmailField ? 'isConfirmed' : server.settings.authentication.confirmEmailField)] !== true) {

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
      mailMessage.to = (user.firstName || '') + ' ' + (user.lastName || '') + ' <' + user[(!server.settings.authentication.usernameField ? 'email' : server.settings.authentication.usernameField)] + '>';

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
    callback('Email confirmation not enabled.');
  }
};