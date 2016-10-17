#!/usr/bin/env node

'use strict';

const clone = require('clone');
const http = require('http');
const https = require('https');
const fs = require('fs');
const email = require('./node_modules/emailjs/email');
const express = require('express');
const expressSession = require('express-session');
const mongojs = require('mongojs');
const MongoStore = require('connect-mongo')(expressSession);
const CollectionController = require('./controllers/collection-controller');
const UserController = require('./controllers/user-controller');
const Setup = require('./lib/setup');
const Email = require('./lib/email');
const ErrorHandler = require('./lib/error-handler');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const livereload = require('express-livereload');
const logger = require('morgan');

class Backrest {
	constructor () {
		this.app = express();
		this.settings = require('./settings.' + (this.app.get('env') === 'development' ? 'development' : 'production')  +  '.json');

		// init the database
		this.db = mongojs(this.settings.databaseUrl);

		// perform initial setup
		if (!fs.existsSync('./INSTALLED')) {
			Setup.init(this).then(() => {
				// start the servers
				this.smtpStart();
				this.httpStart();
			});
		} else {
			// start the servers
			this.smtpStart();
			this.httpStart();
		}
	}

	loadMail (key) {
		// text version
		var message = this.settings.mail.messages[key];
		if (fs.existsSync(message.text)) {
			message.text = fs.readFileSync(message.text, {
				'encoding': 'binary'
			});
		}

		// html version
		var attachment = message.attachment;
		if (attachment && attachment[0] && attachment[0].alternative === true) {
			if (fs.existsSync(attachment[0].data)) {
				attachment[0].data = fs.readFileSync(attachment[0].data, {
					'encoding': 'binary'
				});
			}
		}
	}

	smtpStart () {
		// create mail server
		if (this.settings.mail) {
			this.mail = email.server.connect(this.settings.mail.server);
			this.loadMail('confirmEmail');
			this.loadMail('passwordResetRequest');
			this.loadMail('errorEmail');
		}
	}

	sessionStart () {
		// define the session
		var session = {};
		if (this.settings.session) {
			session = clone(this.settings.session);
			if (session.store) {
				if (!session.store.url) {
					session.store.url = this.settings.databaseUrl;
				}

				session.store = new MongoStore(session.store);
			}
		}
		return session;
	}

	httpStart () {
		// Event listener for HTTP server "error" event.
		function onError (error) {
			if (error.syscall !== 'listen') {
				throw error;
			}

			var bind = typeof error.port === 'string' ? 'Pipe ' + error.port : 'Port ' + error.port;

			// handle specific listen errors with friendly messages
			switch (error.code) {
				case 'EACCES':
					console.error(bind + ' requires elevated privileges');
					process.exit(1);
					break;
				case 'EADDRINUSE':
					console.error(bind + ' is already in use');
					process.exit(1);
					break;
				default:
					throw error;
			}
		}

		// Event listener for HTTP server "listening" event.
		function onListeningFn (server) {
			return function onListening () {
				var address = server.address();
				var bind = typeof address === 'string'
					? 'pipe ' + address
					: 'port ' + address.port;
				console.log('Listening on ' + bind);
			};
		}

		// start session
		var session = this.sessionStart();

		// view engine setup
		this.app.set('views', 'views');
		this.app.set('view engine', 'pug');

		// initialize the session state
		this.app.use(logger('dev'));
		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({extended: false}));
		this.app.use(cookieParser());
		this.app.use(expressSession(session));

		// app controllers and endpoints
		new UserController(this);
		new CollectionController(this);
		new ErrorHandler(this);

		// static files
		this.app.use('/', express.static('./public'));

		// catch 404 and forward to error handler
		this.app.use((request, response, next) => {
			var error = new Error('Not Found');
			error.status = 404;
			next(error);
		});

		this.app.use((error, request, response) => {
			response.status(error.status || 500);
			response.render('error', {
				message: error.message,
				error: this.app.get('env') === 'development' ? error : null
			});
		});

		if (this.settings.https && this.settings.https.enabled) {
			if (this.settings.https.privateKey !== undefined &&
				this.settings.https.privateKey !== '' &&
				this.settings.https.certificate !== undefined &&
				this.settings.https.certificate !== '') {

				let options = {
					key: fs.readFileSync(this.settings.https.privateKey).toString(),
					cert: fs.readFileSync(this.settings.https.certificate).toString()
				};

				let server = https.createServer(options, this.app);
				server.on('error', onError);
				server.on('listening', onListeningFn(server));
				server.listen(this.settings.https.port || 443);
			} else {
				throw new Error('HTTPS credentials are not valid.');
			}
		}

		if (this.settings.http && this.settings.http.enabled) {
			let server = http.createServer(this.app);
			server.on('error', onError);
			server.on('listening', onListeningFn(server));
			server.listen(this.settings.http.port || 80);
		}

		// live reloading for dev environments
		if (this.app.get('env') === 'development') {
			livereload(this.app, {
				watchDir: 'public'
			});
		}
	}

	result (request, response, result, statusCode, headers) {
		if (!response) {
			return result;
		}

		response.status(statusCode || 200)
			.set(headers)
			.json(result);
	}

	error (request, response, error, statusCode) {
		if (!response) {
			return error;
		}

		// throw error to console
		console.log(error);

		// default to 500
		statusCode = statusCode || 500;

		// send response back to xhr request
		response.status(statusCode)
			.json({
				'error': error
			});

		if (statusCode === 500) {
			Email.sendErrorEmail(server, request, error);
		}

	}
}

new Backrest();