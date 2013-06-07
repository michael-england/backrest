var crypto = require("crypto");
var passwordHash = require("password-hash");
var filters = require("./filters");
var validators = require("./validators");

exports.login = function(server, request, response, json) {

    var isValid = true;

    // filter the params
    json.params = filters.filter(server.settings, server.settings.authentication.collection, "login", "default", json.params, "in");

    // validate
    validators.validate(server, request, server.settings.authentication.collection, "login", "default", json, json.params, function(validationSummary) {
        if (validationSummary !== true) {
            isValid = false;
        }

        if (isValid) {

            // temporarily save password and remove it from params
            var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
            var password = json.params[passwordField];
            delete json.params[passwordField];

            // the login response
            var dbLoginResult = function(error, result) {
                if (error) {

                    // collection not provided, create procedure not found response
                    server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

                } else {

                    if (!result) {

                        // collection not provided, create procedure not found response
                        server.error(request, response, -32000, "Invalid credentials.", json.id);

                    } else {

                        // check password
                        if (passwordHash.verify(password, result[passwordField])) {

                            var emailConfirmed = true;
                            if (this.confirmEmailEnabled(server) && result._created) {
                                if (result[(!server.settings.authentication.confirmEmailField ? "isConfirmed" : server.settings.authentication.confirmEmailField)] !== true) {

                                    // calculate timeout
                                    var timeout = (server.settings.authentication.confirmEmailTimeout ? server.settings.authentication.confirmEmailTimeout : 1440) * 60;
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
                                console.log("Session " + request.sessionID + " is now logged in as " + result[(!server.settings.authentication.usernameField ? "email" : server.settings.authentication.usernameField)]);

                                // change the authenticated user
                                request.session.user = JSON.parse(JSON.stringify(result));

                                // set last login
                                var params = {};
                                params[(!server.settings.authentication.lastLoginField ? "_lastLogin" : server.settings.authentication.lastLoginField)] = Math.round(new Date().getTime() / 1000.0);
                                server.db[server.settings.authentication.collection].update({
                                    "_id": result._id
                                }, {
                                    "$set": params
                                });

                                // filter out return values
                                var resultFiltered = filters.filter(server.settings, server.settings.authentication.collection, "login", "default", result, "out");

                                // return result
                                server.result(request, response, resultFiltered, json.id);
                            } else {

                                // collection not provided, create procedure not found response
                                server.error(request, response, -32000, "Email not confirmed.", json.id);
                            }

                            return;
                        } else {

                            // collection not provided, create procedure not found response
                            server.error(request, response, -32000, "Invalid credentials.", json.id);
                        }
                    }
                }
            };

            // write command to log
            console.log(request.sessionID + ": server.db." + server.settings.authentication.collection + ".findOne(" + JSON.stringify(json.params) + ", dbLoginResult);");

            // execute command
            server.db[server.settings.authentication.collection].findOne(json.params, dbLoginResult.bind(this));
        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32000, "Invalid credentials.", json.id, validationSummary);
            return;
        }
    }.bind(this));
};

exports.logout = function(server, request, response, json) {

    // change the authenticated user
    request.session.user = undefined;

    // log authentication change
    console.log("Session " + request.sessionID + " is now logged in as " + request.session.user);

    // return result
    server.result(request, response, "Logout successful.", json.id);
    return;
};

exports.changePassword = function(server, request, response, json) {

    if (request.session.user) {
        var isValid = true;

        // filter the params
        json.params = filters.filter(server.settings, server.settings.authentication.collection, "changePassword", "default", json.params, "in");

        // validate
        validators.validate(server, request, server.settings.authentication.collection, "changePassword", "default", json, json.params, function(validationSummary) {
            if (validationSummary !== true) {
                isValid = false;
            }

            if (isValid) {

                // temporarily save password and remove it from params
                var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                var password = json.params[passwordField];
                delete json.params[passwordField];

                if (passwordHash.verify(password, request.session.user[passwordField])) {

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
                                server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

                            } else {
                                // log password change
                                console.log("Session " + request.sessionID + " has changed their password");

                                // store new password in session
                                request.session.user[passwordField] = json.params.newPassword;

                                // return success
                                server.result(request, response, "Password successfully changed.", json.id);
                            }

                        };

                        var update = {
                            "$set": json.params
                        };

                        // write command to log
                        console.log(request.sessionID + ": server.db." + server.settings.authentication.collection + ".update({\"_id\":server.db.ObjectId(\"" + request.session.user._id.toString() + "\")}," + JSON.stringify(update) + ", dbResult);");

                        // execute command
                        server.db[server.settings.authentication.collection].update({"_id":request.session.user._id}, update, dbResult.bind(this));
                    } else {

                        // new password and password confirmation do not match
                        server.error(request, response, -32000, "New password and confirm password do not match.", json.id, validationSummary);
                    }
                } else {

                    // write to log
                    console.log(request.sessionID + ": Invalid credentials.");

                    // user currently not logged in
                    server.error(request, response, -32000, "Invalid credentials.", json.id, validationSummary);
                }
            } else {

                // write to log
                console.log(request.sessionID + ": Internal JSON-RPC error.");

                // validation not passed, return with error and validation summary
                server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            }
        }.bind(this));
    } else {

        // write to log
        console.log(request.sessionID + ": User not logged in.");

        // user currently not logged in
        server.error(request, response, -32000, "User not logged in.", json.id, validationSummary);
        return;
    }
};

exports.passwordResetRequest = function(server, request, response, json) {

    var isValid = true;

    // filter the params
    json.params = filters.filter(server.settings, server.settings.authentication.collection, "passwordResetRequest", "default", json.params, "in");

    // validate
    validators.validate(server, request, server.settings.authentication.collection, "passwordResetRequest", "default", json, json.params, function(validationSummary) {
        if (validationSummary !== true) {
            isValid = false;
        }

        if (isValid) {

            // the login response
            var dbResult = function(error, result) {
                if (error) {

                    // internal MongoDB error
                    server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

                } else {

                    if (!result) {

                        // return result
                        server.result(request, response, false, json.id);

                    } else {

                        if (server.settings.mail) {
                            if (server.settings.mail.messages && server.settings.authentication.passwordResetToken) {

                                // create and encrypt the token
                                var expiration = new Date();
                                expiration.setMinutes(expiration.getMinutes() + server.settings.authentication.passwordResetToken.timeout);

                                var algorithm = server.settings.authentication.passwordResetToken.algorithm;
                                var password = server.settings.authentication.passwordResetToken.password;
                                var cipher = crypto.createCipher(algorithm, password);

                                var token = {};
                                token._id = result._id;
                                token.expiration = expiration;
                                token = cipher.update(JSON.stringify(token), "utf8", "hex");
                                token += cipher.final("hex");

                                // format the email message - textevents.js
                                var mailMessage = JSON.parse(JSON.stringify(server.settings.mail.messages.passwordResetRequest));
                                mailMessage.text = mailMessage.text.replace(/{firstName}/g, (result.firstName || ""));
                                mailMessage.text = mailMessage.text.replace(/{lastName}/g, (result.lastName || ""));
                                mailMessage.text = mailMessage.text.replace(/{token}/g, encodeURIComponent(token));
                                mailMessage.to = (result.firstName || "") + " " + (result.lastName || "") + " <" + result[(!server.settings.authentication.usernameField ? "email" : server.settings.authentication.usernameField)] + ">";

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
                                server.mail.send(mailMessage, function(error, message) {
                                    if (error) {

                                        // error sending mail
                                        server.error(request, response, -32000, error.message, json.id);
                                    } else {

                                        // return result
                                        server.result(request, response, true, json.id);
                                    }
                                }.bind(this));

                            } else {

                                // reset not enabled
                                server.error(request, response, -32000, "Reset password not enabled.", json.id);
                            }
                        } else {

                            // reset not enabled
                            server.error(request, response, -32000, "Reset password not enabled.", json.id);
                        }
                    }
                }
            };

            // write command to log
            console.log(request.sessionID + ": server.db." + server.settings.authentication.collection + ".findOne(" + JSON.stringify(json.params) + ", dbResult);");

            // execute command
            server.db[server.settings.authentication.collection].findOne(json.params, dbResult.bind(this));
        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this));
};

exports.passwordReset = function(server, request, response, json) {

    var isValid = true;

    // filter the params
    json.params = filters.filter(server.settings, server.settings.authentication.collection, "passwordReset", "default", json.params, "in");

    // validate
    validators.validate(server, request, server.settings.authentication.collection, "passwordReset", "default", json, json.params, function(validationSummary) {
        if (validationSummary !== true) {
            isValid = false;
        }

        if (isValid) {

            var algorithm = server.settings.authentication.passwordResetToken.algorithm;
            var password = server.settings.authentication.passwordResetToken.password;
            var decipher = crypto.createDecipher(algorithm, password);
            var token = decipher.update(json.params.token, "hex", "utf8");
            token += decipher.final("utf8");
            token = JSON.parse(token);

            if (new Date() < new Date(token.expiration)) {

                var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                var password = json.params[passwordField];

                // ensure new password and password confirmation match
                if (json.params.newPassword == json.params.confirmPassword) {

                    // create params and encrypt the new password
                    var params = {};
                    params[passwordField] = passwordHash.generate(json.params.newPassword);

                    // update the user
                    server.db[server.settings.authentication.collection].update({
                        "_id": server.db.ObjectId(token._id)
                    }, {
                        "$set": params
                    }, function(error, result) {
                        if (error) {

                            // collection not provided, create procedure not found response
                            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

                        } else {
                            // log password change
                            console.log("Session " + request.sessionID + " has reset their password");

                            // return success
                            server.result(request, response, "Password successfully reset.", json.id);
                        }
                    }.bind(this));
                } else {

                    // new password and password confirmation do not match
                    server.error(request, response, -32000, "New password and confirm password do not match.", json.id, validationSummary);
                }
            } else {

                // new password and password confirmation do not match
                server.error(request, response, -32000, "Password reset token has expired.", json.id);
            }

        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this));
};

exports.confirmEmailRequest = function(server, request, response, json) {

    var isValid = true;

    // filter the params
    json.params = filters.filter(server.settings, server.settings.authentication.collection, "confirmEmailRequest", "default", json.params, "in");

    // validate
    validators.validate(server, request, server.settings.authentication.collection, "confirmEmailRequest", "default", json, json.params, function(validationSummary) {
        if (validationSummary !== true) {
            isValid = false;
        }

        if (isValid) {

            // the login response
            var dbResult = function(error, result) {

                if (error) {

                    // internal MongoDB error
                    server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

                } else {

                    if (!result) {

                        // return result
                        server.result(request, response, false, json.id);

                    } else {

                        this.sendConfirmEmail(server, request, response, result, function(errorMail) {
                            if (errorMail) {

                                // log error
                                console.log(errorMail);

                                // error sending mail
                                server.error(request, response, -32000, errorMail.message, json.id);
                            } else {

                                // return result
                                server.result(request, response, true, json.id);
                            }
                        }.bind(this));
                    }
                }
            };

            // write command to log
            console.log(request.sessionID + ": server.db." + server.settings.authentication.collection + ".findOne(" + JSON.stringify(json.params) + ", dbResult);");

            // execute command
            server.db[server.settings.authentication.collection].findOne(json.params, dbResult.bind(this));
        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this));
};

exports.confirmEmail = function(server, request, response, json) {

    var isValid = true;

    // filter the params
    json.params = filters.filter(server.settings, server.settings.authentication.collection, "confirmEmail", "default", json.params, "in");

    // validate
    validators.validate(server, request, server.settings.authentication.collection, "confirmEmail", "default", json, json.params, function(validationSummary) {
        if (validationSummary !== true) {
            isValid = false;
        }

        if (isValid) {

            var algorithm = server.settings.authentication.confirmEmailToken.algorithm;
            var password = server.settings.authentication.confirmEmailToken.password;
            var decipher = crypto.createDecipher(algorithm, password);
            var token = decipher.update(json.params.token, "hex", "utf8");
            token += decipher.final("utf8");
            token = JSON.parse(token);

            if (new Date() < new Date(token.expiration)) {

                // create params
                var params = {};
                params[(!server.settings.authentication.confirmEmailField ? "isConfirmed" : server.settings.authentication.confirmEmailField)] = true;

                // update the user
                server.db[server.settings.authentication.collection].update({
                    "_id": server.db.ObjectId(token._id)
                }, {
                    "$set": params
                }, function(error, result) {
                    if (error) {

                        // collection not provided, create procedure not found response
                        server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

                    } else {

                        // log email confirmation
                        console.log("Session " + request.sessionID + " has confirmed their email");

                        // return success
                        server.result(request, response, "Email successfully confirmed.", json.id);
                    }
                }.bind(this));
            } else {

                // new password and password confirmation do not match
                server.error(request, response, -32000, "Email confirmation token has expired.", json.id);
            }

        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this));
};

exports.isInRole = function(server, request, response, json) {

    // change the authenticated user
    var isInRole = false;

    if (request.session.user && json.params !== undefined && json.params !== null) {
        if (json.params.name !== undefined) {
            var roles = request.session.user[server.settings.authentication.rolesField !== undefined ? server.settings.authentication.rolesField : "roles"];
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
    server.result(request, response, isInRole, json.id);
    return;
};

exports.isAuthenticated = function(server, request, response, json) {

    // change the authenticated user
    var isAuthenticated = false;

    if (request.session.user) {
        isAuthenticated = true;
    }

    // return result
    server.result(request, response, isAuthenticated, json.id);
    return;
};

exports.confirmEmailEnabled = function(server) {

    var enabled = false;
    if (server.settings.mail) {
        if (server.settings.mail.messages && server.settings.authentication.confirmEmailToken) {
            if (server.settings.mail.messages.confirmEmail) {
                if (server.settings.mail.messages.confirmEmail.enabled) {
                    enabled = true;
                }
            }
        }
    }
    return true;
};

exports.sendConfirmEmail = function(server, request, response, user, callback) {
    if (this.confirmEmailEnabled(server)) {
        if (user[(!server.settings.authentication.confirmEmailField ? "isConfirmed" : server.settings.authentication.confirmEmailField)] !== true) {

            // create and encrypt the token
            var expiration = new Date();
            expiration.setMinutes(expiration.getMinutes() + server.settings.authentication.confirmEmailTimeout);

            var algorithm = server.settings.authentication.confirmEmailToken.algorithm;
            var password = server.settings.authentication.confirmEmailToken.password;
            var cipher = crypto.createCipher(algorithm, password);

            var token = {};
            token._id = user._id;
            token.expiration = expiration;
            token = cipher.update(JSON.stringify(token), "utf8", "hex");
            token += cipher.final("hex");

            // format the email message - textevents.js
            var mailMessage = JSON.parse(JSON.stringify(server.settings.mail.messages.confirmEmail));
            mailMessage.text = mailMessage.text.replace(/{firstName}/g, (user.firstName || ""));
            mailMessage.text = mailMessage.text.replace(/{lastName}/g, (user.lastName || ""));
            mailMessage.text = mailMessage.text.replace(/{token}/g, encodeURIComponent(token));
            mailMessage.to = (user.firstName || "") + " " + (user.lastName || "") + " <" + user[(!server.settings.authentication.usernameField ? "email" : server.settings.authentication.usernameField)] + ">";

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
            server.mail.send(mailMessage, callback);
        } else {

            // email already confirmed
            callback("Email already confirmed.");
        }
    } else {

        // reset not enabled
        callback("Email confirmation not enabled.");
    }
};