'use strict';

var crypto = require('crypto');
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
    'usernameField': 'email'
  });

  // timestamp plugin
  UserSchema.plugin(mongooseTimes, {
    'created': '_created',
    'lastUpdated': '_modified'
  });

  // filter properties plugin
  UserSchema.plugin(mongooseFilter, collection.filter);

  // create model from schema
  module.exports.UserModel = mongoose.model('user', UserSchema);

  // setup passport
  passport.use(module.exports.UserModel.createStrategy());

  // serialize the user
  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  // deserialize the user by find the user by id
  passport.deserializeUser(function(id, done) {
    module.exports.UserModel.findById(id, function(err, user) {
      done(err, user);
    });
  });

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
    module.exports.changePassword(server, request, response);
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

  // create the new user
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

  var algorithm = server.settings.authentication.resetPasswordToken.algorithm;
  var password = server.settings.authentication.resetPasswordToken.password;
  var decipher = crypto.createDecipher(algorithm, password);
  var token = decipher.update(request.body.token, 'hex', 'utf8');
  token += decipher.final('utf8');
  token = JSON.parse(token);

  if (new Date() >= new Date(token.expiration)) {

    // token has expired
    server.error(request, response, -32000, 'Reset password token has expired.');
    return;
  }

  // get the data
  module.exports.UserModel.findById(token._id, undefined, function(error, user) {
    if (error) {

      // respond with an error
      server.error(request, response, error);
      return;
    }

    if (!user) {

      // return result
      server.error(request, response, 'User not found.');
      return
    }

    user.setPassword(request.body.password, function(error, user) {
      if (error) {

        // respond with an error
        server.error(request, response, error);
        return
      }

      if (!user) {

        // respond with an error
        server.error(request, response, 'Failed to set password.');
        return
      }

      user.save(function(error) {
        if (error) {

          // respond with an error
          server.error(request, response, error);
          return
        }

        // log email confirmation
        console.log('Session ' + request.sessionID + ' has updated their password');

        // return success
        server.result(request, response, true);
      });
    });
  });
};

module.exports.resetPasswordRequest = function(server, request, response) {

  var condition = {
    'email': request.body.email
  };

  // get the data
  module.exports.UserModel.findOne(condition, undefined, function(error, user) {

    // respond with an error
    if (error) {
      server.error(request, response, error);
      return;
    }

    // return failed result
    if (!user) {
      server.result(request, response, false);
      return;
    }

    module.exports.sendResetPassword(server, request, response, user, function(error) {

      // error sending mail
      if (error) {
        server.error(request, response, error);
        return;
      }

      // return result
      server.result(request, response, true);
    });
  });
};

module.exports.confirmEmail = function(server, request, response) {

  var algorithm = server.settings.authentication.confirmEmailToken.algorithm;
  var password = server.settings.authentication.confirmEmailToken.password;
  var decipher = crypto.createDecipher(algorithm, password);
  var token = decipher.update(request.body.token, 'hex', 'utf8');
  token += decipher.final('utf8');
  token = JSON.parse(token);

  // token has expired
  if (new Date() >= new Date(token.expiration)) {
    server.error(request, response, 'Email confirmation token has expired.');
    return;
  }

  // find by id and update
  var model = new module.exports.UserModel();
  module.exports.UserModel.findById(token._id, function(error, user) {

    // respond with an error
    if (error) {
      server.error(request, response, error);
      return;
    }

    // update confirmation
    user.isConfirmed = true;

    // save changes
    user.save(function(error) {

      // respond with an error
      if (error) {
        server.error(request, response, error);
        return;
      }

      // log email confirmation
      console.log('Session ' + request.sessionID + ' has confirmed their email');

      // return success
      server.result(request, response, true);
    });

  });
};

module.exports.confirmEmailRequest = function(server, request, response) {

  var condition = {
    'email': request.body.email
  };

  // get the data
  module.exports.UserModel.findOne(condition, undefined, function(error, user) {

    // respond with an error
    if (error) {
      server.error(request, response, error);
      return;
    }

    // return failed result
    if (!user) {
      server.result(request, response, false);
      return;
    }

    module.exports.sendConfirmEmail(server, request, response, user, function(error) {

      // error sending mail
      if (error) {
        server.error(request, response, error);
        return;
      }

      // return result
      server.result(request, response, true);
    });
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
  if (!request.user) {
    server.result(request, response, false);
    return;
  }

  // look for the role
  var isInRole = false;
  if (request.user.roles !== undefined) {
    for (var i = 0; i < request.user.roles.length; i++) {
      if (request.user.roles[i] === request.body.role) {
        isInRole = true;
        break;
      }
    }
  }

  // return result
  server.result(request, response, isInRole);
};

module.exports.changePassword = function(server, request, response) {

  request.user.authenticate(request.body.oldPassword, function(error, user) {
    if (error) {

      // respond with an error
      server.error(request, response, error);
      return
    }

    user.setPassword(request.body.newPassword, function(error, user) {

      if (error) {

        // respond with an error
        server.error(request, response, error);
        return
      }

      if (!user) {

        // respond with an error
        server.error(request, response, 'Failed to set password.');
        return
      }

      user.save(function(error, user, numberAffected) {
        if (error) {

          // respond with an error
          server.error(request, response, error);
          return
        }

        // log email confirmation
        console.log('Session ' + request.sessionID + ' has updated their password');

        // return success
        server.result(request, response, true);
      });
    });
  });
};

module.exports.resetPasswordEnabled = function(server) {

  var enabled = false
  if (server.settings.mail) {
    if (server.settings.mail.messages && server.settings.authentication.resetPasswordToken) {
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
    expiration.setMinutes(expiration.getMinutes() + server.settings.authentication.resetPasswordToken.timeout);

    var algorithm = server.settings.authentication.resetPasswordToken.algorithm;
    var password = server.settings.authentication.resetPasswordToken.password;
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
      expiration.setMinutes(expiration.getMinutes() + server.settings.authentication.confirmEmailToken.timeout);

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