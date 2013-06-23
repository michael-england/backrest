var mongojs = require("mongojs");
var defaultParams = require("./params");
var roles = require("./roles");
var validators = require("./validators");
var filters = require("./filters");
var authentication = require("./authentication");
var crypto = require("crypto");
var passwordHash = require("password-hash");
var url = require("url");

module.exports = function(server) {
    return function(request, response, next) {

        if (request.method === "POST" || request.method === "GET") {

            var uri = url.parse(request.url, true);
            var collection = uri.pathname.replace("/", "");
            if (collection) {
                if (server.settings.collections[collection] || uri.pathname.replace("/", "") === "_settings") {

                    // parse data to json
                    var json;
                    if (request.method === "POST") {
                        json = request.body;
                    } else if (uri.query.data) {
                        json = JSON.parse(uri.query.data);
                    }

                    if (json.jsonrpc === "2.0") {

                        // execute the request
                        if (collection === "_settings" && server.settings.isDebug && json.method === "get") {

                            // response with settings only if server is in debug mode
                            server.result(request, response, server.settings);

                        } else {

                            // process jsonrpc request
                            this.process(server, request, response, collection, json.method, json.params);
                        }
                    } else {
                        next();
                    }
                } else {
                    next();
                }
            } else {
                next();
            }
        }else {
            next();
        }
    }.bind(module.exports);
};

module.exports.modifiers = ["$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];

module.exports.process = function(server, request, response, collection, method, params) {

    try {
        var isValid = true;
        var command;
        var validationSummary;

        if (method instanceof Array) {

            command = "server.db." + collection;
            var index = 0;

            var execute = function(isValid, validationSummary) {
                if (isValid) {
                    var dbResult = function(error, result) {

                        // emit executeEnd event
                        server.emit(collection + "_" + method + "_" + action + "_executeEnd", {
                            "currentTarget": server,
                            "params": params,
                            "error": error,
                            "result": result,
                            "request": request
                        });

                        if (error) {

                            // collection not provided, create procedure not found response
                            server.error(request, response, -32603, "Internal JSON-RPC error.");
                            return;
                        } else {

                            // set action to default then check for action in method
                            var action = "default";
                            if (method[0].indexOf("/") > -1) {
                                action = method[0].substring(method[0].indexOf("/") + 1);
                            }

                            // filter out return values
                            result = filters.filter(server.settings, collection, method[0], action, result, "out");

                            // return result
                            server.result(request, response, result);
                            return;
                        }
                    }.bind(this);

                    // write command to log
                    console.log(request.sessionID + ": " + command);

                    // emit executeStart event
                    server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                        "currentTarget": server,
                        "request": request
                    });

                    // execute command
                    eval(command);

                } else {

                    // validation not passed, return with error and validation summary
                    server.error(request, response, -32603, "Internal JSON-RPC error.", validationSummary);
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
                params[index] = defaultParams.get(server, collection, method[index], action, params[index]);

                // check roles
                roles.check(server, collection, method[index], action, request.session.user, params[index], function(allowed) {
                    if (allowed) {

                        if (method[index] !== "save"  && method[index] !== "insert" && method[index] !== "findOne" && method[index] !== "update" && method[index] !== "findAndModify" && method[index] !== "group" && method[index] !== "mapReduce") {

                            // validate
                            validators.validate(server, request, collection, method[index], action, params[index], function(validationSummary) {

                                // emit validate event
                                server.emit(collection + "_" + method[index] + "_" + action + "_validate", {
                                    "currentTarget": server,
                                    "request": request,
                                    "params": params[index]
                                });

                                if (validationSummary === true) {

                                    // filter the params
                                    params[index] = filters.filter(server.settings, collection, method[index], action, params[index], "in");

                                    // emit filtered event
                                    server.emit(collection + "_" + method[index] + "_" + action + "_filter", {
                                        "direction": "in",
                                        "currentTarget": server,
                                        "request": request,
                                        "params": params[index]
                                    });

                                    var tempId;
                                    if (params[index] !== undefined) {
                                        if (params[index]._id !== undefined) {
                                            tempId = params[index]._id;
                                            params[index]._id = "###tempId###";
                                        }
                                    }

                                    // hash the password
                                    if (collection == server.settings.authentication.collection) {
                                        if (params[index] !== undefined) {
                                            var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                                            if (params[index][passwordField] !== undefined) {
                                                params[index][passwordField] = passwordHash.generate(params[index][passwordField]);
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
                                                            server.error(request, response, -32603, "Invalid ID provided");
                                                            return;
                                                        }

                                                        tempId[keys[0]][i] = "server.db.ObjectId(\"" + tempId[keys[0]][i] + "\")";
                                                    }

                                                    tempId = "{\"" + keys[0] + "\":[" + tempId[keys[0]].join() + "]}";
                                                } else {

                                                    if (tempId.length != 24) {
                                                        server.error(request, response, -32603, "Invalid ID provided");
                                                        return;
                                                    }

                                                    tempId = "server.db.ObjectId(\"" + tempId + "\")";
                                                }
                                            } else {

                                                if (tempId.length != 24) {
                                                    server.error(request, response, -32603, "Invalid ID provided");
                                                    return;
                                                }

                                                tempId = "server.db.ObjectId(\"" + tempId + "\")";
                                            }
                                        } else {

                                            if (tempId.length != 24) {
                                                server.error(request, response, -32603, "Invalid ID provided");
                                                return;
                                            }

                                            tempId = "server.db.ObjectId(\"" + tempId + "\")";
                                        }

                                        // append the command
                                        if (index === method.length - 1) {
                                            command += "." + method[index] + "(" + JSON.stringify(params[index]).replace("\"###tempId###\"", tempId) + ", dbResult)";
                                        } else {
                                            command += "." + method[index] + "(" + JSON.stringify(params[index]).replace("\"###tempId###\"", tempId) + ")";
                                        }
                                    } else {

                                        // append the command
                                        if (index === method.length - 1) {
                                            command += "." + method[index] + "(" + JSON.stringify(params[index]) + ", dbResult)";
                                        } else {
                                            command += "." + method[index] + "(" + JSON.stringify(params[index]) + ")";
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
                                    server.error(request, response, -32603, "Internal JSON-RPC error.", validationSummary);
                                    return;
                                }

                            }.bind(this));
                        } else {

                            // method not allowed, return with error and validation summary
                            server.error(request, response, -32601, "Procedure not found.");
                            return;
                        }

                    } else {

                        // method not allowed, return with error and validation summary
                        server.error(request, response, -32601, "Procedure not found.");
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
            params = defaultParams.get(server, collection, method, action, params);

            // check roles
            roles.check(server, collection, method, action, request.session.user, params, function(allowed) {
                if (allowed) {
                    if (method === "update") {
                        this.update(server, request, response, collection, method, action, params);
                    } else if (method === "findAndModify") {
                        this.findAndModify(server, request, response, collection, method, action, params);
                    } else if (method === "group") {
                        this.group(server, request, response, collection, method, action, params);
                    } else if (method === "mapReduce") {
                        this.mapReduce(server, request, response, collection, method, action, params);
                    } else {
                        this.method(server, request, response, collection, method, action, params);
                    }
                } else {

                    // method not allowed, return with error and validation summary
                    server.error(request, response, -32601, "Procedure not found.");
                    return;
                }
            }.bind(this));
        }

    } catch (error) {

        // throw error to console
        console.log(error);

        throw error;
    }
};

module.exports.dbResult = function(server, request, response, collection, method, action, params, error, result) {

    // emit executeEnd event
    server.emit(collection + "_" + method + "_" + action + "_executeEnd", {
        "currentTarget": server,
        "params": params,
        "error": error,
        "result": result,
        "request": request
    });

    if (error) {

        console.log(error);

        // collection not provided, create procedure not found response
        server.error(request, response, -32603, "Internal JSON-RPC error.");
        return;
    } else {

        var sendResponse = true;

        // save and clear uploads
        if (result) {

            // save uploads and update
            if ((method == "save" || method == "insert") && server.uploads.has(collection, "new", request.session.uploads)) {

                // create update object
                var uploads = server.uploads.get(collection, "new", request.session.uploads);
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
                    var update = server.uploads.save(collection, result._id, request.session.uploads, request, update, true);

                    // clear uploads
                    request.session.uploads = server.uploads.clear(collection, "new", request.session.uploads);

                    // create command
                    var commandUpdate = "server.db." + collection + ".update({\"_id\":server.db.ObjectId(\"" + result._id + "\")},{\"$set\":" + JSON.stringify(update) + "}, dbResultUpdate);";
                    var dbResultUpdate = function(errorUpdate, resultUpdate) {
                        if (errorUpdate) {

                            // collection not provided, create procedure not found response
                            server.error(request, response, -32603, "Internal JSON-RPC error.");
                            return;
                        } else {
                            // update keys
                            for (var i = 0; i < keys.length; i++) {
                                resultUpdate[keys[i]] = update[keys[i]];
                            }

                            // filter out return values
                            resultUpdate = filters.filter(server.settings, collection, method, action, resultUpdate, "out");

                            // return result
                            server.result(request, response, resultUpdate);
                            return;
                        }
                    }.bind(this);

                    // write command to log
                    console.log(request.sessionID + ": " + commandUpdate);

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
                                console.log(request.sessionID + ": Failed to send email confirmation email to " + item[(!server.settings.authentication.usernameField ? "email" : server.settings.authentication.usernameField)]);
                            } else {

                                // log mail sent
                                console.log(request.sessionID + ": Sent email confirmation email to " + item[(!server.settings.authentication.usernameField ? "email" : server.settings.authentication.usernameField)]);
                            }
                        }.bind(this));

                    } else {
                        if (request.session.user === "guest" || request.session.user === "Guest") {
                            ownerParams._owner = "guest";
                        } else {
                            ownerParams._owner = request.session.user._id.toString();
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
            server.result(request, response, result);
            return;
        }
    }
};

module.exports.update = function(server, request, response, collection, method, action, params) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, params, error, result);
    };

    var validationComplete = function(validationSummaryFind, validationSummaryUpdate) {
        if (validationSummaryFind === true && validationSummaryUpdate === true) {

            for (var i = 0; i < params.length; i++) {

                // hash the password
                if (collection == server.settings.authentication.collection) {
                    if (params[i] !== undefined) {
                        var keys = Object.keys(params[i]);
                        if (keys !== undefined) {
                            var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                            if (this.modifiers.indexOf(keys[0]) > -1) {
                                if (params[i][keys[0]] !== undefined) {
                                    if (params[i][keys[0]][passwordField] !== undefined) {
                                        params[i][keys[0]][passwordField] = passwordHash.generate(params[i][keys[0]][passwordField]);
                                    }
                                }
                            } else {
                                if (params[i][passwordField] !== undefined) {
                                    params[i][passwordField] = passwordHash.generate(params[i][passwordField]);
                                }
                            }
                        }
                    }
                }

                // update the object ids
                params[i] = this.ObjectId(server, request, response, params[i]);
            }

            // write command to log
            console.log(request.sessionID + ": server.db." + collection + "." + method + "(" + JSON.stringify(params[0]) + "," + JSON.stringify(params[1]) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            // execute command
            server.db[collection][method](params[0], params[1], dbResult.bind(this));
        } else {

            validationSummary = [];

            if (validationSummaryFind !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
            }

            if (validationSummaryUpdate !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryUpdate);
            }

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "find", action, params[0], function(validationSummaryFind) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validateFind", {
            "currentTarget": server,
            "params": params[0],
            "request": request
        });

        // filter the query
        params[0] = filters.filter(server.settings, collection, "find", action, params[0], "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filterFind", {
            "direction": "in",
            "currentTarget": server,
            "params": params[0],
            "request": request
        });

        // filter the update and handle uploads
        var keys = Object.keys(params[1]);
        if (keys !== undefined) {
            if (this.modifiers.indexOf(keys[0]) > -1) {

                // validate the update
                validators.validate(server, request, collection, "update", action, params[1][keys[0]], function(validationSummaryUpdate) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": params[1][keys[0]]
                    });

                    if (validationSummaryUpdate === true) {

                        // filter the update
                        params[1][keys[0]] = filters.filter(server.settings, collection, "update", action, params[1][keys[0]], "in");

                        // emit filter event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": params[1][keys[0]]
                        });

                        // save and clear uploads
                        if (params[0]._id !== undefined) {

                            var id;
                            if (params[0]._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + params[0]._id).toString();
                            } else {
                                id = params[0]._id;
                            }

                            // save uploads
                            params[1][keys[0]] = server.uploads.save(collection, id, request.session.uploads, request, params[1][keys[0]]);

                            // clear uploads
                            request.session.uploads = server.uploads.clear(collection, id, request.session.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryUpdate);
                }.bind(this));
            } else {
                // validate the update
                validators.validate(server, request, collection, "update", action, params[1], function(validationSummaryUpdate) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": params[1]
                    });

                    if (validationSummaryUpdate === true) {

                        // filter the update
                        params[1] = filters.filter(server.settings, collection, "update", action, params[1], "in");

                        // emit filtered event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": params[1]
                        });

                        // save and clear uploads
                        if (params[0]._id !== undefined) {

                            var id;
                            if (params[0]._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + params[0]._id).toString();
                            } else {
                                id = params[0]._id;
                            }

                            // save uploads
                            params[1] = server.uploads.save(server, collection, id, request.session.uploads, request, params[1]);

                            // clear uploads
                            request.session.uploads = server.uploads.clear(collection, id, request.session.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryUpdate);
                }.bind(this));
            }
        }
    }.bind(this));
};

module.exports.findAndModify = function(server, request, response, collection, method, action, params) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, params, error, result);
    };

    var validationComplete = function(validationSummaryFind, validationSummaryFindAndModify) {
        if (validationSummaryFind === true && validationSummaryFindAndModify === true) {

            // hash the password
            if (collection === server.settings.authentication.collection) {
                var keys = Object.keys(params.update);
                if (keys !== undefined) {
                    var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                    if (this.modifiers.indexOf(keys[0]) > -1) {
                        if (params.update[keys[0]] !== undefined) {
                            if (params.update[keys[0]][passwordField] !== undefined) {
                                params.update[keys[0]][passwordField] = passwordHash.generate(params.update[keys[0]][passwordField]);
                            }
                        }
                    } else {
                        if (params.update !== undefined) {
                            if (params.update[passwordField] !== undefined) {
                                params.update[passwordField] = passwordHash.generate(params.update[passwordField]);
                            }
                        }
                    }
                }
            }

            // update the object ids
            params.query = this.ObjectId(server, request, response, params.query);

            // write command to log
            console.log(request.sessionID + ": server.db." + collection + "." + method + "(" + JSON.stringify(params) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            // execute command
            server.db[collection][method](params, dbResult.bind(this));
        } else {

            validationSummary = [];

            if (validationSummaryFind !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
            }

            if (validationSummaryFindAndModify !== true) {
                validationSummary = validationSummary.concat(validationSummary, validationSummaryFindAndModify);
            }

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", id, validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "find", action, params.query, function(validationSummaryFind) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validateFind", {
            "currentTarget": server,
            "request": request,
            "params": params.query
        });

        // filter the query
        params.query = filters.filter(server.settings, collection, "find", action, params.query, "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filterFind", {
            "direction": "in",
            "currentTarget": server,
            "request": request,
            "params": params.query
        });

        // filter the update and handle uploads
        var keys = Object.keys(params.update);
        if (keys !== undefined) {

            if (this.modifiers.indexOf(keys[0]) > -1) {

                // validate the update
                validators.validate(server, request, collection, "findAndModify", action, params.update[keys[0]], function(validationSummaryFindAndModify) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": params.update[keys[0]]
                    });

                    if (validationSummaryFindAndModify === true) {

                        // filter the update
                        params.update[keys[0]] = filters.filter(server.settings, collection, "findAndModify", action, params.update[keys[0]], "in");

                        // emit filter event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": params.update[keys[0]]
                        });

                        // save and clear uploads
                        if (params.query._id) {

                            var id;
                            if (params.query._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + params.query._id);
                            } else {
                                id = params.query._id;
                            }

                            // save uploads
                            params.update[keys[0]] = server.uploads.save(server, collection, id, request.session.uploads, request, params.update[keys[0]]);

                            // clear uploads
                            request.session.uploads = server.uploads.clear(collection, id, request.session.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryFindAndModify);

                }.bind(this));
            } else {

                // validate the update
                validators.validate(server, request, collection, "findAndModify", action, params.update, function(validationSummaryFindAndModify) {

                    // emit validate event
                    server.emit(collection + "_" + method + "_" + action + "_validate", {
                        "currentTarget": server,
                        "request": request,
                        "params": params.update
                    });

                    if (validationSummaryFindAndModify === true) {

                        // filter the update
                        params.update = filters.filter(server.settings, collection, "findAndModify", action, params.update, "in");

                        // emit filter event
                        server.emit(collection + "_" + method + "_" + action + "_filter", {
                            "direction": "in",
                            "currentTarget": server,
                            "request": request,
                            "params": params.update
                        });

                        // save and clear uploads
                        if (params.query._id !== undefined) {

                            var id;
                            if (params.query._id.indexOf("ObjectId") > -1) {
                                id = eval("server.db." + params.query._id);
                            } else {
                                id = params.query._id;
                            }

                            // save uploads
                            params.update = server.uploads.save(collection, id, request.session.uploads, request, update);

                            // clear uploads
                            request.session.uploads = server.uploads.clear(collection, id, request.session.uploads);
                        }
                    }

                    validationComplete(validationSummaryFind, validationSummaryFindAndModify);

                }.bind(this));
            }
        }
    }.bind(this));
};

module.exports.group = function(server, request, response, collection, method, action, params) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, params, error, result);
    };

    var validationComplete = function(validationSummary) {
        if (validationSummary === true) {
            var tempId;
            if (params) {
                if (params.cond) {
                    if (params.cond._id) {
                        tempId = params.cond._id;
                        params.cond._id = "###tempId###";

                        if (tempId.length !== 24) {
                            server.error(request, response, -32603, "Invalid ID provided");
                            return;
                        }
                    }
                }
            }

            // hash the password
            if (collection == server.settings.authentication.collection) {
                var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                if (params.cond !== undefined) {
                    if (params.cond[passwordField] !== undefined) {
                        params.cond[passwordField] = passwordHash.generate(params.cond[passwordField]);
                    }
                }
            }

            if (tempId !== undefined) {

                // create the command
                command = "server.db." + collection + "." + method + "(" + JSON.stringify(params) + ", dbResult);";
                command = command.replace("\"###tempId###\"", "server.db.ObjectId(\"" + tempId + "\")");
            } else {

                // create the command
                command = "server.db." + collection + "." + method + "(" + JSON.stringify(params) + ", dbResult);";
            }

            // write command to log
            console.log(request.sessionID + ": " + command);

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            if (params) {

                if (params.reduce) {
                    eval("params.reduce = " + params.reduce);
                }

                if (params.finalize) {
                    eval("params.finalize = " + params.finalize);
                }

                if (params.keyf) {
                    eval("params.keyf = " + params.keyf);
                }

                if (params.cond) {
                    if (params.cond._id) {

                        if (tempId.length !== 24) {
                            server.error(request, response, -32603, "Invalid ID provided");
                            return;
                        } else {
                            params.cond._id = server.db.ObjectId(tempId);
                        }
                    }
                }
            }

            server.db[collection][method](params, dbResult.bind(this));

        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "find", action, params.query, function(validationCondition) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validate", {
            "currentTarget": server,
            "request": request,
            "params": params.cond
        });

        // filter the query
        params.cond = filters.filter(server.settings, collection, "group", action, params.cond, "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filter", {
            "direction": "in",
            "currentTarget": server,
            "request": request,
            "params": params.cond
        });

        // finish validating, filtering, then execute
        validationComplete(validationCondition);
    }.bind(this));
};

module.exports.mapReduce = function(server, request, response, collection, method, action, params) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, params, error, result);
    };

    var validationComplete = function(validationSummary) {
        if (validationSummary === true) {
            var tempId;
            if (params) {
                if (params[2]) {
                    if (params[2].query) {
                        params[2].query = this.ObjectId(server, request, response, params[2].query);
                    }

                    // hash the password
                    if (collection == server.settings.authentication.collection) {
                        var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                        if (params[2].query) {
                            if (params[2].query[passwordField]) {
                                params[2].query[passwordField] = passwordHash.generate(params[2].query[passwordField]);
                            }
                        }
                    }
                }
            }

            // write command to log
            console.log(request.sessionID + ": server.db." + collection + "." + method + "(" + JSON.stringify(params[0]) + "," + JSON.stringify(params[1]) + "," + JSON.stringify(params[2]) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            if (params) {

                // map function
                if (params[0]) {
                    eval("params[0] = " + params[0]);
                }

                // reduce function
                if (params[1]) {
                    eval("params[1] = " + params[1]);
                }

                // finalize function
                if (params[2]) {
                    if (params[2].finalize) {
                        eval("params.finalize = " + params.finalize);
                    }

                    if (params[2].query) {
                        if (params[2].query._id) {

                            if (tempId.length !== 24) {
                                server.error(request, response, -32603, "Invalid ID provided");
                                return;
                            } else {
                                params[2].query._id = server.db.ObjectId(tempId);
                            }
                        }
                    }
                }
            }

            server.db[collection][method](params[0], params[1], params[2], function (error, result) {

                // connect to the database and find the result of the mapReduce
                db = mongojs(server.settings.databaseUrl, [result.collectionName]);
                db[result.collectionName].find(dbResult.bind(this));
            }.bind(this));

        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", validationSummary);
            return;
        }
    }.bind(this);

    // validate the query
    validators.validate(server, request, collection, "mapReduce", action, params.query, function(validationCondition) {

        // emit validateFind event
        server.emit(collection + "_" + method + "_" + action + "_validate", {
            "currentTarget": server,
            "request": request,
            "params": params.query
        });

        // filter the query
        params.query = filters.filter(server.settings, collection, "mapReduce", action, params.query, "in");

        // emit filterFind event
        server.emit(collection + "_" + method + "_" + action + "_filter", {
            "direction": "in",
            "currentTarget": server,
            "request": request,
            "params": params.query
        });

        // finish validating, filtering, then execute
        validationComplete(validationCondition);
    }.bind(this));
};

module.exports.method = function(server, request, response, collection, method, action, params) {

    var dbResult = function (error, result) {
        this.dbResult(server, request, response, collection, method, action, params, error, result);
    };

    // validate
    validators.validate(server, request, collection, method, action, params, function(validationSummary) {

        // emit validate event
        server.emit(collection + "_" + method + "_" + action + "_validate", {
            "currentTarget": server,
            "request": request,
            "params": params
        });

        var isValid;
        if (validationSummary === true) {

            isValid = true;

            // filter the params
            params = filters.filter(server.settings, collection, method, action, params, "in");

            // emit filtered event
            server.emit(collection + "_" + method + "_" + action + "_filter", {
                "direction": "in",
                "currentTarget": server,
                "request": request,
                "params": params
            });

            // hash the password
            if (collection === server.settings.authentication.collection) {
                if (params) {
                    var passwordField = (!server.settings.authentication.passwordField ? "password" : server.settings.authentication.passwordField);
                    if (params[passwordField]) {
                        params[passwordField] = passwordHash.generate(params[passwordField]);
                    }
                }
            }

            params = this.ObjectId(server, request, response, params);

            // write command to log
            console.log(request.sessionID + ": server.db." + collection + "." + method + "(" + JSON.stringify(params) + ", dbResult);");

            // emit executeStart event
            server.emit(collection + "_" + method + "_" + action + "_executeStart", {
                "currentTarget": server,
                "request": request
            });

            // execute command
            server.db[collection][method](params, dbResult.bind(this));

        } else {

            // validation not passed, return with error and validation summary
            server.error(request, response, -32603, "Internal JSON-RPC error.", validationSummary);
            return;
        }
    }.bind(this));
};

module.exports.ObjectId = function (server, request, response, params) {
    if (params) {
        if (params._id) {
            if (params._id instanceof Object) {
                var keys = Object.keys(params._id);
                if (keys.length > 0) {
                    if (["$all", "$in", "$nin"].indexOf(keys[0]) > -1) {
                        for (var i = 0; i < params._id[keys[0]].length; i++) {

                            if (params._id[keys[0]][i].length != 24) {
                                server.error(request, response, -32603, "Invalid ID provided");
                                return;
                            }

                            params._id[keys[0]][i] = server.db.ObjectId(params._id[keys[0]][i]);
                        }
                        return params;
                    }
                }
            }

            if (params._id.length != 24) {
                server.error(request, response, -32603, "Invalid ID provided");
                return;
            }

            params._id = server.db.ObjectId(params._id);
        }
    }

    return params;
};