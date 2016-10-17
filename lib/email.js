'use strict';

const clone = require('clone');
const url = require('url');
const generateToken = require('./generate-token');

module.exports = class Email {
	static resetPasswordEnabled (server) {
		return server.app.get('env') !== 'development' &&
			server.settings.mail &&
			server.settings.mail.messages &&
			server.settings.authentication.resetPasswordToken &&
			server.settings.mail.messages.passwordResetRequest &&
			server.settings.mail.messages.passwordResetRequest.enabled;
	}

	static sendResetPassword (server, user, callback) {
		if (!this.resetPasswordEnabled(server)) {
			return callback();
		}

		// create and encrypt the token
		var timeout = server.settings.authentication.resetPasswordToken.timeout;
		var algorithm = server.settings.authentication.resetPasswordToken.algorithm;
		var password = server.settings.authentication.resetPasswordToken.password;
		var token = generateToken(timeout, algorithm, password, user._id);

		// format the email message
		var mailMessage = clone(server.settings.mail.messages.passwordResetRequest);
		mailMessage.text = mailMessage.text.replace(/\{firstName}/g, (user.firstName || ''));
		mailMessage.text = mailMessage.text.replace(/\{lastName}/g, (user.lastName || ''));
		mailMessage.text = mailMessage.text.replace(/\{token}/g, encodeURIComponent(token));
		mailMessage.to = (user.firstName || '') + ' ' + (user.lastName || '') + ' <' + user.email + '>';

		// format the email message - html
		if (mailMessage.attachment) {
			for (var a = 0; a < mailMessage.attachment.length; a++) {
				if (mailMessage.attachment[a].alternative === true) {
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{firstName}/g, (user.firstName || ''));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{lastName}/g, (user.lastName || ''));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{token}/g, encodeURIComponent(token));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{token}/g, '');
				}
			}
		}

		// send the email
		server.mail.send(mailMessage, callback);
	}

	static confirmEmailEnabled (server) {
		return server.app.get('env') !== 'development' &&
			server.settings.mail &&
			server.settings.mail.messages &&
			server.settings.authentication.confirmEmailToken &&
			server.settings.mail.messages.confirmEmail &&
			server.settings.mail.messages.confirmEmail.enabled;
	}

	static sendConfirmEmail (server, user, callback) {
		if (!this.confirmEmailEnabled(server)) {
			return callback();
		}

		if (user.isConfirmed) {
			return callback('Email already confirmed.');
		}

		// create and encrypt the token;
		var timeout = server.settings.authentication.confirmEmailToken.timeout;
		var algorithm = server.settings.authentication.confirmEmailToken.algorithm;
		var password = server.settings.authentication.confirmEmailToken.password;
		var token = generateToken(timeout, algorithm, password, user._id);

		// format the email message
		var mailMessage = clone(server.settings.mail.messages.confirmEmail);
		mailMessage.text = mailMessage.text.replace(/\{firstName}/g, (user.firstName || ''));
		mailMessage.text = mailMessage.text.replace(/\{lastName}/g, (user.lastName || ''));
		mailMessage.text = mailMessage.text.replace(/\{token}/g, encodeURIComponent(token));
		mailMessage.to = (user.firstName || '') + ' ' + (user.lastName || '') + ' <' + user.email + '>';

		// format the email message - html
		if (mailMessage.attachment) {
			for (var a = 0; a < mailMessage.attachment.length; a++) {
				if (mailMessage.attachment[a].alternative === true) {
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{firstName}/g, (user.firstName || ''));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{lastName}/g, (user.lastName || ''));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{token}/g, encodeURIComponent(token));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{token}/g, '');
				}
			}
		}

		// send the email
		server.mail.send(mailMessage, callback);
	}

	static errorEmailEnabled (server) {
		return server.app.get('env') !== 'development' &&
			server.settings.mail &&
			server.settings.mail.messages &&
			server.settings.mail.messages.errorEmail &&
			server.settings.mail.messages.errorEmail.enabled;
	}

	static sendErrorEmail(server, request, error, callback) {
		if (!this.errorEmailEnabled(server)) {
			return callback();
		}

		// execute api call
		var query = url.parse(request.url, true).query;

		// parse data to JSON
		var data = JSON.parse(query.data);

		// format the email message
		var mailMessage = clone(server.settings.mail.messages.errorEmail);
		mailMessage.text = mailMessage.text.replace(/\{timestamp}/g, new Date().toString());
		mailMessage.text = mailMessage.text.replace(/\{error}/g, error.stack);
		mailMessage.text = mailMessage.text.replace(/\{url}/g, request.url);
		mailMessage.text = mailMessage.text.replace(/\{method}/g, request.method);
		mailMessage.text = mailMessage.text.replace(/\{headers}/g, JSON.stringify(request.headers, null, 4));
		mailMessage.text = mailMessage.text.replace(/\{session}/g, JSON.stringify(request.session, null, 4));
		mailMessage.text = mailMessage.text.replace(/\{data}/g, data);

		// format the email message - html
		if (mailMessage.attachment) {
			for (var a = 0; a < mailMessage.attachment.length; a++) {
				if (mailMessage.attachment[a].alternative === true) {
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{timestamp}/g, new Date().toString());
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{error}/g, error.stack);
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{url}/g, request.url);
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{method}/g, request.method);
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{headers}/g, JSON.stringify(request.headers, null, 4));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{session}/g, JSON.stringify(request.session, null, 4));
					mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/\{data}/g, data);
				}
			}
		}

		// send the email
		server.mail.send(mailMessage, callback);
	}
};