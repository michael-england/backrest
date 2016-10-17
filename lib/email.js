'use strict';

const clone = require('clone');
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
};