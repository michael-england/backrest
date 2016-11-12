'use strict';

const bcrypt = require('bcrypt');
const clone = require('clone');
const BaseController = require('./base-controller');
const db = require('../lib/db');
const Data = require('../lib/data');
const Email = require('../lib/email');
const Property = require('../lib/property');
const Token = require('../lib/token');
const moment = require('moment');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const constants = require('../lib/constants');

module.exports = class UserController extends BaseController {
	constructor (server) {
		super(server);
		this.users = db.collection(constants.COLLECTION.USERS);
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
					return done(null, false, {message: 'Invalid Credentials'});
				}

				bcrypt.compare(password, user.password, (error, result) => {
					if (!result) {
						return done(null, false, {message: 'Invalid Credentials'});
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
			this.users.findOne({'_id': db.ObjectId(_id)}, done);
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
		Property.getValue('backrest.authentication.confirmEmailToken.timeout', 1440).then((timeout) => {
			if (request.user._created && !request.user.isConfirmed) {
				var timeoutDate = moment(request.user._created).add('minutes', timeout);
				var currentDate = moment();
				emailConfirmed = timeoutDate >= currentDate;
			}

			if (!emailConfirmed) {
				// cancel the login
				request.logout();

				// collection not provided, create procedure not found response
				return this.server.error(request, response, constants.ERROR.FORBIDDEN, 403);
			}

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
				Data.collection('users', request.user)
					.findOne({
						'_id': request.user._id
					})
					.then(this.respondWithDataFn(request, response))
					.catch(this.respondWithErrorFn(request, response));
			});
		});
	}

	logout (request, response) {
		request.logout();
		this.server.result(request, response, true);
	}

	create (request, response) {
		var data = clone(request.body);

		bcrypt.hash(data.password, 10, (error, hash) => {
			data.password = hash;

			// create the new user
			Data.collection('users', request.user)
				.create(data)
				.then((data) => {
					Email.sendConfirmEmail(data).then((error) => {
						if (error) {
							throw error;
						}

						this.server.result(request, response, data, 201, {
							'Content-Type': 'application/json',
							'Location': '/api/users/' + data._id
						});
					});
				})
				.catch(this.respondWithErrorFn(request, response));
		});
	}

	resetPassword (request, response) {
		var promises = [];
		promises.push(Property.getValue('backrest.authentication.resetPasswordToken.algorithm'));
		promises.push(Property.getValue('backrest.authentication.resetPasswordToken.password'));

		Promise.all(promises).then((properties) => {
			var [algorithm, password] = properties;
			var token = Token.parse(algorithm, password, request.body.token);
			if (!Token.validate(token)) {
				return this.server.error(request, response, 'Bad Request', 400);
			}

			bcrypt.hash(request.body.password, 10, (error, hash) => {
				this.users.findAndModify({
					'query': {'_id': db.ObjectId(token.data)},
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

			Email.sendResetPassword(data).then((error) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				// return result
				this.server.result(request, response, true);
			});
		});
	}

	confirmEmail (request, response) {
		var promises = [];
		promises.push(Property.getValue('backrest.authentication.confirmEmailToken.algorithm'));
		promises.push(Property.getValue('backrest.authentication.confirmEmailToken.password'));
		Promise.all(promises).then((values) => {
			var [algorithm, password] = values;
			var token = Token.parse(algorithm, password, request.body.token);
			if (!Token.validate(token)) {
				return this.server.error(request, response, 'Bad Request', 400);
			}

			// update confirmation and save changes
			this.users.update({
				'_id': db.ObjectId(token.data)
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

			Email.sendConfirmEmail(data).then((error) => {
				if (error) {
					return this.server.error(request, response, error, 500);
				}

				// return result
				this.server.result(request, response, true);
			});
		});
	}

	current (request, response) {
		if (!request.user) {
			return this.server.result(request, response);
		}

		Data.collection('users', request.user)
			.findOne({
				'_id': request.user._id
			})
			.then(this.respondWithDataFn(request, response))
			.catch(this.respondWithErrorFn(request, response));
	}

	currentIsInRole (request, response) {
		if (!request.user) {
			return this.server.result(request, response, false);
		}

		var roles = request.user.roles || [];
		this.server.result(request, response, roles.some((role) => {
			return role === request.body.role;
		}));
	}

	changePassword (request, response) {
		bcrypt.compare(request.body.oldPassword, request.user.password, (error, result) => {
			if (!result) {
				return this.server.error(request, response, 'Invalid Request', 400);
			}

			bcrypt.hash(request.body.newPassword, 10, (error, hash) => {
				this.users.update({
					'_id': db.ObjectId(request.user._id)
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