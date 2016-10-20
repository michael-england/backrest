'use strict';

const clone = require('clone');
const url = require('url');
const db = require('./db');
const Property = require('./property');
const Token = require('./token');

module.exports = class Email {
	static getEmail(name) {
		return new Promise ((resolve, reject) => {
			db.collection('emails').findOne({
				'name': name
			}, (error, email) => {
				if (error) {
					return reject(error);
				}
				
				resolve(email);
			});
		});
	}

	static sendResetPassword (server, user) {
		return new Promise((resolve, reject) => {
			this.getEmail('passwordResetRequest').then((email) => {
				if (!email.enabled) {
					resolve();
				}

				var promises = [];
				promises.push(Property.getValue('backrest.authentication.resetPasswordToken.timeout'));
				promises.push(Property.getValue('backrest.authentication.resetPasswordToken.algorithm'));
				promises.push(Property.getValue('backrest.authentication.resetPasswordToken.password'));
				Promise.all(promises).then((properties) => {

					// create and encrypt the token;
					var [timeout, algorithm, password] = properties;
					var token = Token.generate(timeout, algorithm, password, user._id);

					// format the email message
					email.to = (user.firstName || '') + ' ' + (user.lastName || '') + ' <' + user.email + '>';
					email.text = email.text.replace(/\{firstName}/g, (user.firstName || ''))
						.replace(/\{lastName}/g, (user.lastName || ''))
						.replace(/\{token}/g, encodeURIComponent(token));

					// format the email message - html
					if (email.attachment) {
						email.attachment.forEach((attachment) => {
							if (!attachment.alternative) {
								return;
							}

							attachment.data = attachment.data.replace(/\{firstName}/g, (user.firstName || ''))
								.replace(/\{lastName}/g, (user.lastName || ''))
								.replace(/\{token}/g, encodeURIComponent(token))
								.replace(/\{token}/g, '');
						});
					}

					// send the email
					server.mail.send(email, () => {
						resolve();
					});
				});
			});
		});
	}

	static sendConfirmEmail (server, user) {
		return new Promise((resolve, reject) => {			
			if (user.isConfirmed) {
				return resolve('Email already confirmed.');
			}

			this.getEmail('confirmEmail').then((email) => {
				if (!email.enabled) {
					resolve();
				}

				var promises = [];
				promises.push(Property.getValue('backrest.authentication.confirmEmailToken.timeout'));
				promises.push(Property.getValue('backrest.authentication.confirmEmailToken.algorithm'));
				promises.push(Property.getValue('backrest.authentication.confirmEmailToken.password'));
				Promise.all(promises).then((properties) => {

					// create and encrypt the token;
					var [timeout, algorithm, password] = properties;
					var token = Token.generate(timeout, algorithm, password, user._id);

					// format the email message
			 		email.to = (user.firstName || '') + ' ' + (user.lastName || '') + ' <' + user.email + '>';	
					email.text = email.text.replace(/\{firstName}/g, (user.firstName || ''))
						.replace(/\{lastName}/g, (user.lastName || ''))
						.replace(/\{token}/g, encodeURIComponent(token));

					// format the email message - html
					if (email.attachment) {
						for (var a = 0; a < email.attachment.length; a++) {
							email.attachment.forEach((attachment) => {
								if (!attachment.alternative) {
									return;
								}	

								attachment.data = attachment.data.replace(/\{firstName}/g, (user.firstName || ''))
									.replace(/\{lastName}/g, (user.lastName || ''))
									.replace(/\{token}/g, encodeURIComponent(token))
									.replace(/\{token}/g, '');
							});
						}
					}

					// send the email
					server.mail.send(email, () => {
						resolve();
					});
				});	
			});	
		});
	}

	static sendErrorEmail(server, request, error) {
		return new Promise((resolve, reject) => {				
			this.getEmail('errorEmail').then((email) => {
				if (!email.enabled) {
					resolve();
				}

				// execute api call
				var query = url.parse(request.url, true).query;

				// parse data to JSON
				var data = JSON.parse(query.data);

				// format the email message
				email.text = email.text.replace(/\{timestamp}/g, new Date().toString())
					.replace(/\{error}/g, error.stack)
					.replace(/\{url}/g, request.url)
					.replace(/\{method}/g, request.method)
					.replace(/\{headers}/g, JSON.stringify(request.headers, null, 4))
					.replace(/\{session}/g, JSON.stringify(request.session, null, 4))
					.replace(/\{data}/g, data);

				// format the email message - html
				if (email.attachment) {
					email.attachment.forEach((attachment) => {
						if (!attachment[a].alternative) {
							return;
						}

						attachment.data = attachment.data.replace(/\{timestamp}/g, new Date().toString())
							.replace(/\{error}/g, error.stack)
							.replace(/\{url}/g, request.url)
							.replace(/\{method}/g, request.method)
							.replace(/\{headers}/g, JSON.stringify(request.headers, null, 4))
							.replace(/\{session}/g, JSON.stringify(request.session, null, 4))
							.replace(/\{data}/g, data);
					});
				}

				// send the email
				server.mail.send(email, () => {
					resolve();
				});
			});
		});
	}
};