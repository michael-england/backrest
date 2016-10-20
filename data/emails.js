module.exports = [{
	"name": "passwordResetRequest",
	"enabled": true,
	"text": "{firstName},\n\nExample received a request to reset the password for your account.\n\nIf you would like to reset your password, click on the link below (or copy and paste the URL into your browser):\n\nhttp://example.com/#/user/passwordReset/{token}\n\nThe link above will take you to a secure page where you can change your password. If you do not want to reset your password, please ignore this message. Your password will not be reset. If you have any concerns, please contact us at http://help..com/\n\nRegards,\nExample.com\n\nPlease do not reply to this message; it was sent from an unmonitored email address. This message is a service email related to your use of Example. For general inquiries or to request support with your account, please visit us at http://help..com/",
	"from": "Example <no-reply@example.com>",
	"subject": "Reset your Example password",
	"attachment": [{
		"data": "<!DOCTYPE html>\n<html>\n<body>\n\t<div style=\"font: 10pt Arial;\">\n\t<h2>{firstName},</h2>\n\t    <p>Example received a request to reset the password for your account.</p>\n\t    <p>If you would like to reset your password, click on the link below (or copy and paste the URL into your browser):</p>\n        <p><a style=\"color:#F78D1D;\" href=\"http://example.com/#/user/passwordReset/{token}\">http://example.com/#/user/passwordReset/{token}</a></p>\n\t    <p>The link above will take you to a secure page where you can change your password. If you do not want to reset your password, please ignore this message. Your password will not be reset. If you have any concerns, please contact us at <a style=\"color:#F78D1D;\" href=\"http://help..com/\">Example Support</a>.</p>\n\t    <p><i>Regards,<br />Example.com</i></p>\n\t    <p style=\"font-size: 8pt;color:#acacac;border-top: solid 1px #acacac;margin:10px 0 0 0;padding: 10px 0 0 0;\">Please do not reply to this message; it was sent from an unmonitored email address. This message is a service email related to your use of Example. For general inquiries or to request support with your account, please visit us at <a style=\"color:#F78D1D;\" href=\"http://help..com/\">Example Support.</a>.</p>\n    </div>\n</body>\n</html>",
		"alternative": true
	}]
}, {
	"name": "confirmEmail",
	"enabled": true,
	"text": "{firstName},\nPlease confirm your email address by clicking on the link below:\n\nhttp://example.com/#/user/confirmEmail/{token}\n\nIf you do not confirm your email address within the first 24 hours after registering you will not be allowed to log into your account\n\nRegards,\nExample.com\n\nPlease do not reply to this message; it was sent from an unmonitored email address. This message is a service email related to your use of Example. For general inquiries or to request support with your account, please visit us at http://help..com/",
	"from": "Example <no-reply@example.com>",
	"subject": "Confirm Your Example Account",
	"attachment": [{
		"data": "<!DOCTYPE html>\n<html>\n<body>\n<div style=\"font: 10pt Arial;\">\n    <h2>{firstName},</h2>\n    <p>Please confirm your email address by clicking on the link below:</p>\n    <p><a style=\"color:#F78D1D;\" href=\"http://example.com/#/user/confirmEmail/{token}\">http://example.com/#/user/confirmEmail/{token}</a></p>\n    <p>If you do not confirm your email address within the first 24 hours after registering you will not be allowed to log into your account.</p>\n    <p><i>Regards,<br />Example.com</i></p>\n    <p style=\"font-size: 8pt;color:#acacac;border-top: solid 1px #acacac;margin:10px 0 0 0;padding: 10px 0 0 0;\">Please do not reply to this message; it was sent from an unmonitored email address. This message is a service email related to your use of Example. For general inquiries or to request support with your account, please visit us at <a style=\"color:#F78D1D;\" href=\"http://help..com/\">Example Support.</a>.</p>\n</div>\n</body>\n</html>",
		"alternative": true
	}]
}, {
	"name": "errorEmail",
	"enabled": true,
	"text": "An error occured on Example\n---------------------------------\n\nTimestamp: {timestamp}\n\nError: {error}\n\nURL: {url}\n\nMethod: {method}\n\nHeaders: {headers}\n\nData: {data}\n\nSession: {session}",
	"to": "Errors <errors@example.com>",
	"from": "Error <no-reply@example.com>",
	"subject": "An error occured on Error",
	"attachment": [{
		"data": "<!DOCTYPE html>\n<html>\n<body>\n\t<div style=\"font: 10pt Arial;\">\n\t    <h2>An error occured on Example</h2>\n\t    <p><b>Timestamp:</b> <span style=\"font-family:Courier\">{timestamp}</span></p>\n        <p><b>Error:</b><pre style=\"font-family:Courier\">{error}</pre></p>\n\t    <p><b>URL:</b> <span style=\"font-family:Courier\">{url}</span></p>\n\t    <p><b>Method:</b> <span style=\"font-family:Courier\">{method}</span></p>\n\t    <p><b>Headers:</b> <pre style=\"font-family:Courier\">{headers}</pre></p>\n\t    <p><b>Data:</b> <pre style=\"font-family:Courier\">{data}</pre></p>\n\t    <p><b>Session:</b> <pre style=\"font-family:Courier\">{session}</pre></p>\n    </div>\n</body>\n</html>",
		"alternative": true
	}]
}];