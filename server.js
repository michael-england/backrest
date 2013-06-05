var mongojs = require("mongojs");
var http = require("http");
var https = require("https");
var events = require('events');
var session = require('./lib/core').session;
var libpath = require("path");
var fs = require("./lib/fs");
var url = require("url");
var mime = require("mime");
var util = require("util");
var formidable = require("formidable");
var validators = require("./lib/validators");
var jsonrpc = require("./lib/jsonrpc");
var authentication = require("./lib/authentication");
var email = require("./node_modules/emailjs/email");
var uploads = require("./lib/uploads");
var jsonrpc = require("./lib/jsonrpc");

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

        var requested = function(request, response) {
            session(request, response, function(request, response) {
                if (request.method == "POST") {

                    // process POST request
                    this.post(request, response);

                } else {

                    // process with the requested file
                    this.get(request, response);
                }
            }.bind(this));
        }.bind(this);

        if (this.settings.https) {
            if (this.settings.https.enabled) {
                if (this.settings.https.privateKey !== undefined && this.settings.https.privateKey !== "" && this.settings.https.certificate !== undefined && this.settings.https.certificate !== "") {

                    var options = {
                        key: fs.readFileSync(this.settings.https.privateKey).toString(),
                        cert: fs.readFileSync(this.settings.https.certificate).toString()
                    };

                    https.createServer(options, requested).listen(this.settings.https.port);
                    console.log("HTTPS Server running on port " + this.settings.https.port + ".");
                } else {
                    throw new Error("HTTPS credientials are not valid.");
                }
            }
        }

        if (this.settings.http) {
            if (this.settings.http.enabled) {
                http.createServer(requested).listen(this.settings.http.port);
                console.log("HTTP Server running on port " + this.settings.http.port + ".");
            }
        }
    };

    this.post = function(request, response) {

        if (request.headers["content-type"].indexOf("multipart/form-data") > -1) {
            var form = new formidable.IncomingForm();
            form.parse(request, function(error, fields, files) {
                try {
                    if (error) {
                        // show error in log
                        console.error(error.message);

                        // respond to request with error
                        this.uploads.render(this, request, response, fields.collection, field, "error");
                        return;
                    }

                    // set default action if not set
                    if (fields.action === undefined) {
                        fields.action = "default";
                    }

                    // get field from key
                    var field = "";
                    var keys = Object.keys(files);
                    if (keys.length > 0) {
                        field = keys[0];
                    }

                    if (fields.method === "upload") {

                        // upload the files
                        this.uploads.upload(this, request, response, fields, files);
                        return;

                    } else {

                        // respond to request with error
                        this.uploads.render(this, request, response, fields.collection, field, "error");
                        return;
                    }
                } catch (e) {

                    // throw error to console
                    console.log(e);

                    if (this.settings.isDebug) {

                        // email error
                        this.sendErrorEmail(request, undefined, e, function() {

                            // throw the error if in debug mode
                            throw e;
                        });

                    } else {

                        // respond to request with error
                        this.uploads.render(this, request, response, fields.collection, field, "error");

                        // email error
                        this.sendErrorEmail(request, data, e);
                        return;
                    }
                }
            }.bind(this));
        } else {

            // load chunks into data
            var data = "";
            request.on("data", function(chunk) {
                data += chunk;
            }.bind(this));

            // chucks have loaded, continue the request
            request.on("end", function() {

                this.method(request, response, data);

            }.bind(this));
        }
    };

    this.get = function(request, response) {

        var uri = url.parse(request.url).pathname;
        if (uri.indexOf("settings.json", 0) < 0 && uri.indexOf("server.js", 0) < 0 && uri.indexOf("lib/", 0) < 0 && uri.indexOf("node_modules/", 0) < 0 && uri.indexOf(this.settings.privateKey, 0) < 0 && uri.indexOf(this.settings.certificate, 0) < 0) {

            if ((uri.indexOf("index.html") === 1 && !this.settings.isDebug) || (uri === "/" && !this.settings.isDebug)) {
                response.writeHead(404, {
                    "Content-Type": "text/plain"
                });
                response.write("404 Not Found\n");
                response.end();
            } else {

                var filename = libpath.join(this.path, uri);
                fs.exists(filename, function(exists) {
                    if (!exists) {

                        // see if file exists
                        fs.exists("./lib/" + filename + ".js", function(requireExists) {
                            if (!requireExists) {

                                if (this.settings.collections[uri.replace("/", "")] || uri.replace("/", "") === "_settings") {

                                    // execute api call
                                    var query = url.parse(request.url, true).query;
                                    this.method(request, response, query.data);
                                } else {

                                    // respond with a 404
                                    response.writeHead(404, {
                                        "Content-Type": "text/plain"
                                    });
                                    response.write("404 Not Found\n");
                                    response.end();
                                }
                            } else {

                                try {
                                    var file = require("./lib/" + filename + ".js");
                                    if (file.render !== undefined) {

                                        // respond with a rendered page
                                        file.render(this, request, response);
                                        return;
                                    } else {

                                        // respond with a 404
                                        response.writeHead(404, {
                                            "Content-Type": "text/plain"
                                        });
                                        response.write("404 Not Found\n");
                                        response.end();
                                        return;
                                    }
                                } catch (error) {

                                    // respond with an error
                                    response.writeHead(500, {
                                        "Content-Type": "text/plain"
                                    });
                                    response.write("500 Internal Server Error\n");
                                    response.end();
                                }
                            }
                        }.bind(this));
                        return;
                    }

                    // add the default document to the filename
                    if (fs.statSync(filename).isDirectory()) {
                        filename += "/index.html";
                    }

                    // read teh filename
                    fs.readFile(filename, "binary", function(error, file) {
                        if (error) {

                            // respond with an error
                            response.writeHead(500, {
                                "Content-Type": "text/plain"
                            });
                            response.write(error + "\n");
                            response.end();
                            return;
                        } else {

                            try {

                                // lookup the mime type
                                var type = mime.lookup(filename);

                                // add headers based on protocol
                                var headers = {};
                                if (request.connection.encrypted) {
                                    headers = this.settings.https.static.headers;
                                } else {
                                    headers = this.settings.http.static.headers;
                                }
                                headers["Content-Type"] = type;

                                // respond with the file
                                response.writeHead(200, headers);
                                response.end(file, "binary");
                            } catch (error) {

                                // respond with an error
                                response.writeHead(500, {
                                    "Content-Type": "text/plain"
                                });
                                response.write("500 Internal Server Error\n");
                                response.end();
                            }
                        }
                    }.bind(this));
                }.bind(this));
            }
        } else {

            // respond with a 404
            response.writeHead(404, {
                "Content-Type": "text/plain"
            });
            response.write("404 Not Found\n");
            response.end();
        }
    };

    this.method = function(request, response, data) {
        var json;
        try {

            // parse data to json
            json = JSON.parse(data);

        } catch (error) {

            // Internal error occurred, create internal error response
            this.error(request, response, -32700, "Parse error.", undefined);
            return;
        }

        try {
            var collection = url.parse(request.url, true).pathname.replace("/", "");
            if (collection !== undefined) {

                var authenticationMethods = ["login", "logout", "switchUser", "getAuthenticatedUser", "isAuthenticated", "isInRole",
                                             "changePassword", "passwordResetRequest", "passwordReset", "confirmEmail", "confirmEmailRequest"];

                if (collection == this.settings.authentication.collection && authenticationMethods.indexOf(json.method) > -1) {

                    // process the authenciation method
                    this.authentication[json.method](this, request, response, json);

                } else if (json.method == "clearUpload") {

                    // process the clear uploads request
                    this.uploads.clear(request, response, json, collection);

                } else if (collection === "_settings" && this.settings.isDebug && json.method === "get") {

                    // response with settings only if server is in debug mode
                    this.result(request, response, this.settings, json.id);

                } else {

                    // process jsonrpc request
                    this.jsonrpc.process(this, request, response, json, collection);
                }
            } else {

                // collection not provided, create procedure not found response
                this.error(request, response, -32601, "Procedure not found.", json.id);
                return;
            }
        } catch (error) {

            // throw error to console
            console.log(error);

            try {

                // Internal error occurred, create internal error response
                this.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

                // email error
                this.sendErrorEmail(request, data, error);

            } catch (errorMail) {

                // throw the error if in debug mode
                throw error;
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

    this.sendErrorEmail = function(request, data, error, callback) {

        if (this.settings.mail.messages.errorEmail) {
            if (this.settings.mail.messages.errorEmail.enabled) {

                // format the email message - textevents.js
                var mailMessage = JSON.parse(JSON.stringify(this.settings.mail.messages.errorEmail));
                mailMessage.text = mailMessage.text.replace(/{timestamp}/g, new Date().toString());
                mailMessage.text = mailMessage.text.replace(/{error}/g, error.stack);
                mailMessage.text = mailMessage.text.replace(/{url}/g, request.url);
                mailMessage.text = mailMessage.text.replace(/{method}/g, request.method);
                mailMessage.text = mailMessage.text.replace(/{headers}/g, JSON.stringify(request.headers, null, 4));
                mailMessage.text = mailMessage.text.replace(/{session}/g, JSON.stringify(request.session, null, 4));
                mailMessage.text = mailMessage.text.replace(/{data}/g, data);

                // format the email message - html
                if (mailMessage.attachment) {
                    for (var a = 0; a < mailMessage.attachment.length; a++) {
                        if (mailMessage.attachment[a].alternative === true) {
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{timestamp}/g, new Date().toString());
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{error}/g, error.stack);
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{url}/g, request.url);
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{method}/g, request.method);
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{headers}/g, JSON.stringify(request.headers, null, 4));
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{session}/g, JSON.stringify(request.session, null, 4));
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{data}/g, data);
                        }
                    }
                }

                // send the email
                this.mail.send(mailMessage, callback);
            }
        }
    };
};

util.inherits(MongoConductor, events.EventEmitter);

var mongoConductor = new MongoConductor();
mongoConductor.init();
