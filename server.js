var mongo = require("mongojs");
var http = require("http");
var https = require("https");
var events = require('events');
var session = require('./lib/core').session;
var libpath = require("path");
var fs = require("./lib/fs");
var url = require("url");
var mime = require("mime");
var util = require("util");
var crypto = require("crypto");
var passwordHash = require("password-hash");
var formidable = require("formidable");
var validators = require("./lib/validators");
var filters = require("./lib/filters");
var roles = require("./lib/roles");
var params = require("./lib/params");
var email = require("./node_modules/emailjs/email");
var imagemagick = require('imagemagick');

MongoConductor = function() {
    events.EventEmitter.call(this);
    this.settings = undefined;
    this.settingsFilename = undefined;
    this.collections = undefined;
    this.path = ".";
    this.events = undefined;
    this.customValidators = undefined;
    this.db = undefined;
    this.mail = undefined;

    this.init = function() {
        this.settingsFilename = libpath.join(this.path, "settings.json");
        libpath.exists(this.settingsFilename, this.libpathExists.bind(this));
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
                this.db = mongo.connect(this.settings.databaseUrl, this.collections);
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

        libpath.exists(this.settings.mail.messages[key].text, function(exists) {
            if (exists) {
                fs.readFile(this.settings.mail.messages[key].text, "binary", function(errorMessage, fileMessage) {
                    this.settings.mail.messages[key].text = fileMessage;
                }.bind(this));
            }
        }.bind(this));

        if (this.settings.mail.messages[key].attachment) {
            if (this.settings.mail.messages[key].attachment[0]) {
                if (this.settings.mail.messages[key].attachment[0].alternative === true) {
                    libpath.exists(this.settings.mail.messages[key].attachment[0].data, function(exists) {
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

        if (this.settings.https) {
            if (this.settings.https.enabled) {
                if (this.settings.https.privateKey !== undefined && this.settings.https.privateKey !== "" && this.settings.https.certificate !== undefined && this.settings.https.certificate !== "") {

                    var options = {
                        key: fs.readFileSync(this.settings.https.privateKey).toString(),
                        cert: fs.readFileSync(this.settings.https.certificate).toString()
                    };

                    https.createServer(options, function(request, response) {
                        session(request, response, function(request, response) {
                            if (request.method == "POST") {

                                // process POST request
                                this.processPost(request, response);

                            } else {

                                // process with the requested file
                                this.processGet(request, response);
                            }
                        }.bind(this));
                    }.bind(this)).listen(this.settings.https.port);

                    console.log("HTTPS Server running on port " + this.settings.https.port + ".");
                } else {
                    throw new Error("HTTPS credientials are not valid.");
                }
            }
        }

        http.createServer(function(request, response) {
            session(request, response, function(request, response) {
                if (request.method == "POST") {

                    // process POST request
                    this.processPost(request, response);

                } else {

                    // process with the requested file
                    this.processGet(request, response);
                }
            }.bind(this));
        }.bind(this)).listen(this.settings.http.port);

        console.log("HTTP Server running on port " + this.settings.http.port + ".");
    };

    this.processLogin = function(request, response, json) {

        var isValid = true;

        // filter the params
        json.params = filters.filter(this.settings, this.settings.authentication.collection, "login", "default", json.params, "in");

        // validate
        validators.validate(this, request, this.settings.authentication.collection, "login", "default", json, json.params, function(validationSummary) {
            if (validationSummary !== true) {
                isValid = false;
            }

            if (isValid) {

                // temporarily save password and remove it from params
                var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                var password = json.params[passwordField];
                delete json.params[passwordField];

                // the login response
                var dbLoginResult = function(error, result) {
                    if (error) {

                        // collection not provided, create procedure not found response
                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

                    } else {

                        if (!result) {

                            // collection not provided, create procedure not found response
                            this.processError(request, response, -32000, "Invalid credentials.", json.id);

                        } else {

                            // check password
                            if (passwordHash.verify(password, result[passwordField])) {

                                var emailConfirmed = true;
                                if (this.confirmEmailEnabled() && result._created) {
                                    if (result[(!this.settings.authentication.confirmEmailField ? "isConfirmed" : this.settings.authentication.confirmEmailField)] !== true) {

                                        // calculate timeout
                                        var timeout = (this.settings.authentication.confirmEmailTimeout ? this.settings.authentication.confirmEmailTimeout : 1440) * 60;
                                        timeout = timeout * 60;
                                        timeout = timeout + result._created;

                                        // get timeout date from timeout epoch
                                        var timeoutDate = new Date(0);
                                        timeoutDate.setSeconds(timeout);

                                        // get current date
                                        var currentDate = new Date();

                                        if (timeoutDate <= currentDate) {
                                            emailConfirmed = false;
                                        }
                                    }
                                }

                                if (emailConfirmed) {

                                    // log authentication change
                                    console.log("Session " + request.session.id + " is now logged in as " + result[(!this.settings.authentication.usernameField ? "email" : this.settings.authentication.usernameField)]);

                                    // change the authenticated user
                                    request.session.data.user = JSON.parse(JSON.stringify(result));

                                    // set last login
                                    var params = {};
                                    params[(!this.settings.authentication.lastLoginField ? "_lastLogin" : this.settings.authentication.lastLoginField)] = Math.round(new Date().getTime() / 1000.0);
                                    this.db[this.settings.authentication.collection].update({
                                        "_id": result._id
                                    }, {
                                        "$set": params
                                    });

                                    // filter out return values
                                    var resultFiltered = filters.filter(this.settings, this.settings.authentication.collection, "login", "default", result, "out");

                                    // return result
                                    this.processResult(request, response, resultFiltered, json.id);
                                } else {

                                    // collection not provided, create procedure not found response
                                    this.processError(request, response, -32000, "Email not confirmed.", json.id);
                                }

                                return;
                            } else {

                                // collection not provided, create procedure not found response
                                this.processError(request, response, -32000, "Invalid credentials.", json.id);
                            }
                        }
                    }
                }.bind(this);

                // build the command		
                var command = "this.db." + this.settings.authentication.collection + ".findOne(" + JSON.stringify(json.params) + ", dbLoginResult);";

                // write command to log
                console.log(request.session.id + ": " + command);

                // execute command
                eval(command);
            } else {

                // validation not passed, return with error and validation summary
                this.processError(request, response, -32000, "Invalid credentials.", json.id, validationSummary);
                return;
            }
        }.bind(this));
    };

    this.processLogout = function(request, response, json) {

        // change the authenticated user
        request.session.data.user = "guest";

        // log authentication change
        console.log("Session " + request.session.id + " is now logged in as " + request.session.data.user);

        // return result
        this.processResult(request, response, "Logout successful.", json.id);
        return;
    };

    this.processChangePassword = function(request, response, json) {

        if (request.session.data.user != "guest") {
            var isValid = true;

            // filter the params
            json.params = filters.filter(this.settings, this.settings.authentication.collection, "changePassword", "default", json.params, "in");

            // validate
            validators.validate(this, request, this.settings.authentication.collection, "changePassword", "default", json, json.params, function(validationSummary) {
                if (validationSummary !== true) {
                    isValid = false;
                }

                if (isValid) {

                    // temporarily save password and remove it from params
                    var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                    var password = json.params[passwordField];
                    delete json.params[passwordField];

                    if (passwordHash.verify(password, request.session.data.user[passwordField])) {

                        // ensure new password and password confirmation match
                        if (json.params.newPassword == json.params.confirmPassword) {

                            // encrypt the new password
                            json.params[passwordField] = passwordHash.generate(json.params.newPassword);

                            // removed new password and password confirmation
                            delete json.params.newPassword;
                            delete json.params.confirmPassword;

                            // save changes to db
                            var dbResult = function(error, result) {
                                if (error) {

                                    // collection not provided, create procedure not found response
                                    this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

                                } else {
                                    // log password change
                                    console.log("Session " + request.session.id + " has changed their password");

                                    // store new password in session
                                    request.session.data.user[passwordField] = json.params.newPassword;

                                    // return success
                                    this.processResult(request, response, "Password successfully changed.", json.id);
                                }

                            }.bind(this);

                            var update = {
                                "$set": json.params
                            };

                            // build the command
                            var command = "this.db." + this.settings.authentication.collection + ".update({\"_id\":this.db.ObjectId(\"" + request.session.data.user._id.toString() + "\")}," + JSON.stringify(update) + ", dbResult);";

                            // write command to log
                            console.log(request.session.id + ": " + command);

                            // execute command
                            eval(command);
                        } else {

                            // new password and password confirmation do not match
                            this.processError(request, response, -32000, "New password and confirm password do not match.", json.id, validationSummary);
                        }
                    } else {

                        // user currently not logged in
                        this.processError(request, response, -32000, "Invalid credentials.", json.id, validationSummary);
                    }
                } else {

                    // validation not passed, return with error and validation summary
                    this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                }
            }.bind(this));
        } else {

            // user currently not logged in
            this.processError(request, response, -32000, "User not logged in.", json.id, validationSummary);
            return;
        }
    };

    this.processPasswordResetRequest = function(request, response, json) {

        console.log(this.settings.mail);

        var isValid = true;

        // filter the params
        json.params = filters.filter(this.settings, this.settings.authentication.collection, "passwordResetRequest", "default", json.params, "in");

        // validate
        validators.validate(this, request, this.settings.authentication.collection, "passwordResetRequest", "default", json, json.params, function(validationSummary) {
            if (validationSummary !== true) {
                isValid = false;
            }

            if (isValid) {

                // the login response
                var dbResult = function(error, result) {
                    if (error) {

                        // internal MongoDB error
                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

                    } else {

                        if (!result) {

                            // return result
                            this.processResult(request, response, false, json.id);

                        } else {

                            if (this.settings.mail) {
                                if (this.settings.mail.messages && this.settings.authentication.passwordResetToken) {

                                    // create and encrypt the token
                                    var expiration = new Date();
                                    expiration.setMinutes(expiration.getMinutes() + this.settings.authentication.passwordResetToken.timeout);

                                    var algorithm = this.settings.authentication.passwordResetToken.algorithm;
                                    var password = this.settings.authentication.passwordResetToken.password;
                                    var cipher = crypto.createCipher(algorithm, password);

                                    var token = {};
                                    token._id = result._id;
                                    token.expiration = expiration;
                                    token = cipher.update(JSON.stringify(token), "utf8", "hex");
                                    token += cipher.final("hex");

                                    // format the email message - textevents.js
                                    var mailMessage = JSON.parse(JSON.stringify(this.settings.mail.messages.passwordResetRequest));
                                    mailMessage.text = mailMessage.text.replace(/{firstName}/g, (result.firstName || ""));
                                    mailMessage.text = mailMessage.text.replace(/{lastName}/g, (result.lastName || ""));
                                    mailMessage.text = mailMessage.text.replace(/{token}/g, encodeURIComponent(token));
                                    mailMessage.to = (result.firstName || "") + " " + (result.lastName || "") + " <" + result[(!this.settings.authentication.usernameField ? "email" : this.settings.authentication.usernameField)] + ">";

                                    // format the email message - html
                                    if (mailMessage.attachment) {
                                        for (var a = 0; a < mailMessage.attachment.length; a++) {
                                            if (mailMessage.attachment[a].alternative === true) {
                                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{firstName}/g, (result.firstName || ""));
                                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{lastName}/g, (result.lastName || ""));
                                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, encodeURIComponent(token));
                                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, "");
                                            }
                                        }
                                    }

                                    // send the email
                                    this.mail.send(mailMessage, function(error, message) {
                                        if (error) {

                                            // error sending mail
                                            this.processError(request, response, -32000, error.message, json.id);
                                        } else {

                                            // return result
                                            this.processResult(request, response, true, json.id);
                                        }
                                    }.bind(this));

                                    // return result
                                    //this.processResult(request, response, true, json.id);

                                } else {

                                    // reset not enabled
                                    this.processError(request, response, -32000, "Reset password not enabled.", json.id);
                                }
                            } else {

                                // reset not enabled
                                this.processError(request, response, -32000, "Reset password not enabled.", json.id);
                            }
                        }
                    }
                }.bind(this);

                // build the command
                var command = "this.db." + this.settings.authentication.collection + ".findOne(" + JSON.stringify(json.params) + ", dbResult);";

                // write command to log
                console.log(request.session.id + ": " + command);

                // execute command
                eval(command);
            } else {

                // validation not passed, return with error and validation summary
                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                return;
            }
        }.bind(this));
    };

    this.processPasswordReset = function(request, response, json) {

        var isValid = true;

        // filter the params
        json.params = filters.filter(this.settings, this.settings.authentication.collection, "passwordReset", "default", json.params, "in");

        // validate
        validators.validate(this, request, this.settings.authentication.collection, "passwordReset", "default", json, json.params, function(validationSummary) {
            if (validationSummary !== true) {
                isValid = false;
            }

            if (isValid) {

                var algorithm = this.settings.authentication.passwordResetToken.algorithm;
                var password = this.settings.authentication.passwordResetToken.password;
                var decipher = crypto.createDecipher(algorithm, password);
                var token = decipher.update(json.params.token, "hex", "utf8");
                token += decipher.final("utf8");
                token = JSON.parse(token);

                if (new Date() < new Date(token.expiration)) {

                    var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                    var password = json.params[passwordField];

                    // ensure new password and password confirmation match
                    if (json.params.newPassword == json.params.confirmPassword) {

                        // create params and encrypt the new password
                        var params = {};
                        params[passwordField] = passwordHash.generate(json.params.newPassword);

                        // update the user
                        this.db[this.settings.authentication.collection].update({
                            "_id": this.db.ObjectId(token._id)
                        }, {
                            "$set": params
                        }, function(error, result) {
                            if (error) {

                                // collection not provided, create procedure not found response
                                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

                            } else {
                                // log password change
                                console.log("Session " + request.session.id + " has reset their password");

                                // return success
                                this.processResult(request, response, "Password successfully reset.", json.id);
                            }
                        }.bind(this));
                    } else {

                        // new password and password confirmation do not match
                        this.processError(request, response, -32000, "New password and confirm password do not match.", json.id, validationSummary);
                    }
                } else {

                    // new password and password confirmation do not match
                    this.processError(request, response, -32000, "Password reset token has expired.", json.id);
                }

            } else {

                // validation not passed, return with error and validation summary
                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                return;
            }
        }.bind(this));
    };

    this.processConfirmEmailRequest = function(request, response, json) {

        var isValid = true;

        // filter the params
        json.params = filters.filter(this.settings, this.settings.authentication.collection, "confirmEmailRequest", "default", json.params, "in");

        // validate
        validators.validate(this, request, this.settings.authentication.collection, "confirmEmailRequest", "default", json, json.params, function(validationSummary) {
            if (validationSummary !== true) {
                isValid = false;
            }

            if (isValid) {

                // the login response
                var dbResult = function(error, result) {
                    if (error) {

                        // internal MongoDB error
                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

                    } else {

                        if (!result) {

                            // return result
                            this.processResult(request, response, false, json.id);

                        } else {

                            this.sendConfirmEmail(request, response, result, function(errorMail) {
                                if (errorMail) {

                                    // log error
                                    console.log(errorMail);

                                    // error sending mail
                                    this.processError(request, response, -32000, error.message, json.id);
                                } else {

                                    // return result
                                    this.processResult(request, response, true, json.id);
                                }
                            }.bind(this));
                        }
                    }
                }.bind(this);

                // build the command
                var command = "this.db." + this.settings.authentication.collection + ".findOne(" + JSON.stringify(json.params) + ", dbResult);";

                // write command to log
                console.log(request.session.id + ": " + command);

                // execute command
                eval(command);
            } else {

                // validation not passed, return with error and validation summary
                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                return;
            }
        }.bind(this));
    };

    this.processConfirmEmail = function(request, response, json) {

        var isValid = true;

        // filter the params
        json.params = filters.filter(this.settings, this.settings.authentication.collection, "confirmEmail", "default", json.params, "in");

        // validate
        validators.validate(this, request, this.settings.authentication.collection, "confirmEmail", "default", json, json.params, function(validationSummary) {
            if (validationSummary !== true) {
                isValid = false;
            }

            if (isValid) {

                var algorithm = this.settings.authentication.confirmEmailToken.algorithm;
                var password = this.settings.authentication.confirmEmailToken.password;
                var decipher = crypto.createDecipher(algorithm, password);
                var token = decipher.update(json.params.token, "hex", "utf8");
                token += decipher.final("utf8");
                token = JSON.parse(token);

                if (new Date() < new Date(token.expiration)) {

                    // create params
                    var params = {};
                    params[(!this.settings.authentication.confirmEmailField ? "isConfirmed" : this.settings.authentication.confirmEmailField)] = true;

                    // update the user
                    this.db[this.settings.authentication.collection].update({
                        "_id": this.db.ObjectId(token._id)
                    }, {
                        "$set": params
                    }, function(error, result) {
                        if (error) {

                            // collection not provided, create procedure not found response
                            this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

                        } else {

                            // log email confirmation
                            console.log("Session " + request.session.id + " has confirmed their email");

                            // return success
                            this.processResult(request, response, "Email successfully confirmed.", json.id);
                        }
                    }.bind(this));
                } else {

                    // new password and password confirmation do not match
                    this.processError(request, response, -32000, "Email confirmation token has expired.", json.id);
                }

            } else {

                // validation not passed, return with error and validation summary
                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                return;
            }
        }.bind(this));
    };

    this.processIsInRole = function(request, response, json) {

        // change the authenticated user
        var isInRole = false;

        if (request.session.data.user != "guest" && json.params !== undefined && json.params !== null) {
            if (json.params.name !== undefined) {
                var roles = request.session.data.user[this.settings.authentication.rolesField !== undefined ? this.settings.authentication.rolesField : "roles"];
                if (roles !== undefined) {
                    for (var i = 0; i < roles.length; i++) {
                        if (roles[i] == json.params.name) {
                            isInRole = true;
                            break;
                        }
                    }
                }
            }
        }

        // return result
        this.processResult(request, response, isInRole, json.id);
        return;
    };

    this.processIsAuthenticated = function(request, response, json) {

        // change the authenticated user
        var isAuthenticated = false;

        if (request.session.data.user !== "guest" && request.session.data.user !== "Guest") {
            isAuthenticated = true;
        }

        // return result
        this.processResult(request, response, isAuthenticated, json.id);
        return;
    };

    this.processRpc = function(request, response, json, collection) {
        try {
            var isValid = true;
            var command;
            var validationSummary;
            var method = json.method;

            // mongodb modifiers
            var modifiers = ["$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];

            if (method instanceof Array) {

                var command = "this.db." + collection;
                var index = 0;

                var execute = function(isValid, validationSummary) {
                    if (isValid) {
                        var dbResult = function(error, result) {

                            // emit executeEnd event
                            this.emit(collection + "_" + method + "_" + action + "_executeEnd", {
                                "currentTarget": this,
                                "params": json.params,
                                "error": error,
                                "result": result,
                                "request": request
                            });

                            if (error) {

                                // collection not provided, create procedure not found response
                                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                                return;
                            } else {

                                // set action to default then check for action in method
                                var action = "default";
                                if (json.method[0].indexOf("/") > -1) {
                                    action = json.method[0].substring(json.method[0].indexOf("/") + 1);
                                }

                                // filter out return values
                                result = filters.filter(this.settings, collection, method[0], action, result, "out");

                                // return result
                                this.processResult(request, response, result, json.id);
                                return;
                            }
                        }.bind(this);

                        // write command to log
                        console.log(request.session.id + ": " + command);

                        // emit executeStart event
                        this.emit(collection + "_" + method + "_" + action + "_executeStart", {
                            "currentTarget": this,
                            "request": request
                        });

                        // execute command
                        eval(command);

                    } else {

                        // validation not passed, return with error and validation summary
                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                        return;
                    }
                }.bind(this);

                var processMethod = function() {

                    // set action to default then check for action in method
                    var action = "default";
                    if (method[index].indexOf("/") > -1) {
                        action = method[index].substring(method[index].indexOf("/") + 1);
                        method[index] = method[index].substring(0, method[index].indexOf("/"));
                    }

                    // update params with params stored in settings
                    json.params[index] = params.get(this, collection, method[index], action, json.params[index]);

                    // check roles
                    roles.check(this, collection, method[index], action, request.session.data.user, json.params[index], function(allowed) {
                        if (allowed) {

                            if (method[index] !== "save" && method[index] !== "findOne" && method[index] !== "update" && method[index] !== "findAndModify" && method[index] !== "group" && method[index] !== "mapReduce") {

                                // validate
                                validators.validate(this, request, collection, method[index], action, json, json.params[index], function(validationSummary) {

                                    // emit validate event
                                    this.emit(collection + "_" + method[index] + "_" + action + "_validate", {
                                        "currentTarget": this,
                                        "request": request,
                                        "params": json.params[index]
                                    });

                                    if (validationSummary === true) {

                                        // filter the params
                                        json.params[index] = filters.filter(this.settings, collection, method[index], action, json.params[index], "in");

                                        // emit filtered event
                                        this.emit(collection + "_" + method[index] + "_" + action + "_filter", {
                                            "direction": "in",
                                            "currentTarget": this,
                                            "request": request,
                                            "params": json.params[index]
                                        });

                                        var tempId;
                                        if (json.params[index] !== undefined) {
                                            if (json.params[index]._id !== undefined) {
                                                tempId = json.params[index]._id;
                                                json.params[index]._id = "###tempId###";
                                            }
                                        }

                                        // hash the password
                                        if (collection == this.settings.authentication.collection) {
                                            if (json.params[index] !== undefined) {
                                                var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                                                if (json.params[index][passwordField] !== undefined) {
                                                    json.params[index][passwordField] = passwordHash.generate(json.params[index][passwordField]);
                                                }
                                            }
                                        }

                                        if (tempId !== undefined) {
                                            if (tempId instanceof Object) {

                                                var keys = Object.keys(tempId);
                                                if (keys.length > 0) {
                                                    if (["$all", "$in", "$nin"].indexOf(keys[0]) > -1) {
                                                        for (var i = 0; i < tempId[keys[0]].length; i++) {

                                                            if (tempId[keys[0]][i].length != 24) {
                                                                this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                                return;
                                                            }

                                                            tempId[keys[0]][i] = "this.db.ObjectId(\"" + tempId[keys[0]][i] + "\")";
                                                        }

                                                        tempId = "{\"" + keys[0] + "\":[" + tempId[keys[0]].join() + "]}";
                                                    } else {

                                                        if (tempId.length != 24) {
                                                            this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                            return;
                                                        }

                                                        tempId = "this.db.ObjectId(\"" + tempId + "\")";
                                                    }
                                                } else {

                                                    if (tempId.length != 24) {
                                                        this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                        return;
                                                    }

                                                    tempId = "this.db.ObjectId(\"" + tempId + "\")";
                                                }
                                            } else {

                                                if (tempId.length != 24) {
                                                    this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                    return;
                                                }

                                                tempId = "this.db.ObjectId(\"" + tempId + "\")";
                                            }

                                            // append the command
                                            if (index === method.length - 1) {
                                                command += "." + method[index] + "(" + JSON.stringify(json.params[index]).replace("\"###tempId###\"", tempId) + ", dbResult)";
                                            } else {
                                                command += "." + method[index] + "(" + JSON.stringify(json.params[index]).replace("\"###tempId###\"", tempId) + ")";
                                            }
                                        } else {

                                            // append the command
                                            if (index === method.length - 1) {
                                                command += "." + method[index] + "(" + JSON.stringify(json.params[index]) + ", dbResult)";
                                            } else {
                                                command += "." + method[index] + "(" + JSON.stringify(json.params[index]) + ")";
                                            }
                                        }

                                    } else {

                                        isValid = false;
                                    }

                                    if (isValid) {
                                        if (index === method.length - 1) {

                                            // execute the response
                                            execute(isValid, validationSummary);
                                        } else {

                                            // increase the index and process the net method
                                            index++;
                                            processMethod();
                                        }
                                    } else {

                                        // validation not passed, return with error and validation summary
                                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                                        return;
                                    }

                                }.bind(this));
                            } else {

                                // method not allowed, return with error and validation summary
                                this.processError(request, response, -32601, "Procedure not found.", json.id);
                                return;
                            }

                        } else {

                            // method not allowed, return with error and validation summary
                            this.processError(request, response, -32601, "Procedure not found.", json.id);
                            return;
                        }
                    }.bind(this));
                }.bind(this);
                processMethod();

            } else {

                // set action to default then check for action in method
                var action = "default";
                if (method.indexOf("/") > -1) {
                    action = method.substring(method.indexOf("/") + 1);
                    method = method.substring(0, method.indexOf("/"));
                }

                // update params with params stored in settings
                json.params = params.get(this, collection, method, action, json.params);

                // check roles
                roles.check(this, collection, method, action, request.session.data.user, json.params, function(allowed) {
                    if (allowed) {
                        var execute = function(isValid, validationSummary) {
                            if (isValid) {
                                var dbResult = function(error, result) {

                                    // emit executeEnd event
                                    this.emit(collection + "_" + method + "_" + action + "_executeEnd", {
                                        "currentTarget": this,
                                        "params": json.params,
                                        "error": error,
                                        "result": result,
                                        "request": request
                                    });

                                    if (error) {

                                        // collection not provided, create procedure not found response
                                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                                        return;
                                    } else {

                                        var sendResponse = true;

                                        // save and clear uploads
                                        if (result !== undefined) {

                                            // save uploads and update
                                            if (method == "save" && this.hasUploads(collection, "new", request.session.data.uploads)) {

                                                // create update object
                                                var uploads = this.getUploads(collection, "new", request.session.data.uploads);
                                                if (uploads !== undefined) {

                                                    // copy keys to update object
                                                    var keys = Object.keys(uploads);
                                                    var update = {};
                                                    for (var i = 0; i < keys.length; i++) {
                                                        update[keys[i]] = "";
                                                    }

                                                    // hold off sending results
                                                    sendResult = false;

                                                    // save uploads
                                                    var update = this.saveUploads(collection, result._id, request.session.data.uploads, request, update, true);

                                                    // clear uploads
                                                    request.session.data.uploads = this.clearUploads(collection, "new", request.session.data.uploads);

                                                    // create command
                                                    var commandUpdate = "this.db." + collection + ".update({\"_id\":this.db.ObjectId(\"" + result._id + "\")},{\"$set\":" + JSON.stringify(update) + "}, dbResultUpdate);";
                                                    var dbResultUpdate = function(errorUpdate, resultUpdate) {
                                                        if (errorUpdate) {

                                                            // collection not provided, create procedure not found response
                                                            this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                                                            return;
                                                        } else {
                                                            // update keys
                                                            for (var i = 0; i < keys.length; i++) {
                                                                resultUpdate[keys[i]] = update[keys[i]];
                                                            }

                                                            // filter out return values
                                                            resultUpdate = filters.filter(this.settings, collection, method, action, resultUpdate, "out");

                                                            // return result
                                                            this.processResult(request, response, resultUpdate, json.id);
                                                            return;
                                                        }
                                                    }.bind(this);

                                                    // write command to log
                                                    console.log(request.session.id + ": " + commandUpdate);

                                                    // execute command
                                                    eval(commandUpdate);
                                                }
                                            }

                                            // set owner
                                            if (method === "save") {

                                                // set owner to guest or to user id
                                                var ownerParams = {
                                                    "_created": new Date().getTime() / 1000
                                                };
                                                if (collection == this.settings.authentication.collection) {

                                                    // set owner
                                                    ownerParams._owner = result._id.toString();

                                                    // send confirmation email
                                                    this.sendConfirmEmail(request, response, result, function(errorMail) {
                                                        if (errorMail) {

                                                            // error sending mail
                                                            console.log(errorMail);
                                                            console.log(request.session.id + ": Failed to send email confirmation email to " + result[(!this.settings.authentication.usernameField ? "email" : this.settings.authentication.usernameField)]);
                                                        } else {

                                                            // log mail sent
                                                            console.log(request.session.id + ": Sent email confirmation email to " + result[(!this.settings.authentication.usernameField ? "email" : this.settings.authentication.usernameField)]);
                                                        }
                                                    }.bind(this));

                                                } else {
                                                    if (request.session.data.user === "guest" || request.session.data.user === "Guest") {
                                                        ownerParams._owner = "guest";
                                                    } else {
                                                        ownerParams._owner = request.session.data.user._id.toString();
                                                    }
                                                }

                                                this.db[collection].update({
                                                    "_id": result._id
                                                }, {
                                                    "$set": ownerParams
                                                }, function(errorOwner, resultOwner) {}.bind(this));
                                            }
                                        }

                                        if (sendResponse) {

                                            // filter out return values
                                            result = filters.filter(this.settings, collection, method, action, result, "out");

                                            // return result
                                            this.processResult(request, response, result, json.id);
                                            return;
                                        }
                                    }
                                }.bind(this);

                                // write command to log
                                console.log(request.session.id + ": " + command);

                                // emit executeStart event
                                this.emit(collection + "_" + method + "_" + action + "_executeStart", {
                                    "currentTarget": this,
                                    "request": request
                                });

                                // execute command
                                eval(command);

                            } else {

                                // validation not passed, return with error and validation summary
                                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                                return;
                            }
                        }.bind(this);

                        if (method === "update") {

                            var validationComplete = function(validationSummaryFind, validationSummaryUpdate) {
                                if (validationSummaryFind === true && validationSummaryUpdate === true) {

                                    var params = "";
                                    for (var i = 0; i < json.params.length; i++) {
                                        var tempId;
                                        if (json.params[i] !== undefined) {
                                            if (json.params[i]._id !== undefined) {
                                                tempId = json.params[i]._id;
                                                json.params[i]._id = "###tempId###";

                                                if (tempId.length !== 24) {
                                                    this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                    return;
                                                }
                                            }
                                        }

                                        // hash the password
                                        if (collection == this.settings.authentication.collection) {
                                            if (json.params[i] !== undefined) {
                                                var keys = Object.keys(json.params[1]);
                                                if (keys !== undefined) {
                                                    var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                                                    if (modifiers.indexOf(keys[0]) > -1) {
                                                        if (json.params[i][keys[0]] !== undefined) {
                                                            if (json.params[i][keys[0]][passwordField] !== undefined) {
                                                                json.params[i][keys[0]][passwordField] = passwordHash.generate(json.params[i][keys[0]][passwordField]);
                                                            }
                                                        }
                                                    } else {
                                                        if (json.params[i][passwordField] !== undefined) {
                                                            json.params[i][passwordField] = passwordHash.generate(json.params[i][passwordField]);
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        if (i === 0) {
                                            if (tempId !== undefined && tempId !== "undefined") {

                                                // add the parameters
                                                params += JSON.stringify(json.params[i]);
                                                params = params.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                            } else {

                                                // add the parameters
                                                params += JSON.stringify(json.params[i]);
                                            }
                                        } else {
                                            if (tempId !== undefined && tempId !== "undefined") {

                                                // add the parameters
                                                params += ", " + JSON.stringify(json.params[i]);
                                                params = params.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                            } else {

                                                // add the parameters
                                                params += ", " + JSON.stringify(json.params[i]);
                                            }
                                        }
                                    }

                                    // create the command
                                    command = "this.db." + collection + "." + method + "(" + params + ", dbResult);";

                                } else {

                                    validationSummary = [];

                                    if (validationSummaryFind !== true) {
                                        validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
                                    }

                                    if (validationSummaryUpdate !== true) {
                                        validationSummary = validationSummary.concat(validationSummary, validationSummaryUpdate);
                                    }

                                    isValid = false;
                                }

                                // execute the response
                                execute(isValid, validationSummary);
                            }.bind(this);

                            // validate the query
                            validators.validate(this, request, collection, "find", action, json, json.params[0], function(validationSummaryFind) {

                                // emit validateFind event
                                this.emit(collection + "_" + method + "_" + action + "_validateFind", {
                                    "currentTarget": this,
                                    "params": json.params[0],
                                    "request": request
                                });

                                // filter the query
                                json.params[0] = filters.filter(this.settings, collection, "find", action, json.params[0], "in");

                                // emit filterFind event
                                this.emit(collection + "_" + method + "_" + action + "_filterFind", {
                                    "direction": "in",
                                    "currentTarget": this,
                                    "params": json.params[0],
                                    "request": request
                                });

                                // filter the update and handle uploads
                                var keys = Object.keys(json.params[1]);
                                if (keys !== undefined) {
                                    if (modifiers.indexOf(keys[0]) > -1) {

                                        // validate the update
                                        validators.validate(this, request, collection, "update", action, json, json.params[1][keys[0]], function(validationSummaryUpdate) {

                                            // emit validate event
                                            this.emit(collection + "_" + method + "_" + action + "_validate", {
                                                "currentTarget": this,
                                                "request": request,
                                                "params": json.params[1][keys[0]]
                                            });

                                            if (validationSummaryUpdate === true) {

                                                // filter the update
                                                json.params[1][keys[0]] = filters.filter(this.settings, collection, "update", action, json.params[1][keys[0]], "in");

                                                // emit filter event
                                                this.emit(collection + "_" + method + "_" + action + "_filter", {
                                                    "direction": "in",
                                                    "currentTarget": this,
                                                    "request": request,
                                                    "params": json.params[1][keys[0]]
                                                });

                                                // save and clear uploads
                                                if (json.params[0]._id !== undefined) {

                                                    var id;
                                                    if (json.params[0]._id.indexOf("ObjectId") > -1) {
                                                        id = eval("this.db." + json.params[0]._id).toString();
                                                    } else {
                                                        id = json.params[0]._id;
                                                    }

                                                    // save uploads
                                                    json.params[1][keys[0]] = this.saveUploads(collection, id, request.session.data.uploads, request, json.params[1][keys[0]]);

                                                    // clear uploads
                                                    request.session.data.uploads = this.clearUploads(collection, id, request.session.data.uploads);
                                                }
                                            }

                                            validationComplete(validationSummaryFind, validationSummaryUpdate);
                                        }.bind(this));
                                    } else {
                                        // validate the update
                                        validators.validate(this, request, collection, "update", action, json, json.params[1], function(validationSummaryUpdate) {

                                            // emit validate event
                                            this.emit(collection + "_" + method + "_" + action + "_validate", {
                                                "currentTarget": this,
                                                "request": request,
                                                "params": json.params[1]
                                            });

                                            if (validationSummaryUpdate === true) {

                                                // filter the update
                                                json.params[1] = filters.filter(this.settings, collection, "update", action, json.params[1], "in");

                                                // emit filtered event
                                                this.emit(collection + "_" + method + "_" + action + "_filter", {
                                                    "direction": "in",
                                                    "currentTarget": this,
                                                    "request": request,
                                                    "params": json.params[1]
                                                });

                                                // save and clear uploads
                                                if (json.params[0]._id !== undefined) {

                                                    var id;
                                                    if (json.params[0]._id.indexOf("ObjectId") > -1) {
                                                        id = eval("this.db." + json.params[0]._id).toString();
                                                    } else {
                                                        id = json.params[0]._id;
                                                    }

                                                    // save uploads
                                                    json.params[1] = this.saveUploads(collection, id, request.session.data.uploads, request, json.params[1]);

                                                    // clear uploads
                                                    request.session.data.uploads = this.clearUploads(collection, id, request.session.data.uploads);
                                                }
                                            }

                                            validationComplete(validationSummaryFind, validationSummaryUpdate);
                                        }.bind(this));
                                    }
                                }
                            }.bind(this));

                        } else if (method === "findAndModify") {

                            var validationComplete = function(validationSummaryFind, validationSummaryFindAndModify) {
                                if (validationSummaryFind === true && validationSummaryFindAndModify === true) {
                                    var tempId;
                                    if (json.params !== undefined) {
                                        if (json.params._id !== undefined) {
                                            tempId = json.params._id;
                                            json.params._id = "###tempId###";

                                            if (tempId.length != 24) {
                                                this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                return;
                                            }
                                        }
                                    }

                                    // hash the password
                                    if (collection === this.settings.authentication.collection) {
                                        if (keys !== undefined) {
                                            var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                                            if (modifiers.indexOf(keys[0]) > -1) {
                                                if (json.params.update[keys[0]] !== undefined) {
                                                    if (json.params.update[keys[0]][passwordField] !== undefined) {
                                                        json.params.update[keys[0]][passwordField] = passwordHash.generate(json.params.update[keys[0]][passwordField]);
                                                    }
                                                }
                                            } else {
                                                if (json.params.update !== undefined) {
                                                    if (json.params.update[passwordField] !== undefined) {
                                                        json.params.update[passwordField] = passwordHash.generate(json.params.update[passwordField]);
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    if (tempId !== undefined) {

                                        // create the command
                                        command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                        command = command.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                    } else {

                                        // create the command
                                        command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                    }
                                } else {

                                    validationSummary = [];

                                    if (validationSummaryFind !== true) {
                                        validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
                                    }

                                    if (validationSummaryFindAndModify !== true) {
                                        validationSummary = validationSummary.concat(validationSummary, validationSummaryFindAndModify);
                                    }

                                    isValid = false;
                                }

                                // execute the response
                                execute(isValid, validationSummary);
                            }.bind(this);

                            // validate the query
                            validators.validate(this, request, collection, "find", action, json, json.params.query, function(validationSummaryFind) {

                                // emit validateFind event
                                this.emit(collection + "_" + method + "_" + action + "_validateFind", {
                                    "currentTarget": this,
                                    "request": request,
                                    "params": json.params.query
                                });

                                // filter the query
                                json.params.query = filters.filter(this.settings, collection, "find", action, json.params.query, "in");

                                // emit filterFind event
                                this.emit(collection + "_" + method + "_" + action + "_filterFind", {
                                    "direction": "in",
                                    "currentTarget": this,
                                    "request": request,
                                    "params": json.params.query
                                });

                                // filter the update and handle uploads
                                var keys = Object.keys(json.params.update);
                                if (keys !== undefined) {

                                    if (modifiers.indexOf(keys[0]) > -1) {

                                        // validate the update
                                        validators.validate(this, request, collection, "findAndModify", action, json, json.params.update[keys[0]], function(validationSummaryFindAndModify) {

                                            // emit validate event
                                            this.emit(collection + "_" + method + "_" + action + "_validate", {
                                                "currentTarget": this,
                                                "request": request,
                                                "params": json.params.update[keys[0]]
                                            });

                                            if (validationSummaryFindAndModify === true) {

                                                // filter the update
                                                json.params.update[keys[0]] = filters.filter(this.settings, collection, "findAndModify", action, json.params.update[keys[0]], "in");

                                                // emit filter event
                                                this.emit(collection + "_" + method + "_" + action + "_filter", {
                                                    "direction": "in",
                                                    "currentTarget": this,
                                                    "request": request,
                                                    "params": json.params.update[keys[0]]
                                                });

                                                // save and clear uploads
                                                if (json.params.query._id !== undefined) {

                                                    var id;
                                                    if (json.params.query._id.indexOf("ObjectId") > -1) {
                                                        id = eval("this.db." + jjson.params.query._id);
                                                    } else {
                                                        id = json.params.query._id;
                                                    }

                                                    // save uploads
                                                    json.params.update[keys[0]] = this.saveUploads(collection, id, request.session.data.uploads, json.update[keys[0]]);

                                                    // clear uploads
                                                    request.session.data.uploads = this.clearUploads(collection, id, request.session.data.uploads);
                                                }
                                            }

                                            validationComplete(validationSummaryFind, validationSummaryFindAndModify);

                                        }.bind(this));
                                    } else {

                                        // validate the update
                                        validators.validate(this, request, collection, "findAndModify", action, json, json.params.update, function(validationSummaryFindAndModify) {

                                            // emit validate event
                                            this.emit(collection + "_" + method + "_" + action + "_validate", {
                                                "currentTarget": this,
                                                "request": request,
                                                "params": json.params.update
                                            });

                                            if (validationSummaryFindAndModify === true) {

                                                // filter the update
                                                json.params.update = filters.filter(this.settings, collection, "findAndModify", action, json.params.update, "in");

                                                // emit filter event
                                                this.emit(collection + "_" + method + "_" + action + "_filter", {
                                                    "direction": "in",
                                                    "currentTarget": this,
                                                    "request": request,
                                                    "params": json.params.update
                                                });

                                                // save and clear uploads
                                                if (json.params.query._id !== undefined) {

                                                    var id;
                                                    if (json.params.query._id.indexOf("ObjectId") > -1) {
                                                        id = eval("this.db." + jjson.params.query._id);
                                                    } else {
                                                        id = json.params.query._id;
                                                    }

                                                    // save uploads
                                                    json.params.update = this.saveUploads(collection, id, request.session.data.uploads, request, json.update);

                                                    // clear uploads
                                                    request.session.data.uploads = this.clearUploads(collection, id, request.session.data.uploads);
                                                }
                                            }

                                            validationComplete(validationSummaryFind, validationSummaryFindAndModify);

                                        }.bind(this));
                                    }
                                }
                            }.bind(this));

                        } else if (method === "group") {

                            var validationComplete = function(validationSummary) {
                                if (validationSummary === true) {
                                    var tempId;
                                    if (json.params !== undefined) {
                                        if (json.params.cond !== undefined) {
                                            if (json.params.cond._id !== undefined) {
                                                tempId = json.params.cond._id;
                                                json.params.cond._id = "###tempId###";

                                                if (tempId.length !== 24) {
                                                    this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                    return;
                                                }
                                            }
                                        }
                                    }

                                    // hash the password
                                    if (collection == this.settings.authentication.collection) {
                                        var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                                        if (json.params.cond !== undefined) {
                                            if (json.params.cond[passwordField] !== undefined) {
                                                json.params.cond[passwordField] = passwordHash.generate(json.params.cond[passwordField]);
                                            }
                                        }
                                    }

                                    if (tempId !== undefined) {

                                        // create the command
                                        command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                        command = command.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                    } else {

                                        // create the command
                                        command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                    }
                                } else {
                                    isValid = false;
                                }

                                // execute the response
                                execute(isValid, validationSummary);
                            }.bind(this);

                            // validate the query
                            validators.validate(this, request, collection, "find", action, json, json.params.query, function(validationCondition) {

                                // emit validateFind event
                                this.emit(collection + "_" + method + "_" + action + "_validate", {
                                    "currentTarget": this,
                                    "request": request,
                                    "params": json.params.cond
                                });

                                // filter the query
                                json.params.cond = filters.filter(this.settings, collection, "group", action, json.params.cond, "in");

                                // emit filterFind event
                                this.emit(collection + "_" + method + "_" + action + "_filter", {
                                    "direction": "in",
                                    "currentTarget": this,
                                    "request": request,
                                    "params": json.params.cond
                                });

                                // finish validating, filtering, then execute
                                validationComplete(validationCondition);

                            }.bind(this));

                        } else if (method === "mapReduce") {

                            var validationComplete = function(validationSummary) {
                                if (validationSummary === true) {
                                    var tempId;
                                    if (json.params !== undefined) {
                                        if (json.params.query !== undefined) {
                                            if (json.params.query._id !== undefined) {
                                                tempId = json.params.query._id;
                                                json.params.query._id = "###tempId###";

                                                if (tempId.length != 24) {
                                                    this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                    return;
                                                }
                                            }
                                        }
                                    }

                                    // hash the password
                                    if (collection == this.settings.authentication.collection) {
                                        var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                                        if (json.params.query !== undefined) {
                                            if (json.params.query[passwordField] !== undefined) {
                                                json.params.query[passwordField] = passwordHash.generate(json.params.query[passwordField]);
                                            }
                                        }
                                    }

                                    if (tempId !== undefined) {

                                        // create the command
                                        command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                        command = command.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                    } else {

                                        // create the command
                                        command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                    }
                                } else {
                                    isValid = false;
                                }

                                // execute the response
                                execute(isValid, validationSummary);
                            }.bind(this);

                            // validate the query
                            validators.validate(this, request, collection, "mapReduce", action, json, json.params.query, function(validationCondition) {

                                // emit validateFind event
                                this.emit(collection + "_" + method + "_" + action + "_validate", {
                                    "currentTarget": this,
                                    "request": request,
                                    "params": json.params.query
                                });

                                // filter the query
                                json.params.query = filters.filter(this.settings, collection, "mapReduce", action, json.params.query, "in");

                                // emit filterFind event
                                this.emit(collection + "_" + method + "_" + action + "_filter", {
                                    "direction": "in",
                                    "currentTarget": this,
                                    "request": request,
                                    "params": json.params.query
                                });

                                // finish validating, filtering, then execute
                                validationComplete(validationCondition);

                            }.bind(this));

                        } else {

                            // validate
                            validators.validate(this, request, collection, method, action, json, json.params, function(validationSummary) {

                                // emit validate event
                                this.emit(collection + "_" + method + "_" + action + "_validate", {
                                    "currentTarget": this,
                                    "request": request,
                                    "params": json.params
                                });

                                if (validationSummary === true) {

                                    // filter the params
                                    json.params = filters.filter(this.settings, collection, method, action, json.params, "in");

                                    // emit filtered event
                                    this.emit(collection + "_" + method + "_" + action + "_filter", {
                                        "direction": "in",
                                        "currentTarget": this,
                                        "request": request,
                                        "params": json.params
                                    });

                                    var tempId;
                                    if (json.params !== undefined) {
                                        if (json.params._id !== undefined) {
                                            tempId = json.params._id;
                                            json.params._id = "###tempId###";
                                        }
                                    }

                                    // hash the password
                                    if (collection === this.settings.authentication.collection) {
                                        if (json.params !== undefined) {
                                            var passwordField = (!this.settings.authentication.passwordField ? "password" : this.settings.authentication.passwordField);
                                            if (json.params[passwordField] !== undefined) {
                                                json.params[passwordField] = passwordHash.generate(json.params[passwordField]);
                                            }
                                        }
                                    }

                                    if (tempId !== undefined) {
                                        if (tempId instanceof Object) {
                                            var keys = Object.keys(tempId);
                                            if (keys.length > 0) {
                                                if (["$all", "$in", "$nin"].indexOf(keys[0]) > -1) {
                                                    for (var i = 0; i < tempId[keys[0]].length; i++) {

                                                        if (tempId[keys[0]][i].length != 24) {
                                                            this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                            return;
                                                        }

                                                        tempId[keys[0]][i] = "this.db.ObjectId(\"" + tempId[keys[0]][i] + "\")";
                                                    }

                                                    // create the command
                                                    command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                                    command = command.replace("\"###tempId###\"", "{\"" + keys[0] + "\":[" + tempId[keys[0]].join() + "]}");

                                                } else {

                                                    if (tempId.length != 24) {
                                                        this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                        return;
                                                    }

                                                    // create the command
                                                    command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                                    command = command.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                                }
                                            } else {

                                                if (tempId.length != 24) {
                                                    this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                    return;
                                                }

                                                // create the command
                                                command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                                command = command.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                            }
                                        } else {

                                            if (tempId.length != 24) {
                                                this.processError(request, response, -32603, "Invalid ID provided", json.id);
                                                return;
                                            }

                                            // create the command
                                            command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                            command = command.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
                                        }
                                    } else {

                                        // create the command
                                        command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                                    }

                                } else {

                                    isValid = false;
                                }

                                // execute the response
                                execute(isValid, validationSummary);
                            }.bind(this));
                        }

                    } else {

                        // method not allowed, return with error and validation summary
                        this.processError(request, response, -32601, "Procedure not found.", json.id);
                        return;
                    }
                }.bind(this));
            }

        } catch (error) {

            // throw error to console
            console.log(error);

            // Internal error occurred, create internal error response
            this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

            throw error;
        }
    };

    this.processPost = function(request, response) {

        if (request.headers["content-type"].indexOf("multipart/form-data") > -1) {
            var form = new formidable.IncomingForm();
            form.parse(request, function(error, fields, files) {
                try {
                    if (error) {
                        // show error in log
                        console.error(error.message);

                        // respond to request with error
                        this.processUpload(request, response, fields.collection, field, "error");
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
                        // check roles
                        roles.check(this, fields.collection, fields.method, fields.action, request.session.data.user, null, function(allowed) {
                            if (allowed) {

                                // filter the params
                                files = filters.filter(this.settings, fields.collection, fields.method, fields.action, files, "in");

                                // set id to new if not defined    
                                if (fields._id === "" || fields._id === "undefined" || fields._id === undefined) {
                                    fields._id = "new";
                                }

                                // create uploads
                                if (request.session.data["uploads"] === undefined) {
                                    request.session.data["uploads"] = {};
                                }

                                // create collection for uploads
                                if (request.session.data["uploads"][fields.collection] === undefined) {
                                    request.session.data["uploads"][fields.collection] = {};
                                }

                                // create document for uploads
                                if (request.session.data["uploads"][fields.collection][fields._id] === undefined) {
                                    request.session.data["uploads"][fields.collection][fields._id] = {};
                                }

                                keys = Object.keys(files);
                                if (keys.length > 0) {

                                    // loop through files and add them to the session
                                    request.session.data["uploads"][fields.collection][fields._id][keys[0]] = files[keys[0]];
                                    request.session.data["uploads"][fields.collection][fields._id][keys[0]].method = fields.method;
                                    request.session.data["uploads"][fields.collection][fields._id][keys[0]].action = fields.action;

                                    // write to log
                                    console.log(request.session.id + ": uploaded a file (" + files[keys[0]].path + ")");

                                    // temporarily store the file
                                    var file = files[keys[0]];

                                    // get the extension
                                    var extension = file.name.split(".").pop();

                                    // create the final path
                                    var directory = "uploads/" + fields.collection + "/" + fields._id + "/";
                                    var path = directory + encodeURIComponent(request.session.id) + "." + keys[0] + "." + extension;
                                    var root = "./";
                                    if (this.settings.paths !== undefined) {
                                        if (this.settings.paths.uploads !== undefined) {
                                            root = this.settings.paths.uploads;
                                        }
                                    }

                                    // make the directory
                                    libpath.exists(root + directory, function() {
                                        fs.mkdirSync(root + directory, 0755, true);

                                        // rename the file
                                        fs.renameSync(file.path, root + path);

                                        // resize the file
                                        var resize = this.settings.collections[fields.collection][fields.method][fields.action].resize;
                                        if (resize) {

                                            var sizes = resize[keys[0]];
                                            if (sizes) {

                                                // resize images to settings specifications
                                                this.resizeImage(request, response, fields, field, path, sizes, 0);
                                            } else {

                                                // respond and show the final step
                                                this.processUpload(request, response, fields.collection, field, 3, fields._id, fields.origin, path);
                                            }
                                        } else {

                                            // respond and show the final step
                                            this.processUpload(request, response, fields.collection, field, 3, fields._id, fields.origin, path);
                                        }

                                    }.bind(this));


                                    return;
                                }
                            }

                            // respond to request with error
                            this.processUpload(request, response, fields.collection, field, "error");
                            return;

                        }.bind(this));
                        return;

                    } else {

                        // respond to request with error
                        this.processUpload(request, response, fields.collection, field, "error");
                        return;
                    }
                } catch (e) {

                    if (this.settings.isDebug) {

                        // email error
                        this.sendErrorEmail(request, undefined, e, function() {

                            // throw the error if in debug mode
                            throw e;
                        });

                    } else {

                        // throw error to console
                        console.log(e);

                        // respond to request with error
                        this.processUpload(request, response, fields.collection, field, "error");

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

                this.processMethod(request, response, data);

            }.bind(this));
        }
    };

    this.processMethod = function(request, response, data) {
        var json;
        try {

            // parse data to json
            json = JSON.parse(data);

        } catch (error) {

            // Internal error occurred, create internal error response
            this.processError(request, response, -32700, "Parse error.", undefined);
            return;
        }

        try {
            var collection = url.parse(request.url, true).pathname.replace("/", "");
            if (collection !== undefined) {
                if (collection == this.settings.httpAuthCollection && json.method == "login") {

                    // process login request
                    this.processLogin(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "logout") {

                    // process logout request
                    this.processLogout(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "switchUser") {

                    // process switch user request
                    this.processSwitchUser(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "getAuthenticatedUser") {

                    // process switch user request
                    this.processGetAuthenticatedUser(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "isAuthenticated") {

                    // process authentication status request
                    this.processIsAuthenticated(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "isInRole") {

                    // process role verficiation request
                    this.processIsInRole(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "changePassword") {

                    // process change passwor request
                    this.processChangePassword(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "passwordResetRequest") {

                    // process password reset request request
                    this.processPasswordResetRequest(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "passwordReset") {

                    // process password reset request
                    this.processPasswordReset(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "confirmEmail") {

                    // process confirm email
                    this.processConfirmEmail(request, response, json);

                } else if (collection == this.settings.httpAuthCollection && json.method == "confirmEmailRequest") {

                    // process confirm email request
                    this.processConfirmEmailRequest(request, response, json);

                } else if (json.method == "clearUpload") {

                    // process the clear uploads request
                    this.processClearUpload(request, response, json, collection);

                } else if (collection === "_settings" && this.settings.isDebug && json.method === "get") {

                    // response with settings only if server is in debug mode
                    this.processResult(request, response, this.settings, json.id);

                } else {

                    // process logout request
                    this.processRpc(request, response, json, collection);
                }
            } else {

                // collection not provided, create procedure not found response
                this.processError(request, response, -32601, "Procedure not found.", json.id);
                return;
            }
        } catch (error) {

            if (this.settings.isDebug) {

                // email error
                this.sendErrorEmail(request, data, error, function() {

                    // throw the error if in debug mode
                    throw error;
                });

            } else {

                // throw error to console
                console.log(error);

                // Internal error occurred, create internal error response
                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);

                // email error
                this.sendErrorEmail(request, data, error);
                return;
            }
        }
    };

    this.processUpload = function(request, response, collection, field, step, _id, origin, temp) {

        // respond to request with error
        response.writeHead(302, {
            "Location": "/upload.html?collection=" + collection + "&field=" + field + "&step=" + step + "&_id=" + _id + "&origin=" + origin + "&temp=" + encodeURIComponent(temp)
        });
        response.end();
        return;
    };

    this.processClearUpload = function(request, response, json, collection) {
        if (request.session.data.uploads !== undefined && json.params._id !== undefined && json.params.field !== undefined) {
            if (request.session.data.uploads[collection] !== undefined) {
                if (request.session.data.uploads[collection][json.params._id] !== undefined) {
                    if (request.session.data.uploads[collection][json.params._id][json.params.field] !== undefined) {

                        // write to log
                        console.log(request.session.id + ": removed an uploaded file.");

                        // remove the upload
                        delete request.session.data.uploads[collection][json.params._id][json.params.field];

                        // return result
                        this.processResult(request, response, true, json.id);

                    } else {

                        // Internal error occurred, create internal error response
                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                    }
                } else {

                    // Internal error occurred, create internal error response
                    this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                }
            } else {

                // Internal error occurred, create internal error response
                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
            }
        } else {

            // Internal error occurred, create internal error response
            this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
        }
    };

    this.processGet = function(request, response) {

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
                libpath.exists(filename, function(exists) {
                    if (!exists) {
                        libpath.exists("./lib/" + filename + ".js", function(requireExists) {
                            if (!requireExists) {
                                if (this.settings.collections[uri.replace("/", "")] || uri.replace("/", "") === "_settings") {
                                    var query = url.parse(request.url, true).query;
                                    this.processMethod(request, response, query.data);
                                } else {
                                    response.writeHead(404, {
                                        "Content-Type": "text/plain"
                                    });
                                    response.write("404 Not Found\n");
                                    response.end();
                                }
                            }

                            try {
                                var file = require("./lib/" + filename + ".js");
                                if (file.render !== undefined) {
                                    file.render(this, request, response);
                                    return;
                                } else {
                                    response.writeHead(404, {
                                        "Content-Type": "text/plain"
                                    });
                                    response.write("404 Not Found\n");
                                    response.end();
                                    return;
                                }
                            } catch (error) {
                                response.writeHead(500, {
                                    "Content-Type": "text/plain"
                                });
                                response.write("500 Internal Server Error\n");
                                response.end();
                            }
                        }.bind(this));
                        return;
                    }

                    if (fs.statSync(filename).isDirectory()) {
                        filename += "/index.html";
                    }

                    fs.readFile(filename, "binary", function(error, file) {
                        if (error) {
                            response.writeHead(500, {
                                "Content-Type": "text/plain"
                            });
                            response.write(error + "\n");
                            response.end();
                            return;
                        } else {
                            var type = mime.lookup(filename);

                            var headers = {};
                            if (request.connection.encrypted) {
                                headers = this.settings.https.static.headers;
                            } else {
                                headers = this.settings.http.static.headers;
                            }
                            headers["Content-Type"] = type;

                            response.writeHead(200, headers);
                            response.write(file, "binary");
                            response.end();
                        }
                    }.bind(this));
                }.bind(this));
            }
        } else {
            response.writeHead(404, {
                "Content-Type": "text/plain"
            });
            response.write("404 Not Found\n");
            response.end();
        }
    };

    this.processResult = function(request, response, result, id) {

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

    this.processError = function(request, response, errorCode, errorMessage, id, validationSummary) {

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

    this.confirmEmailEnabled = function() {

        var enabled = false;
        if (this.settings.mail) {
            if (this.settings.mail.messages && this.settings.authentication.confirmEmailToken) {
                if (this.settings.mail.messages.confirmEmail) {
                    if (this.settings.mail.messages.confirmEmail.enabled) {
                        enabled = true;
                    }
                }
            }
        }
        return true;
    };

    this.sendConfirmEmail = function(request, response, user, callback) {
        if (this.confirmEmailEnabled()) {
            if (user[(!this.settings.authentication.confirmEmailField ? "isConfirmed" : this.settings.authentication.confirmEmailField)] !== true) {

                // create and encrypt the token
                var expiration = new Date();
                expiration.setMinutes(expiration.getMinutes() + this.settings.authentication.confirmEmailTimeout);

                var algorithm = this.settings.authentication.confirmEmailToken.algorithm;
                var password = this.settings.authentication.confirmEmailToken.password;
                var cipher = crypto.createCipher(algorithm, password);

                var token = {};
                token._id = user._id;
                token.expiration = expiration;
                token = cipher.update(JSON.stringify(token), "utf8", "hex");
                token += cipher.final("hex");

                // format the email message - textevents.js
                var mailMessage = JSON.parse(JSON.stringify(this.settings.mail.messages.confirmEmail));
                mailMessage.text = mailMessage.text.replace(/{firstName}/g, (user.firstName || ""));
                mailMessage.text = mailMessage.text.replace(/{lastName}/g, (user.lastName || ""));
                mailMessage.text = mailMessage.text.replace(/{token}/g, encodeURIComponent(token));
                mailMessage.to = (user.firstName || "") + " " + (user.lastName || "") + " <" + user[(!this.settings.authentication.usernameField ? "email" : this.settings.authentication.usernameField)] + ">";

                // format the email message - html
                if (mailMessage.attachment) {
                    for (var a = 0; a < mailMessage.attachment.length; a++) {
                        if (mailMessage.attachment[a].alternative === true) {
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{firstName}/g, (user.firstName || ""));
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{lastName}/g, (user.lastName || ""));
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, encodeURIComponent(token));
                            mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{token}/g, "");
                        }
                    }
                }

                // send the email
                this.mail.send(mailMessage, callback);
            } else {

                // email already confirmed
                callback("Email already confirmed.");
            }
        } else {

            // reset not enabled
            callback("Email confirmation not enabled.");
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

    this.resizeImage = function(request, response, fields, field, path, sizes, index) {

        if (index === sizes.length) {

            // respond and show the final step
            this.processUpload(request, response, fields.collection, field, 3, fields._id, fields.origin, path);
        } else {

            var options = sizes[index];
            var directory = "uploads/" + fields.collection + "/" + fields._id + "/";
            var pathDestination = directory + encodeURIComponent(request.session.id) + "." + field + "." + options.width + "x" + options.height + "." + (options.format || ".jpg");
            var root = "./";
            options.srcPath = root + path;
            options.dstPath = root + pathDestination;

            imagemagick.identify(["-format", "%wx%h", options.srcPath], function(err, output) {


                var width = 0;
                var height = 0;

                try {
                    if (output) {
                        var dimensions = output.trim().split("x");
                        width = dimensions[0];
                        height = dimensions[1];
                    }
                } catch (error) {
                    width = 0;
                    height = 0;
                }

                var resize = true;
                if (options.enlarge === false) {
                    if (width !== 0 && height !== 0) {
                        if (width < options.width && height < options.height) {
                            resize = false;
                        }
                    } else {
                        resize = false;
                    }
                }

                if (resize) {
                    imagemagick.resize(options, function(error, stdout, stderr) {
                        if (error) {

                            if (this.settings.isDebug) {

                                // email error
                                this.sendErrorEmail(request, undefined, e, function() {

                                    // throw the error if in debug mode
                                    throw e;
                                });

                            } else {

                                // throw error to console
                                console.log(e);

                                // respond to request with error
                                this.processUpload(request, response, fields.collection, field, "error");

                                // email error
                                this.sendErrorEmail(request, data, e);
                                return;
                            }
                        } else {
                            this.resizeImage(request, response, fields, field, path, sizes, index + 1);
                        }
                    }.bind(this));
                } else {
                    this.resizeImage(request, response, fields, field, path, sizes, index + 1);
                }
            }.bind(this));
        }
    };

    this.getUploads = function(collection, _id, uploads) {
        var files;
        if (uploads !== undefined) {
            if (uploads[collection] !== undefined) {
                if (uploads[collection][_id] !== undefined) {
                    files = uploads[collection][_id];
                }
            }
        }
        return files;
    };

    this.hasUploads = function(collection, _id, uploads) {
        var hasUploads = false;
        if (uploads !== undefined) {
            if (uploads[collection] !== undefined) {
                if (uploads[collection][_id] !== undefined) {
                    hasUploads = true;
                }
            }
        }
        return hasUploads;
    };

    this.saveUploads = function(collection, _id, uploads, request, params, isNew) {
        if (uploads !== undefined) {
            if (uploads[collection] !== undefined) {

                // get document reference
                var document = {};
                if (isNew) {
                    document = uploads[collection]["new"];
                } else {
                    document = uploads[collection][_id];
                }

                // save files in document
                if (document !== undefined) {
                    var keys = Object.keys(document);
                    for (var i = 0; i < keys.length; i++) {

                        var file = document[keys[i]];
                        if (file !== undefined) {

                            // get the extension
                            var extension = file.name.split(".").pop();

                            // create the final path
                            var directory = "uploads/" + collection + "/" + _id + "/";
                            var path = directory + keys[i] + "." + extension;
                            var root = "./";
                            if (this.settings.paths !== undefined) {
                                if (this.settings.paths.uploads !== undefined) {
                                    root = this.settings.paths.uploads;
                                }
                            }

                            // make the directory
                            fs.mkdirSync(root + directory, 0755, true);

                            // rename temp file to final location
                            var tempPath = "";
                            if (isNew) {
                                tempPath = root + "uploads/" + collection + "/new/" + encodeURIComponent(request.session.id) + "." + keys[i] + "." + extension;
                            } else {
                                tempPath = root + "uploads/" + collection + "/" + _id + "/" + encodeURIComponent(request.session.id) + "." + keys[i] + "." + extension;
                            }

                            fs.renameSync(tempPath, this.settings.paths.uploads + path);

                            // move resized images
                            var resize = this.settings.collections[collection][file.method][file.action].resize;
                            if (resize) {

                                var sizes = resize[keys[0]];
                                if (sizes) {

                                    for (var s = 0; s < sizes.length; s++) {

                                        var options = sizes[s];
                                        var tempPathSize = "";
                                        if (isNew) {
                                            tempPathSize = root + "uploads/" + collection + "/new/" + encodeURIComponent(request.session.id) + "." + keys[i] + "." + options.width + "x" + options.height + "." + (options.format || extension);
                                        } else {
                                            tempPathSize = root + "uploads/" + collection + "/" + _id + "/" + encodeURIComponent(request.session.id) + "." + keys[i] + "." + options.width + "x" + options.height + "." + (options.format || extension);
                                        }

                                        var pathSize = directory + keys[i] + "." + options.width + "x" + options.height + "." + (options.format || extension);

                                        // delete previous image
                                        if (libpath.existsSync(this.settings.paths.uploads + pathSize)) {
                                            fs.unlinkSync(this.settings.paths.uploads + pathSize);
                                        }

                                        // move resized image if it exists
                                        if (libpath.existsSync(tempPathSize)) {
                                            fs.renameSync(tempPathSize, this.settings.paths.uploads + pathSize);
                                        }
                                    }
                                }
                            }

                            // update the field
                            params[keys[i]] = path;
                        }
                    }
                }
            }
        }

        return params;
    };

    this.clearUploads = function(collection, _id, uploads) {
        if (uploads !== undefined) {
            if (uploads[collection] !== undefined) {
                if (uploads[collection][_id] !== undefined) {
                    delete uploads[collection][_id];
                }
            }
        }
        return uploads;
    };
};

util.inherits(MongoConductor, events.EventEmitter);

var mongoConductor = new MongoConductor();
mongoConductor.init();
