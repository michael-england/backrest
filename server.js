(function() {
  'use strict';

  var http = require('http');
  var https = require('https');
  var events = require('events');
  var fs = require('./lib/fs');
  var url = require('url');
  var util = require('util');
  var email = require('./node_modules/emailjs/email');
  var express = require('express');
  var mongoose = require('mongoose');
  var MongoStore = require('connect-mongo')(express);

  var Backrest = function() {
    events.EventEmitter.call(this);
    this.uploads = require('./lib/uploads');
    this.app = express();

    this.init = function() {
      var settingsFilename = './settings.json';
      if (fs.existsSync(settingsFilename)) {

        // read the settings file
        var file = fs.readFileSync(settingsFilename, {
          'encoding': 'binary'
        });

        // parse file to this.settings object
        this.settings = JSON.parse(file);

        // init mongoose
        this.mongoose = mongoose;
        this.mongoose.connect(this.settings.databaseUrl);
        this.mongoose.set('cache', false);

        // perform initial setup
        if (this.settings.setup && !fs.existsSync('./INSTALLED')) {
          require('./lib/setup')(this, function() {

            // start the servers
            this.smtpStart();
            this.httpStart();
          }.bind(this));
        } else {

          // start the servers
          this.smtpStart();
          this.httpStart();
        }
      } else {

        // handle error
        console.log('settings.json file does not exist.');

        // exit the application
        process.exit();
      }
    };

    this.loadMail = function(key) {

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
    };

    this.smtpStart = function() {

      // create mail server
      if (this.settings.mail) {
        this.mail = email.server.connect(this.settings.mail.server);
        this.loadMail('confirmEmail');
        this.loadMail('passwordResetRequest');
        this.loadMail('errorEmail');
      }
    }

    this.httpStart = function(callback) {

      // define the session
      var session = {};
      if (this.settings.session) {
        session = JSON.parse(JSON.stringify(this.settings.session));
        if (session.store) {

          if (!session.store.url) {
            session.store.url = this.settings.databaseUrl;
          }

          session.store = new MongoStore(session.store);
        }
      }

      // initialize the session state
      this.app.use(express.bodyParser());
      this.app.use(express.cookieParser());
      this.app.use(express.session(session));
      this.app.use('/', express.static('./public'));
      this.app.use('/uploads', './uploads');
      this.app.use(require('./lib/error')(this));
      this.app.use(require('./lib/render')(this));
      this.app.use(require('./lib/users')(this));
      this.app.use(require('./lib/uploads')(this));
      this.app.use(require('./lib/collections')(this));

      if (this.settings.https) {
        if (this.settings.https.enabled) {
          if (this.settings.https.privateKey !== undefined && this.settings.https.privateKey !== '' && this.settings.https.certificate !== undefined && this.settings.https.certificate !== '') {

            var options = {
              key: fs.readFileSync(this.settings.https.privateKey).toString(),
              cert: fs.readFileSync(this.settings.https.certificate).toString()
            };

            https.createServer(options, this.app).listen(this.settings.https.port || 443, function() {
              console.log('HTTPS Server running on port ' + (this.settings.https.port || 443) + '.');
            }.bind(this));
          } else {
            throw new Error('HTTPS credientials are not valid.');
          }
        }
      }

      if (this.settings.http) {
        if (this.settings.http.enabled) {
          http.createServer(this.app).listen(this.settings.http.port || 80, undefined, function() {
            console.log('HTTP Server running on port ' + (this.settings.http.port || 80) + '.');
          }.bind(this));
        }
      }
    };

    this.result = function(request, response, result) {
      if (response) {
        var uri = url.parse(request.url, true);
        if (uri.query.callback) {

          // jsonp response
          response.writeHead(200, {
            'Content-Type': 'text/javascript',
            'Access-Control-Allow-Origin': '*'
          });
          response.end(uri.query.callback + '(' + JSON.stringify(result) + ')');
        } else {

          // json response
          response.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          response.end(JSON.stringify(result));
        }
      } else {
        return result;
      }
    };

    this.error = function(request, response, message, statusCode) {
      if (response) {

        // Internal error occurred, create internal error response
        var json = {
          'error': message
        };

        var query = url.parse(request.url, true).query;
        if (query.callback) {

          // jsonp response
          response.writeHead(200, {
            'Content-Type': 'text/javascript',
            'Access-Control-Allow-Origin': '*'
          });
          response.end(query.callback + '(' + JSON.stringify(json) + ')');
        } else {

          // json response
          response.writeHead(statusCode || 200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          response.end(JSON.stringify(json));
        }
      } else {
        return message;
      }
    };
  };

  util.inherits(Backrest, events.EventEmitter);

  var backrest = new Backrest();
  backrest.init();
})();