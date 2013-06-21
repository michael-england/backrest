var mongojs = require("mongojs");
var http = require("http");
var https = require("https");
var events = require('events');
var libpath = require("path");
var fs = require("./lib/fs");
var url = require("url");
var mime = require("mime");
var util = require("util");
var validators = require("./lib/validators");
var jsonrpc = require("./lib/jsonrpc");
var authentication = require("./lib/authentication");
var email = require("./node_modules/emailjs/email");
var uploads = require("./lib/uploads");
var jsonrpc = require("./lib/jsonrpc");
var error = require("./lib/error");
var render = require("./lib/error");
var express = require("express");
var MongoStore = require("connect-mongo")(express);

MongoConductor = function() {
    events.EventEmitter.call(this);
    this.settings;
    this.settingsFilename;
    this.collections;
    this.path = ".";
    this.events;
    this.customValidators;
    this.db;
    this.mail;
    this.uploads = require("./lib/uploads");
    this.jsonrpc = require("./lib/jsonrpc");
    this.authentication = require("./lib/authentication");
    this.app = express();

    this.init = function() {
        this.settingsFilename = libpath.join(this.path, "settings.json");
        fs.exists(this.settingsFilename, this.libpathExists.bind(this));
    };

    this.libpathExists = function(exists) {
        if (exists) {
            fs.readFile(this.settingsFilename, "binary", this.fsReadFile.bind(this));
        } else {

            // handle error
            console.log("settings.json file does not exist.");

            // exit the application
            process.exit();
        }
    };

    this.fsReadFile = function(error, file) {
        if (!error) {
            try {
                // parse file to this.settings object
                this.settings = JSON.parse(file);

                // push setting's collection to collections name array
                this.collections = Object.keys(this.settings.collections);

                // register events
                if (this.settings.paths.events !== undefined) {
                    this.events = require(this.settings.paths.events);
                    for (var c = 0; c < this.collections.length; c++) {
                        var collection = this.settings.collections[this.collections[c]];
                        var methods = Object.keys(collection);
                        for (var m = 0; m < methods.length; m++) {
                            var method = collection[methods[m]];
                            var actions = Object.keys(method);
                            for (var a = 0; a < actions.length; a++) {
                                var action = method[actions[a]];
                                if (action.events !== undefined) {
                                    var events = action.events;
                                    for (var e = 0; e < events.length; e++) {
                                        var event = events[e];
                                        this.on(this.collections[c] + "_" + methods[m] + "_" + actions[a] + "_" + event.type, this.events[event.listener]);
                                    }
                                }
                            }
                        }
                    }
                }

                // create mail server
                if (this.settings.mail) {
                    this.mail = email.server.connect(this.settings.mail.server);

                    this.loadMail("confirmEmail");
                    this.loadMail("passwordResetRequest");
                    this.loadMail("errorEmail");
                }

                // register validators
                if (this.settings.paths.customValidators !== undefined) {
                    this.customValidators = require(this.settings.paths.customValidators);
                }

                // start the http server
                this.httpStart();

                // connect to the database
                this.db = mongojs(this.settings.databaseUrl, this.collections);
            } catch (ex) {
                // handle error
                console.log(ex.message);

                // exit the application
                process.exit();
            }
        } else {

            // exit the application
            process.exit();
        }
    };

    this.loadMail = function(key) {

        fs.exists(this.settings.mail.messages[key].text, function(exists) {
            if (exists) {
                fs.readFile(this.settings.mail.messages[key].text, "binary", function(errorMessage, fileMessage) {
                    this.settings.mail.messages[key].text = fileMessage;
                }.bind(this));
            }
        }.bind(this));

        if (this.settings.mail.messages[key].attachment) {
            if (this.settings.mail.messages[key].attachment[0]) {
                if (this.settings.mail.messages[key].attachment[0].alternative === true) {
                    fs.exists(this.settings.mail.messages[key].attachment[0].data, function(exists) {
                        if (exists) {
                            fs.readFile(this.settings.mail.messages[key].attachment[0].data, "binary", function(errorAttachment, fileAttachment) {
                                this.settings.mail.messages[key].attachment[0].data = fileAttachment;
                            }.bind(this));
                        }
                    }.bind(this));
                }
            }
        }
    };

    this.httpStart = function() {

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
        this.app.use("/", express.static("./public"));
        this.app.use("/uploads", "./uploads");
        this.app.use(error(this));
        this.app.use(render(this));
        this.app.use(authentication(this));
        this.app.use(uploads(this));
        this.app.use(jsonrpc(this));

        if (this.settings.https) {
            if (this.settings.https.enabled) {
                if (this.settings.https.privateKey !== undefined && this.settings.https.privateKey !== "" && this.settings.https.certificate !== undefined && this.settings.https.certificate !== "") {

                    var options = {
                        key: fs.readFileSync(this.settings.https.privateKey).toString(),
                        cert: fs.readFileSync(this.settings.https.certificate).toString()
                    };

                    https.createServer(options, this.app).listen(this.settings.https.port || 443);
                    console.log("HTTPS Server running on port " + (this.settings.https.port || 443) + ".");
                } else {
                    throw new Error("HTTPS credientials are not valid.");
                }
            }
        }

        if (this.settings.http) {
            if (this.settings.http.enabled) {
                http.createServer(this.app).listen(this.settings.http.port || 80, undefined, function () {
                    console.log("HTTP Server running on port " + (this.settings.http.port || 80) + ".");
                }.bind(this));
            }
        }
    };

    this.result = function(request, response, result, id) {

        var query = url.parse(request.url, true).query;

        if (query.callback) {
            response.writeHead(200, {
                "Content-Type": "text/javascript",
                "Access-Control-Allow-Origin": "*"
            });
            response.end(query.callback + "(" + JSON.stringify(result) + ")");
        } else {

            var json = {
                "jsonrpc": "2.0",
                "result": result,
                "id": id
            };

            response.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            });
            response.end(JSON.stringify(json));
        }
    };
    this.error = function(request, response, errorCode, errorMessage, id, validationSummary) {

        var json;
        var query = url.parse(request.url, true).query;
        if (query.error) {
            // Internal error occurred, create internal error response
            json = {
                "code": errorCode,
                "message": errorMessage
            };

            if (validationSummary !== undefined) {
                json.result = validationSummary;
            }

            response.writeHead(200, {
                "Content-Type": "text/javascript",
                "Access-Control-Allow-Origin": "*"
            });
            response.end(query.error + "(" + JSON.stringify(json) + ")");
        } else if (query.callback) {
            // Internal error occurred, create internal error response
            json = {
                "error": {
                    "code": errorCode,
                    "message": errorMessage
                }
            };

            if (validationSummary !== undefined) {
                json.result = validationSummary;
            }

            response.writeHead(200, {
                "Content-Type": "text/javascript",
                "Access-Control-Allow-Origin": "*"
            });
            response.end(query.callback + "(" + JSON.stringify(json) + ")");
        } else {

            // Internal error occurred, create internal error response
            json = {
                "jsonrpc": "2.0",
                "error": {
                    "code": errorCode,
                    "message": errorMessage
                },
                "id": id
            };

            if (validationSummary !== undefined) {
                json.result = validationSummary;
            }

            response.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            });
            response.end(JSON.stringify(json));
        }
    };
};

util.inherits(MongoConductor, events.EventEmitter);

var mongoConductor = new MongoConductor();
mongoConductor.init();
