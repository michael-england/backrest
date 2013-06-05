var mongojs = require("mongojs");
var params = require("./params");
var roles = require("./roles");
var validators = require("./validators");
var filters = require("./filters");
var authentication = require("./authentication");
var crypto = require("crypto");
var passwordHash = require("password-hash");


exports.modifiers = ["$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];

exports.process = function(server, request, response, json, collection) {
    try {
        var isValid = true;
        var command;
        var validationSummary;
        var method = json.method;

        if (method instanceof Array) {

            var command = "server.db." + collection;
            var index = 0;

            var execute = function(isValid, validationSummary) {
                if (isValid) {
                    var dbResult = function(error, result) {

                        // emit executeEnd event
                        server.emit(collection + "_" + method + "_" + action + "_executeEnd", {
                            "currentTarget": server,
                            "params": json.params,
                            "error": error,
                            "result": result,
                            "request": request
                        });

                        if (error) {

                            // collection not provided, create procedure not found response
                            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);
                            return;
                        } else {

                            // set action to default then check for action in method
                            var action = "default";
                            if (json.method[0].indexOf("/") > -1) {
                                action = json.method[0].substring(json.method[0].indexOf("/") + 1);
                            }

                            // filter out return values
                            result = filters.filter(server.settings, collection, method[0], action, result, "out");

                            // return result
                            server.result(request, response, result, json.id);
                            return;
                        }
                    }.bind(this);

                    // write command to log
                    console.log(request.session.id + ": " + command);

                    // emit executeStart event
                    server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                        "currentTarget": server,
                        "request": request
                    });

                    // execute command
                    eval(command);

                } else {

                    // validation not passed, return with error and validation summary
                    server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
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
                json.params[index] = params.get(server, collection, method[index], action, json.params[index]);

                // check roles
                roles.check(server, collection, method[index], action, request.session.data.user, json.params[index], function(allowed) {
                    if (allowed) {

                        if (method[index] !== "save"  && method[index] !== "insert" && method[index] !== "findOne" && method[index] !== "update" && method[index] !== "findAndModify" && method[index] !== "group" && method[index] !== "mapReduce") {

                            // validate
                            validators.validate(server, request, collection, method[index], action, json, json.params[index], function(validationSummary) {

                                // emit validate event
                                server.emit(collection + "_" + method[index] + "_" + action + "_validate", {
                                    "currentTarget": server,
                                    "request": request,
                                    "params": json.params[index]
                                });

                                if (validationSummary === true) {

                                    // filter the params
                                    json.params[index] = filters.filter(server.settings, collection, method[index], action, json.params[index], "in");

                                    // emit filtered event
                                    server.emit(collection + "_" + method[index] + "_" + action + "_filter", {
                                        "direction": "in",
                                        "currentTarget": server,
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
                                    if (collection == server.settings.authentication.collection) {
                                        if (json.params[index] !== undefined) {
                                            var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
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
                                                            server.error(request, response, -32603, "Invalid ID provided", json.id);
                                                            return;
                                                        }

                                                        tempId[keys[0]][i] = "server.db.ObjectId(\"" + tempId[keys[0]][i] + "\")";
                                                    }

                                                    tempId = "{\"" + keys[0] + "\":[" + tempId[keys[0]].join() + "]}";
                                                } else {

                                                    if (tempId.length != 24) {
                                                        server.error(request, response, -32603, "Invalid ID provided", json.id);
                                                        return;
                                                    }

                                                    tempId = "server.db.ObjectId(\"" + tempId + "\")";
                                                }
                                            } else {

                                                if (tempId.length != 24) {
                                                    server.error(request, response, -32603, "Invalid ID provided", json.id);
                                                    return;
                                                }

                                                tempId = "server.db.ObjectId(\"" + tempId + "\")";
                                            }
                                        } else {

                                            if (tempId.length != 24) {
                                                server.error(request, response, -32603, "Invalid ID provided", json.id);
                                                return;
                                            }

                                            tempId = "server.db.ObjectId(\"" + tempId + "\")";
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
                                    server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
                                    return;
                                }

                            }.bind(this));
                        } else {

                            // method not allowed, return with error and validation summary
                            server.error(request, response, -32601, "Procedure not found.", json.id);
                            return;
                        }

                    } else {

                        // method not allowed, return with error and validation summary
                        server.error(request, response, -32601, "Procedure not found.", json.id);
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
            json.params = params.get(server, collection, method, action, json.params);

            // check roles
            roles.check(server, collection, method, action, request.session.data.user, json.params, function(allowed) {
                if (allowed) {
                    if (method === "update") {
                        this.update(server, request, response, collection, method, action, json);
                    } else if (method === "findAndModify") {
                        this.findAndModify(server, request, response, collection, method, action, json);
                    } else if (method === "group") {
                        this.group(server, request, response, collection, method, action, json);
                    } else if (method === "mapReduce") {
                        this.mapReduce(server, request, response, collection, method, action, json);
                    } else {
                        this.method(server, request, response, collection, method, action, json);
                    }
                } else {

                    // method not allowed, return with error and validation summary
                    server.error(request, response, -32601, "Procedure not found.", json.id);
                    return;
                }
            }.bind(this));
        }

    } catch (error) {

        // throw error to console
        console.log(error);

        // Internal error occurred, create internal error response
        //server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);

        throw error;
    }
};

exports.dbResult = function(server, request, response, collection, method, action, json, error, result) {

    // emit executeEnd event
    server.emit(collection + "_" + method + "_" + action + "_executeEnd", {
        "currentTarget": server,
        "params": json.params,
        "error": error,
        "result": result,
        "request": request
    });

    if (error) {

        console.log(error);

        // collection not provided, create procedure not found response
        server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);
        return;
    } else {

        var sendResponse = true;

        // save and clear uploads
        if (result) {

            // save uploads and update
            if ((method == "save" || method == "insert") && server.uploads.has(collection, "new", request.session.data.uploads)) {

                // create update object
                var uploads = server.uploads.get(collection, "new", request.session.data.uploads);
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
                    var update = server.uploads.save(collection, result._id, request.session.data.uploads, request, update, true);

                    // clear uploads
                    request.session.data.uploads = server.uploads.clear(collection, "new", request.session.data.uploads);

                    // create command
                    var commandUpdate = "server.db." + collection + ".update({\"_id\":server.db.ObjectId(\"" + result._id + "\")},{\"$set\":" + JSON.stringify(update) + "}, dbResultUpdate);";
                    var dbResultUpdate = function(errorUpdate, resultUpdate) {
                        if (errorUpdate) {

                            // collection not provided, create procedure not found response
                            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);
                            return;
                        } else {
                            // update keys
                            for (var i = 0; i < keys.length; i++) {
                                resultUpdate[keys[i]] = update[keys[i]];
                            }

                            // filter out return values
                            resultUpdate = filters.filter(server.settings, collection, method, action, resultUpdate, "out");

                            // return result
                            server.result(request, response, resultUpdate, json.id);
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
            if (method === "save" || method === "insert") {

                var setOwner = function (item) {

                    // set owner to guest or to user id
                    var ownerParams = {
                        "_created": new Date().getTime() / 1000
                    };
                    if (collection == server.settings.authentication.collection) {

                        // set owner
                        ownerParams._owner = item._id.toString();

                        // send confirmation email
                        authentication.sendConfirmEmail(server, request, response, item, function(errorMail) {
                            if (errorMail) {

                                // error sending mail
                                console.log(errorMail);
                                console.log(request.session.id + ": Failed to send email confirmation email to " + item[(!server.settings.authentication.usernameField ? "email" : server.settings.authentication.usernameField)]);
                            } else {

                                // log mail sent
                                console.log(request.session.id + ": Sent email confirmation email to " + item[(!server.settings.authentication.usernameField ? "email" : server.settings.authentication.usernameField)]);
                            }
                        }.bind(this));

                    } else {
                        if (request.session.data.user === "guest" || request.session.data.user === "Guest") {
                            ownerParams._owner = "guest";
                        } else {
                            ownerParams._owner = request.session.data.user._id.toString();
                        }
                    }

                    server.db[collection].update({
                        "_id": item._id
                    }, {
                        "$set": ownerParams
                    }, function(errorOwner, resultOwner) {}.bind(this));
                }.bind(this);

                if (result instanceof Array) {
                    for (var r = 0; r < result.length; r++) {
                        setOwner(result[r]);
                    }
                } else {
                    setOwner(result);
                }
            }
        }

        if (sendResponse) {

            // filter out return values
            if (result !== null) {
                result = filters.filter(server.settings, collection, method, action, result, "out");
            }

            // return result
            server.result(request, response, result, json.id);
            return;
        }
    }
};

exports.update = function(server, request, response, collection, method, action, json) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, json, error, result);
    };

    var validationComplete = function(validationSummaryFind, validationSummaryUpdate) {
        if (validationSummaryFind === true && validationSummaryUpdate === true) {

            var params = "";
            for (var i = 0; i < json.params.length; i++) {

                // hash the password
                if (collection == server.settings.authentication.collection) {
                    if (json.params[i] !== undefined) {
                        var keys = Object.keys(json.params[i]);
                        if (keys !== undefined) {
                            var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                            if (this.modifiers.indexOf(keys[0]) > -1) {
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

                // update the object ids
                json.params[i] = this.ObjectId(server, request, response, json, json.params[i]);
            }

            // write command to log
            console.log(request.session.id + ": server.db." + collection + "." + method + "(" + JSON.stringify(json.params[0]) + "," + JSON.stringify(json.params[1]) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            // execute command
            server.db[collection][method](json.params[0], json.params[1], dbResult.bind(this));
        } else {

            validationSummary = [];

            if (validationSummaryFind !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
            }

            if (validationSummaryUpdate !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryUpdate);
            }

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "find", action, json, json.params[0], function(validationSummaryFind) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validateFind", {
            "currentTarget": server,
            "params": json.params[0],
            "request": request
        });

        // filter the query
        json.params[0] = filters.filter(server.settings, collection, "find", action, json.params[0], "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filterFind", {
            "direction": "in",
            "currentTarget": server,
            "params": json.params[0],
            "request": request
        });

        // filter the update and handle uploads
        var keys = Object.keys(json.params[1]);
        if (keys !== undefined) {
            if (this.modifiers.indexOf(keys[0]) > -1) {

                // validate the update
                validators.validate(server, request, collection, "update", action, json, json.params[1][keys[0]], function(validationSummaryUpdate) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": json.params[1][keys[0]]
                    });

                    if (validationSummaryUpdate === true) {

                        // filter the update
                        json.params[1][keys[0]] = filters.filter(server.settings, collection, "update", action, json.params[1][keys[0]], "in");

                        // emit filter event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": json.params[1][keys[0]]
                        });

                        // save and clear uploads
                        if (json.params[0]._id !== undefined) {

                            var id;
                            if (json.params[0]._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + json.params[0]._id).toString();
                            } else {
                                id = json.params[0]._id;
                            }

                            // save uploads
                            json.params[1][keys[0]] = server.uploads.save(collection, id, request.session.data.uploads, request, json.params[1][keys[0]]);

                            // clear uploads
                            request.session.data.uploads = server.uploads.clear(collection, id, request.session.data.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryUpdate);
                }.bind(this));
            } else {
                // validate the update
                validators.validate(server, request, collection, "update", action, json, json.params[1], function(validationSummaryUpdate) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": json.params[1]
                    });

                    if (validationSummaryUpdate === true) {

                        // filter the update
                        json.params[1] = filters.filter(server.settings, collection, "update", action, json.params[1], "in");

                        // emit filtered event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": json.params[1]
                        });

                        // save and clear uploads
                        if (json.params[0]._id !== undefined) {

                            var id;
                            if (json.params[0]._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + json.params[0]._id).toString();
                            } else {
                                id = json.params[0]._id;
                            }

                            // save uploads
                            json.params[1] = server.uploads.save(server, collection, id, request.session.data.uploads, request, json.params[1]);

                            // clear uploads
                            request.session.data.uploads = server.uploads.clear(collection, id, request.session.data.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryUpdate);
                }.bind(this));
            }
        }
    }.bind(this));
};

exports.findAndModify = function(server, request, response, collection, method, action, json) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, json, error, result);
    };

    var validationComplete = function(validationSummaryFind, validationSummaryFindAndModify) {
        if (validationSummaryFind === true && validationSummaryFindAndModify === true) {

            // hash the password
            if (collection === server.settings.authentication.collection) {
                var keys = Object.keys(json.params.update);
                if (keys !== undefined) {
                    var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                    if (this.modifiers.indexOf(keys[0]) > -1) {
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

            // update the object ids
            json.params.query = this.ObjectId(server, request, response, json, json.params.query);

            // write command to log
            console.log(request.session.id + ": server.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            // execute command
            server.db[collection][method](json.params, dbResult.bind(this));
        } else {

            validationSummary = [];

            if (validationSummaryFind !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
            }

            if (validationSummaryFindAndModify !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryFindAndModify);
            }

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "find", action, json, json.params.query, function(validationSummaryFind) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validateFind", {
            "currentTarget": server,
            "request": request,
            "params": json.params.query
        });

        // filter the query
        json.params.query = filters.filter(server.settings, collection, "find", action, json.params.query, "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filterFind", {
            "direction": "in",
            "currentTarget": server,
            "request": request,
            "params": json.params.query
        });

        // filter the update and handle uploads
        var keys = Object.keys(json.params.update);
        if (keys !== undefined) {

            if (this.modifiers.indexOf(keys[0]) > -1) {

                // validate the update
                validators.validate(server, request, collection, "findAndModify", action, json, json.params.update[keys[0]], function(validationSummaryFindAndModify) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": json.params.update[keys[0]]
                    });

                    if (validationSummaryFindAndModify === true) {

                        // filter the update
                        json.params.update[keys[0]] = filters.filter(server.settings, collection, "findAndModify", action, json.params.update[keys[0]], "in");

                        // emit filter event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": json.params.update[keys[0]]
                        });

                        // save and clear uploads
                        if (json.params.query._id) {

                            var id;
                            if (json.params.query._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + json.params.query._id);
                            } else {
                                id = json.params.query._id;
                            }

                            // save uploads
                            json.params.update[keys[0]] = server.uploads.save(server, collection, id, request.session.data.uploads, request, json.params.update[keys[0]]);

                            // clear uploads
                            request.session.data.uploads = server.uploads.clear(collection, id, request.session.data.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryFindAndModify);

                }.bind(this));
            } else {

                // validate the update
                validators.validate(server, request, collection, "findAndModify", action, json, json.params.update, function(validationSummaryFindAndModify) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": json.params.update
                    });

                    if (validationSummaryFindAndModify === true) {

                        // filter the update
                        json.params.update = filters.filter(server.settings, collection, "findAndModify", action, json.params.update, "in");

                        // emit filter event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": json.params.update
                        });

                        // save and clear uploads
                        if (json.params.query._id !== undefined) {

                            var id;
                            if (json.params.query._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + json.params.query._id);
                            } else {
                                id = json.params.query._id;
                            }

                            // save uploads
                            json.params.update = server.uploads.save(collection, id, request.session.data.uploads, request, json.update);

                            // clear uploads
                            request.session.data.uploads = server.uploads.clear(collection, id, request.session.data.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryFindAndModify);

                }.bind(this));
            }
        }
    }.bind(this));
};

exports.group = function(server, request, response, collection, method, action, json) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, json, error, result);
    };

    var validationComplete = function(validationSummary) {
        if (validationSummary === true) {
            var tempId;
            if (json.params) {
                if (json.params.cond) {
                    if (json.params.cond._id) {
                        tempId = json.params.cond._id;
                        json.params.cond._id = "###tempId###";

                        if (tempId.length !== 24) {
                            server.error(request, response, -32603, "Invalid ID provided", json.id);
                            return;
                        }
                    }
                }
            }

            // hash the password
            if (collection == server.settings.authentication.collection) {
                var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                if (json.params.cond !== undefined) {
                    if (json.params.cond[passwordField] !== undefined) {
                        json.params.cond[passwordField] = passwordHash.generate(json.params.cond[passwordField]);
                    }
                }
            }

            if (tempId !== undefined) {

                // create the command
                command = "server.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                command = command.replace("\"###tempId###\"", "server.db.ObjectId(\"" + tempId + "\")");
            } else {

                // create the command
                command = "server.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
            }

            // write command to log
            console.log(request.session.id + ": " + command);

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            if (json.params) {

                if (json.params.reduce) {
                    eval("json.params.reduce = " + json.params.reduce);
                }

                if (json.params.finalize) {
                    eval("json.params.finalize = " + json.params.finalize);
                }

                if (json.params.keyf) {
                    eval("json.params.keyf = " + json.params.keyf);
                }

                if (json.params.cond) {
                    if (json.params.cond._id) {

                        if (tempId.length !== 24) {
                            server.error(request, response, -32603, "Invalid ID provided", json.id);
                            return;
                        } else {
                            json.params.cond._id = server.db.ObjectId(tempId);
                        }
                    }
                }
            }

            server.db[collection][method](json.params, dbResult.bind(this));

        } else {

            // validation not passed, return with error and validation summary
            server.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "find", action, json, json.params.query, function(validationCondition) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validate", {
            "currentTarget": server,
            "request": request,
            "params": json.params.cond
        });

        // filter the query
        json.params.cond = filters.filter(server.settings, collection, "group", action, json.params.cond, "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filter", {
            "direction": "in",
            "currentTarget": server,
            "request": request,
            "params": json.params.cond
        });

        // finish validating, filtering, then execute
        validationComplete(validationCondition);
    }.bind(this));
};

exports.mapReduce = function(server, request, response, collection, method, action, json) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, json, error, result);
    };

    var validationComplete = function(validationSummary) {
        if (validationSummary === true) {
            var tempId;
            if (json.params) {
                if (json.params[2]) {
                    if (json.params[2].query) {
                        json.params[2].query = this.ObjectId(server, request, response, json, json.params[2].query);
                    }

                    // hash the password
                    if (collection == server.settings.authentication.collection) {
                        var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                        if (json.params[2].query) {
                            if (json.params[2].query[passwordField]) {
                                json.params[2].query[passwordField] = passwordHash.generate(json.params[2].query[passwordField]);
                            }
                        }
                    }
                }
            }

            // write command to log
            console.log(request.session.id + ": server.db." + collection + "." + method + "(" + JSON.stringify(json.params[0]) + "," + JSON.stringify(json.params[1]) + "," + JSON.stringify(json.params[2]) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            if (json.params) {

                // map function
                if (json.params[0]) {
                    eval("json.params[0] = " + json.params[0]);
                }

                // reduce function
                if (json.params[1]) {
                    eval("json.params[1] = " + json.params[1]);
                }

                // finalize function
                if (json.params[2]) {
                    if (json.params[2].finalize) {
                        eval("json.params.finalize = " + json.params.finalize);
                    }

                    if (json.params[2].query) {
                        if (json.params[2].query._id) {

                            if (tempId.length !== 24) {
                                server.error(request, response, -32603, "Invalid ID provided", json.id);
                                return;
                            } else {
                                json.params[2].query._id = server.db.ObjectId(tempId);
                            }
                        }
                    }
                }
            }

            server.db[collection][method](json.params[0], json.params[1], json.params[2], function (error, result) {

                // connect to the database and find the result of the mapReduce
                db = mongojs(server.settings.databaseUrl, [result.collectionName]);
                db[result.collectionName].find(dbResult.bind(this));
            }.bind(this));

        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "mapReduce", action, json, json.params.query, function(validationCondition) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validate", {
            "currentTarget": server,
            "request": request,
            "params": json.params.query
        });

        // filter the query
        json.params.query = filters.filter(server.settings, collection, "mapReduce", action, json.params.query, "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filter", {
            "direction": "in",
            "currentTarget": server,
            "request": request,
            "params": json.params.query
        });

        // finish validating, filtering, then execute
        validationComplete(validationCondition);
    }.bind(this));
};

exports.method = function(server, request, response, collection, method, action, json) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, json, error, result);
    };

    // validate
    validators.validate(server, request, collection, method, action, json, json.params, function(validationSummary) {

        // emit validate event
        server.emit(collection + "_" + method + "_" + action + "_validate", {
            "currentTarget": server,
            "request": request,
            "params": json.params
        });

        var isValid;
        if (validationSummary === true) {

            isValid = true;

            // filter the params
            json.params = filters.filter(server.settings, collection, method, action, json.params, "in");

            // emit filtered event
            server.emit(collection + "_" + method + "_" + action + "_filter", {
                "direction": "in",
                "currentTarget": server,
                "request": request,
                "params": json.params
            });

            // hash the password
            if (collection === server.settings.authentication.collection) {
                if (json.params) {
                    var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                    if (json.params[passwordField]) {
                        json.params[passwordField] = passwordHash.generate(json.params[passwordField]);
                    }
                }
            }

            json.params = this.ObjectId(server, request, response, json, json.params);

            // write command to log
            console.log(request.session.id + ": server.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            // execute command
            server.db[collection][method](json.params, dbResult.bind(this));

        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    }.bind(this));
};

exports.ObjectId = function (server, request, response, json, params) {
    if (params) {
        if (params._id) {
            if (params._id instanceof Object) {
                var keys = Object.keys(params._id);
                if (keys.length > 0) {
                    if (["$all", "$in", "$nin"].indexOf(keys[0]) > -1) {
                        for (var i = 0; i < params._id[keys[0]].length; i++) {

                            if (params._id[keys[0]][i].length != 24) {
                                server.processError(request, response, -32603, "Invalid ID provided", json.id);
                                return;
                            }

                            params._id[keys[0]][i] = server.db.ObjectId(params._id[keys[0]][i]);
                        }
                        return json;
                    }
                }
            }

            if (params._id.length != 24) {
                server.error(request, response, -32603, "Invalid ID provided", json.id);
                return;
            }

            params._id = server.db.ObjectId(params._id);
        }
    }

    return params;
};