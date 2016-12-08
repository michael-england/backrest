#!/usr/bin/env node

'use strict';

const http = require('http');
const https = require('https');
const express = require('express');
const expressSession = require('express-session');
const MongoStore = require('connect-mongo')(expressSession);
const CollectionController = require('./controllers/collection-controller');
const UserController = require('./controllers/user-controller');
const Setup = require('./lib/setup');
const Email = require('./lib/email');
const ErrorHandler = require('./lib/error-handler');
const Property = require('./lib/property');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const livereload = require('express-livereload');
const logger = require('morgan');

class Backrest {
	constructor () {
		const BACKREST_INSTALLED = 'backrest.installed';

		this.app = express();
		process.env.NODE_ENV = this.app.get('env');

		Property.getValue(BACKREST_INSTALLED, false).then((value) => {
			if (value) {
				this.httpStart();
			} else {
				Setup.init().then(() => {
					this.httpStart();
				});
			}
		});
	}

	sessionStart () {
		return {
			'store': new MongoStore({
				'url': process.env.MONGODB_URI || 'mongodb://localhost:27017/backrest',
				'maxAge': 300000
			}),
			'secret': '$3cr3t',
			'resave': false,
			'saveUninitialized': true
		};
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

		Property.getValue('backrest.https.enabled', false).then((enabled) => {
			if (!enabled) {
				return;
			}

			var promises = [];
			promises.push(Property.getValue('backrest.https.privateKey', ''));
			promises.push(Property.getValue('backrest.https.certificate', ''));
			promises.push(Property.getValue('backrest.https.port', 443));
			Promise.all(promises).then((values) => {
				var options = {
					'key': values[0],
					'cert': values[1]
				};

				if (options.key && options.cert) {
					let server = https.createServer(options, this.app);
					server.on('error', onError);
					server.on('listening', onListeningFn(server));
					server.listen(values[3]);
				} else {
					throw new Error('HTTPS credentials are not valid.');
				}
			});
		});

		Property.getValue('backrest.http.enabled', true).then((enabled) => {
			if (!enabled) {
				return;
			}

			let server = http.createServer(this.app);
			server.on('error', onError);
			server.on('listening', onListeningFn(server));
			server.listen(process.env.PORT || 3000);
		});

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
			Email.sendErrorEmail(request, error);
		}
	}
}

new Backrest();