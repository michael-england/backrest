'use strict';

const bcrypt = require('bcrypt');
const clone = require('clone');
const Email = require('../lib/email');
const Token = require('../lib/token');
const moment = require('moment');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

module.exports = class UserController {
	constructor (server) {
		this.server = server;
		this.users = this.server.db.collection('users');
		this.server.app.use(passport.initialize());
		this.server.app.use(passport.session());

		passport.use(new LocalStrategy({
			usernameField: 'email',
			passwordField: 'password'
		}, (email, password, done) => {
			this.users.findOne({email: email}, (error, user) => {
				if (error) {
					return done(error);
				}

				if (!user) {
					return done(null, false, {message: 'Incorrect email.'});
				}

				bcrypt.compare(password, user.password, (error, result) => {
					if (!result) {
						return done(null, false, {message: 'Incorrect password.'});
					}

					return done(null, user);
				});
			});
		}));

		// serialize the user
		passport.serializeUser((user, done) => {
			done(null, user._id);
		});

		// deserialize the user by find the user by id
		passport.deserializeUser((_id, done) => {
			this.users.findOne({'_id': this.server.db.ObjectId(_id)}, done);
		});

		this.server.app.post('/api/users/login', passport.authenticate('local'), this.login.bind(this));
		this.server.app.get('/api/users/logout', this.logout.bind(this));
		this.server.app.post('/api/users', this.create.bind(this));
		this.server.app.post('/api/users/reset-password', this.resetPassword.bind(this));
		this.server.app.post('/api/users/reset-password-request', this.resetPasswordRequest.bind(this));
		this.server.app.post('/api/users/confirm-email', this.confirmEmail.bind(this));
		this.server.app.post('/api/users/confirm-email-request', this.confirmEmailRequest.bind(this));
		this.server.app.get('/api/users/current', this.current.bind(this));
		this.server.app.post('/api/users/current/is-in-role', this.currentIsInRole.bind(this));
		this.server.app.post('/api/users/current/change-password', this.changePassword.bind(this));
	}

	login (request, response) {
		var emailConfirmed = true;
		if (Email.confirmEmailEnabled(this.server) && request.user._created) {
			if (!request.user.isConfirmed) {
				var timeout = this.server.settings.authentication.confirmEmailToken.timeout ? this.server.settings.authentication.confirmEmailToken.timeout : 1440;
				var timeoutDate = moment(request.user._created).add('minutes', timeout);
				var currentDate = moment();
				emailConfirmed = timeoutDate >= currentDate;
			}
		}

		if (emailConfirmed) {

			// log authentication change
			console.log('Session ' + request.sessionID + ' is now logged in as ' + request.user.email);

			// set last login
			this.users.update({
				'_id': request.user._id
			}, {
				'$set': {
					'_lastLogin': new Date(),
					'_modified': new Date(),
					'_modifiedBy': request.user._id
				}
			}, (error) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				// return result
				this.server.result(request, response, request.user);
			});
		} else {

			// cancel the login
			request.logout();

			// collection not provided, create procedure not found response
			this.server.error(request, response, 'Forbidden', 403);
		}
	}

	logout (request, response) {
		request.logout();
		this.server.result(request, response, true);
	}

	create (request, response) {
		var document = clone(request.body);
		document._created = new Date();
		document._modified = new Date();

		bcrypt.hash(document.password, 10, (error, hash) => {
			document.password = hash;

			// create the new user
			this.users.save(document, (error, data) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				Email.sendConfirmEmail(this.server, data, (error) => {
					if (error) {
						return this.server.error(request, response, error, 500);
					}

					this.server.result(request, response, data, 201, {
						'Content-Type': 'application/json',
						'Location': '/api/users/' + data._id
					});
				});
			});
		});
	}

	resetPassword (request, response) {
		var algorithm = this.server.settings.authentication.resetPasswordToken.algorithm;
		var password = this.server.settings.authentication.resetPasswordToken.password;
		var token = Token.parse(algorithm, password, request.body.token);
		if (Token.validate(token)) {
			return this.server.error(request, response, 'Bad Request', 400);
		}

		bcrypt.hash(request.body.password, 10, (error, hash) => {
			this.users.findAndModify({
				'query': {'_id': this.server.db.ObjectId(token._id)},
				'update': {
					'$set': {
						'password': hash,
						'_modified': new Date()
					}
				}
			}, (error) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				// log email confirmation
				console.log('Session ' + request.sessionID + ' has updated their password');

				// return success
				this.server.result(request, response, true);
			});
		});
	}

	resetPasswordRequest (request, response) {
		// get the data
		this.users.findOne({
			'email': request.body.email
		}, (error, data) => {

			// respond with an error
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			// respond with a 404
			if (!data) {
				return this.server.error(request, response, 'Not Found', 404);
			}

			Email.sendResetPassword(this.server, data, (error) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				// return result
				this.server.result(request, response, true);
			});
		});
	}

	confirmEmail (request, response) {
		var algorithm = this.server.settings.authentication.confirmEmailToken.algorithm;
		var password = this.server.settings.authentication.confirmEmailToken.password;
		var token = Token.parse(algorithm, password, request.body.token);
		if (Token.validate(token)) {
			return this.server.error(request, response, 'Bad Request', 400);
		}

		// update confirmation and save changes
		this.users.update({
			'_id': this.server.db.ObjectId(token._id)
		}, {
			'$set': {
				'isConfirmed': true,
				'_modified': new Date()
			}
		}, (error) => {
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			// log email confirmation
			console.log('Session ' + request.sessionID + ' has confirmed their email');

			// return success
			this.server.result(request, response, true);
		});
	}

	confirmEmailRequest (request, response) {
		// get the data
		this.users.findOne({
			'email': request.body.email
		}, (error, data) => {
			if (error) {
				return this.server.error(request, response, error, 500);
			}

			// respond with a 404
			if (!data) {
				return this.server.error(request, response, 'Not Found', 404);
			}

			Email.sendConfirmEmail(this.server, data, (error) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				// return result
				this.server.result(request, response, true);
			});
		});
	}

	current (request, response) {
		if (request.user) {
			this.server.result(request, response, request.user);
		} else {
			this.server.result(request, response);
		}
	}

	currentIsInRole (request, response) {
		if (!request.user) {
			return this.server.result(request, response, false);
		}

		// look for the role
		var isInRole = false;
		if (request.user.roles) {
			isInRole = request.user.roles.some((role) => {
				return role === request.body.role;
			});
		}

		// return result
		this.server.result(request, response, isInRole);
	}

	changePassword (request, response) {
		bcrypt.compare(request.body.oldPassword, request.user.password, (error, result) => {
			if (!result) {
				return this.server.error(request, response, 'Invalid Request', 400);
			}

			bcrypt.hash(request.body.newPassword, 10, (error, hash) => {
				this.users.update({
					'_id': this.server.db.ObjectId(request.user._id)
				}, {
					'$set': {
						'password': hash,
						'_modified': new Date()
					}
				}, (error) => {
					if (error) {
						return this.server.error(request, response, error, 500);
					}

					// log email confirmation
					console.log('Session ' + request.sessionID + ' has updated their password');

					// return success
					this.server.result(request, response, true);
				});
			});
		});
	}
};