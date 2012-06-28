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
var passwordHash = require("password-hash");
var formidable = require("formidable");
var validators = require("./lib/validators");
var filters = require("./lib/filters");
var roles = require("./lib/roles");
var params = require("./lib/params");

MongoRpc = function () {
    events.EventEmitter.call(this);
    this.settings = undefined;
    this.settingsFilename = undefined;
    this.collections = undefined;
    this.path = ".";
    this.events = undefined;
    this.customValidators = undefined;
    this.db = undefined;

    this.init = function () {
        this.settingsFilename = libpath.join(this.path, "settings.json");
        libpath.exists(this.settingsFilename, this.libpathExists.bind(this));
    }

    this.libpathExists = function (exists) {
        if (exists) {
            fs.readFile(this.settingsFilename, "binary", this.fsReadFile.bind(this));
        } else {    
    
            // handle error
            console.log("settings.json file does not exist.");
    
            // exit the application    		
            process.exit();	
        }
    }
    
    this.fsReadFile = function (error, file) {
        if (!error) {
            try
            {
                // parse file to this.settings object
                this.settings = JSON.parse(file);
                
                // push setting's collection to collections name array
                this.collections = Object.keys(this.settings.collections);
                
                // register events
                if (this.settings.paths.events != undefined) {
                    this.events = require(this.settings.paths.events);
                    for (var c = 0; c < this.collections.length; c++) {
                        var collection = this.settings.collections[this.collections[c]];
                        var methods = Object.keys(collection);
                        for (var m = 0; m < methods.length; m++) {
                            var method = collection[methods[m]]
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
                
                // register validators
                if (this.settings.paths.customValidators != undefined) {
                    this.customValidators = require(this.settings.paths.customValidators);
                }
                
                // start the http server
                this.httpStart();    		
                
                // connect to the database
                this.db = mongo.connect(this.settings.databaseUrl, this.collections);
            } 
            catch (ex) 
            {
                // handle error
                console.log(ex.message);
    
                // exit the application    		
                process.exit();	
            }
        } else {
        
            // exit the application    		
            process.exit();	
        }
    }

    this.httpStart = function () {
    
        if (this.settings.isSecured) {
            if (this.settings.privateKey !== undefined && this.settings.privateKey !== "" &&
                this.settings.certificate !== undefined && this.settings.certificate !== "") {
                
                var options = {
                    key: fs.readFileSync(this.settings.privateKey).toString(),
                    cert: fs.readFileSync(this.settings.certificate).toString()
                };
                
                https.createServer(options, function (request, response) {
                    session (request, response, function(request, response) {
                        if (request.method == "POST") {	
                            
                            // process POST request
                            this.processPost(request, response);
                              
                        } else {
                        
                            // process with the requested file
                            this.processGet(request, response);
                        } 
                    }.bind(this));   
                }.bind(this)).listen(this.settings.httpPort);
                
                console.log("HTTPS Server running on port " + this.settings.httpPort + ".");
            } else {
                throw new Error("HTTPS credientials are not valid.");
            }
        } else {
            
            http.createServer(function (request, response) {
                session (request, response, function(request, response) {
                    if (request.method == "POST") {	
                        
                        // process POST request
                        this.processPost(request, response);
                          
                    } else {
                    
                        // process with the requested file
                        this.processGet(request, response);
                    } 
                }.bind(this));   
            }.bind(this)).listen(this.settings.httpPort);
            
            console.log("HTTP Server running on port " + this.settings.httpPort + ".");
        }
    }

    this.processLogin = function (request, response, json) {
    
        var isValid = true;
        
        // filter the params
        json.params = filters.filter(this.settings, this.settings.httpAuthCollection, "login", "default", json.params, "in");
        
        // validate
        validators.validate(this, this.settings.httpAuthCollection, "login", "default", json.params, function (validationSummary) {
            if (validationSummary !== true) {
                isValid = false;
            }
            
            if (isValid) {	
                
                // temporarily save password and remove it from params
                var passwordField = (!this.settings.httpAuthPasswordField ? "password" : this.settings.httpAuthPasswordField);
                var password = json.params[passwordField];
                delete json.params[passwordField];
                
                // the login response
                var dbLoginResult = function (error, result) {
                    if(error) {
                    
                          // collection not provided, create procedure not found response
                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                        
                    } else {
                        
                        if (!result) {
                        
                              // collection not provided, create procedure not found response
                            this.processError(request, response, -32000, "Invalid credentials.", json.id);
                            
                        } else {
                        
                            // check password
                            if (passwordHash.verify(password, result[passwordField])) {
                            
                                // log authentication change
                                console.log("Session " + request.session.id + " is now logged in as " + result[(!this.settings.httpAuthUsernameField ? "email" : this.settings.httpAuthUsernameField)]);
                            
                                // change the authenticated user
                                request.session.data.user = JSON.parse(JSON.stringify(result));
                                
                                // filter out return values
                                var resultFiltered = filters.filter(this.settings, this.settings.httpAuthCollection, "login", "default", result, "out");
                            
                                // return result
                                this.processResult(request, response, resultFiltered, json.id);
                                return;
                            } else {
                                
                                // collection not provided, create procedure not found response
                                this.processError(request, response, -32000, "Invalid credentials.", json.id);
                            }
                        }
                    }
                }.bind(this);
                
                // build the command		
                var command = "this.db." + this.settings.httpAuthCollection + ".findOne(" + JSON.stringify(json.params) + ", dbLoginResult);";
                
                // write command to log
                console.log(request.session.id + ": " + command);
            
                // execute command
                eval(command)
            } else {
                
                // validation not passed, return with error and validation summary
                this.processError(request, response, -32000, "Invalid credentials.", json.id, validationSummary);
                return;
            }
        }.bind(this));
    }

    this.processLogout = function (request, response, json) {
    
        // change the authenticated user
        request.session.data.user = "guest";
    
        // log authentication change
        console.log("Session " + request.session.id + " is now logged in as " + request.session.data.user);
        
        // return result
        this.processResult (request, response, "Logout successful.", json.id);
        return;
    }
    
    this.processChangePassword = function (request, response, json) {
        
        if (request.session.data.user != "guest") {
            var isValid = true;
            
            // filter the params
            json.params = filters.filter(this.settings, this.settings.httpAuthCollection, "changePassword", "default", json.params, "in");
            
            // validate
            validators.validate(this, this.settings.httpAuthCollection, "changePassword", "default", json.params, function (validationSummary) {
                if (validationSummary !== true) {
                    isValid = false;
                }
                    
                if (isValid) {	
                    
                    // temporarily save password and remove it from params
                    var passwordField = (!this.settings.httpAuthPasswordField ? "password" : this.settings.httpAuthPasswordField);
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
                            var dbResult = function (error, result) {
                                if(error) {
                                
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
                            
                            var update = {"$set":json.params};
                            
                            // build the command		
                            var command = "this.db." + this.settings.httpAuthCollection + ".update({\"_id\":this.db.ObjectId(\"" + request.session.data.user._id.toString() + "\")}," + JSON.stringify(update) + ", dbResult);";
                            
                            // write command to log
                            console.log(request.session.id + ": " + command);
                        
                            // execute command
                            eval(command)
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
    }
    
    this.processIsInRole = function (request, response, json) {
    
        // change the authenticated user
        var isInRole = false;
        
        if (request.session.data.user != "guest" && json.params !== undefined && json.params !== null) {
            if (json.params.name !== undefined) {
                var roles = request.session.data.user[this.settings.httpAuthRolesField !== undefined ? this.settings.httpAuthRolesField : "roles"];
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
        this.processResult (request, response, isInRole, json.id);
        return;
    }

    this.processIsAuthenticated = function (request, response, json) {
    
        // change the authenticated user
        var isAuthenticated = false;
        
        if (request.session.data.user != "guest") {
            isAuthenticated = true;
        }
        
        // return result
        this.processResult (request, response, isAuthenticated, json.id);
        return;
    }

    this.processRpc = function (request, response, json, collection) {
    	try {
	        var isValid = true;
	        var command = undefined;
	        var validationSummary = undefined;
	        var method = json.method;
	        
	        // set action to default then check for action in method
	        var action = "default";
	        if (method.indexOf("/") > -1) {
	            action = method.substring(method.indexOf("/"));
	        }
	        
	        // mongodb modifiers
	        var modifiers = [ "$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];
	        
	        // update params with params stored in settings
	        json.params = params.get(this, collection, method, action, json.params);
	        
	        // check roles
	        roles.check(this, collection, method, action, request.session.data.user, json.params, function (allowed) {
	            if (allowed) {
	                var execute = function (isValid, validationSummary) {
	                    if (isValid) {
	                        var dbResult = function (error, result) {
	                            
	                            // emit executeEnd event
	                            this.emit(collection + "_" + method + "_" + action + "_executeEnd", { "currentTarget": this, "params": json.params});
	                            
	                            if(error) {
	                            
	                                // collection not provided, create procedure not found response
	                                this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
	                                return;
	                            } else {
	                        
	                                var sendResponse = true;
	                            
	                                // save and clear uploads
	                                if (result != undefined) {
	                                    
	                                    // save uploads and update
	                                    if (method == "save" && this.hasUploads(collection, "new", request.session.data.uploads)) {
	                                        
	                                        // create update object
	                                        var uploads = this.getUploads(collection, "new", request.session.data.uploads);
	                                        if (uploads != undefined) {
	                                        
	                                            // copy keys to update object
	                                            var keys = Object.keys(uploads);    
	                                            var update = {};
	                                            for (var i = 0; i < keys.length; i++) {
	                                                update[keys[i]] = "";
	                                            }
	                                            
	                                            // hold off sending results
	                                            sendResult = false;
	                                            
	                                            // save uploads
	                                            var update = this.saveUploads(collection, result._id, request.session.data.uploads, update, true);
	                                            
	                                            // clear uploads
	                                            request.session.data.uploads = this.clearUploads(collection, "new", request.session.data.uploads);
	                                            
	                                            // create command
	                                            var commandUpdate = "this.db." + collection + ".update({\"_id\":this.db.ObjectId(\"" + result._id + "\")},{\"$set\":" + JSON.stringify(update) + "}, dbResultUpdate);";
	                                            var dbResultUpdate = function (errorUpdate, resultUpdate) {
	                                                if(errorUpdate) {
	                                                
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
	                                                    this.processResult (request, response, resultUpdate, json.id);
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
	                                        var ownerParams = {};
	                                        if (collection == this.settings.httpAuthCollection) {
	                                            ownerParams._owner = result._id.toString();
	                                        } else {
	                                            if (request.session.data.user === "guest" || request.session.data.user === "Guest") {
	                                                ownerParams._owner = "guest";
	                                            } else {
	                                                ownerParams._owner = request.session.data.user._id.toString();
	                                            }
	                                        }
	                                        
	                                        this.db[collection].update({"_id":result._id}, {"$set": ownerParams}, function (errorOwner, resultOwner) {}.bind(this));
	                                    }
	                                }
	                    
	                                if (sendResponse) {
	                        
	                                    // filter out return values
	                                    result = filters.filter(this.settings, collection, method, action, result, "out");
	                                    
	                                    // return result
	                                    this.processResult (request, response, result, json.id);
	                                    return;            
	                                }
	                            }
	                        }.bind(this);
	                        
	                        // write command to log
	                        console.log(request.session.id + ": " + command);
	                        
	                        // emit executeStart event
	                        this.emit(collection + "_" + method + "_" + action + "_executeStart", { "currentTarget": this });
	                        
	                        // execute command
	                        eval(command);
	                        
	                    } else {
	                
	                        // validation not passed, return with error and validation summary
	                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
	                        return;
	                    }
	                }.bind(this);
	                
	                if (method == "update") {
	                    
	                    var validationComplete = function (validationSummaryFind, validationSummaryUpdate) {
	                        if (validationSummaryFind == true && validationSummaryUpdate == true) {
	                        
	                            var params = "";
	                            for (var i = 0; i < json.params.length; i++) {
	                                var tempId = undefined;
	                                if (json.params[i] != undefined) {
	                                    if (json.params[i]._id != undefined) {
                                            tempId = json.params[i]._id;
                                            json.params[i]._id = "###tempId###";
	                                    }
	                                }
	                                
	                                // hash the password
	                                if (collection == this.settings.httpAuthCollection) {
	                                    if (json.params[i] != undefined) {
	                                        var keys = Object.keys(json.params[1]);
	                                        if (keys != undefined) {
	                                            var passwordField = (!this.settings.httpAuthPasswordField ? "password" : this.settings.httpAuthPasswordField);
	                                            if (modifiers.indexOf(keys[0]) > -1) {
	                                                if (json.params[i][keys[0]] != undefined) {
	                                                    if (json.params[i][keys[0]][passwordField] != undefined) {
	                                                        json.params[i][keys[0]][passwordField] = passwordHash.generate(json.params[i][keys[0]][passwordField]);
	                                                    }
	                                                }
	                                            } else {
	                                                if (json.params[i][passwordField] != undefined) {
	                                                    json.params[i][passwordField] = passwordHash.generate(json.params[i][passwordField]);
	                                                }
	                                            }                
	                                        }
	                                    }
	                                }
	                                
	                                if (i == 0) {
	                                    if (tempId !== undefined !== "undefined") {
	                                    
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
	                            
	                            if (validationSummaryFind != true) {
	                                validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
	                            }
	                            
	                            if (validationSummaryUpdate != true) {
	                                validationSummary = validationSummary.concat(validationSummary, validationSummaryUpdate);
	                            }
	                            
	                            isValid = false;
	                        }
	                        
	                        // execute the response
	                        execute(isValid, validationSummary);
	                    }.bind(this);
	                    
	                    // validate the query
	                    validators.validate(this, collection, "find", action, json.params[0], function (validationSummaryFind) {
	                        
	                        // emit validateFind event
	                        this.emit(collection + "_" + method + "_" + action + "_validateFind", { "currentTarget": this, "params": json.params[0]});
	                        
	                        // filter the query
	                        json.params[0] = filters.filter(this.settings, collection, "find", action, json.params[0], "in");
	                        
	                        // emit filterFind event
	                        this.emit(collection + "_" + method + "_" + action + "_filterFind", { "direction": "in", "currentTarget": this, "params": json.params[0]});
	                        
	                        // filter the update and handle uploads
	                        var keys = Object.keys(json.params[1]);
	                        if (keys != undefined) {
	                            if (modifiers.indexOf(keys[0]) > -1) {
	                            
	                                // validate the update
	                                validators.validate(this, collection, "update", action, json.params[1][keys[0]], function (validationSummaryUpdate) {
	                                    
	                                    // emit validate event
	                                    this.emit(collection + "_" + method + "_" + action + "_validate", { "currentTarget": this, "params": json.params[1][keys[0]]});
	                                    
	                                    if (validationSummaryUpdate == true) {
	                                        
	                                        // filter the update
	                                        json.params[1][keys[0]] = filters.filter(this.settings, collection, "update", action, json.params[1][keys[0]], "in");
	                                        
	                                        // emit filter event
	                                        this.emit(collection + "_" + method + "_" + action + "_filter", { "direction": "in", "currentTarget": this, "params": json.params[1][keys[0]]});
	                                                
	                                        // save and clear uploads
	                                        if (json.params[0]._id !== undefined) {
	                                            
	                                            var id;
	                                            if (json.params[0]._id.indexOf("ObjectId") > -1) {
	                                                id = eval("this.db." + json.params[0]._id).toString();
	                                            } else {
	                                                id = json.params[0]._id;
	                                            }
	                                            
	                                            // save uploads
	                                            json.params[1][keys[0]] = this.saveUploads(collection, id, request.session.data.uploads, json.params[1][keys[0]]);
	                                            
	                                            // clear uploads
	                                            request.session.data.uploads = this.clearUploads(collection, id, request.session.data.uploads);
	                                        }
	                                    }
	                                    
	                                    validationComplete(validationSummaryFind, validationSummaryUpdate);
	                                }.bind(this));
	                            } else {
	                                // validate the update
	                                validators.validate(this, collection, "update", action, json.params[1], function (validationSummaryUpdate) {
	                                    
	                                    // emit validate event
	                                    this.emit(collection + "_" + method + "_" + action + "_validate", { "currentTarget": this, "params": json.params[1]});
	                                    
	                                    if (validationSummaryUpdate == true) {
	                                        
	                                        // filter the update
	                                        json.params[1] = filters.filter(this.settings, collection, "update", action, json.params[1], "in");
	                                        
	                                        // emit filtered event
	                                        this.emit(collection + "_" + method + "_" + action + "_filter", { "direction": "in", "currentTarget": this, "params": json.params[1]});
	                                        
	                                        // save and clear uploads
	                                        if (json.params[0]._id !== undefined) {
	                                            
	                                            var id;
	                                            if (json.params[0]._id.indexOf("ObjectId") > -1) {
	                                                id = eval("this.db." + json.params[0]._id).toString();
	                                            } else {
	                                                id = json.params[0]._id;
	                                            }
	                                            
	                                            // save uploads
	                                            json.params[1] = this.saveUploads(collection, id, request.session.data.uploads, json.params[1]);
	                                            
	                                            // clear uploads
	                                            request.session.data.uploads = this.clearUploads(collection, id, request.session.data.uploads);
	                                        }
	                                    }
	                                    
	                                    validationComplete(validationSummaryFind, validationSummaryUpdate);
	                                }.bind(this));
	                            }                
	                        }
	                    }.bind(this));
	                } else if (method == "findAndModify") {
	                    
	                    var validationComplete = function (validationSummaryFind, validationSummaryFindAndModify) { 
	                        if (validationSummaryFind == true && validationSummaryFindAndModify == true) {
	                            var tempId = undefined;
	                            if (json.params != undefined) {
	                                if (json.params._id != undefined) {
                                        tempId = json.params._id;
                                        json.params._id = "###tempId###"; 	                                    
	                                }
	                            }
	                            
	                            // hash the password
	                            if (collection == this.settings.httpAuthCollection) {
	                                if (keys != undefined) {
	                                    var passwordField = (!this.settings.httpAuthPasswordField ? "password" : this.settings.httpAuthPasswordField);
	                                    if (modifiers.indexOf(keys[0]) > -1) {
	                                        if (json.params.update[keys[0]] != undefined) {
	                                            if (json.params.update[keys[0]][passwordField] != undefined) {
	                                                json.params.update[keys[0]][passwordField] = passwordHash.generate(json.params.update[keys[0]][passwordField]);
	                                            }
	                                        }
	                                    } else {
	                                        if (json.params.update != undefined) {
	                                            if (json.params.update[passwordField] != undefined) {
	                                                json.params.update[passwordField] = passwordHash.generate(json.params.update[passwordField]);
	                                            }
	                                        }
	                                    }                
	                                }
	                            }
	                            
	                            if (tempId != undefined) {
	                            
	                                // create the command
	                                command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
	                                command = command.replace("\"###tempId###\"", "this.db.ObjectId(\"" + tempId + "\")");
	                            } else {
	                            
	                                // create the command
	                                command = "this.db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
	                            }
	                        } else {
	                        
	                            validationSummary = [];
	                            
	                            if (validationSummaryFind != true) {
	                                validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
	                            }
	                            
	                            if (validationSummaryFindAndModify != true) {
	                                validationSummary = validationSummary.concat(validationSummary, validationSummaryFindAndModify);
	                            }
	                            
	                            isValid = false;
	                        }
	                        
	                        // execute the response
	                        execute(isValid, validationSummary);
	                    }.bind(this);
	                    
	                    // validate the query
	                    validators.validate(this, collection, "find", action, json.params.query, function (validationSummaryFind) {
	                    
	                        // emit validateFind event
	                        this.emit(collection + "_" + method + "_" + action + "_validateFind", { "currentTarget": this, "params": json.params.query});
	                        
	                        // filter the query
	                        json.params.query = filters.filter(this.settings, collection, "find", action, json.params.query, "in");
	                        
	                        // emit filterFind event
	                        this.emit(collection + "_" + method + "_" + action + "_filterFind", { "direction": "in", "currentTarget": this, "params": json.params.query});
	                        
	                        // filter the update and handle uploads
	                        var keys = Object.keys(json.params.update);
	                        if (keys != undefined) {
	                        
	                            if (modifiers.indexOf(keys[0]) > -1) {
	                            
	                                // validate the update
	                                validators.validate(this, collection, "findAndModify", action, json.params.update[keys[0]], function (validationSummaryFindAndModify) {
	                                
	                                    // emit validate event
	                                    this.emit(collection + "_" + method + "_" + action + "_validate", { "currentTarget": this, "params": json.params.update[keys[0]]});
	                                    
	                                    if (validationSummaryFindAndModify == true) {
	                                
	                                        // filter the update                 
	                                        json.params.update[keys[0]] = filters.filter(this.settings, collection, "findAndModify", action, json.params.update[keys[0]], "in");
	                                        
	                                        // emit filter event
	                                        this.emit(collection + "_" + method + "_" + action + "_filter", { "direction": "in", "currentTarget": this, "params": json.params.update[keys[0]]});
	                                        
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
	                                validators.validate(this, collection, "findAndModify", action, json.params.update, function (validationSummaryFindAndModify) {
	                                    
	                                    // emit validate event
	                                    this.emit(collection + "_" + method + "_" + action + "_validate", { "currentTarget": this, "params": json.params.update});
	                                    
	                                    if (validationSummaryFindAndModify == true) {
	                                    
	                                        // filter the update
	                                        json.params.update = filters.filter(this.settings, collection, "findAndModify", action, json.params.update, "in");
	                                        
	                                        // emit filter event
	                                        this.emit(collection + "_" + method + "_" + action + "_filter", { "direction": "in", "currentTarget": this, "params": json.params.update});
	                                        
	                                        // save and clear uploads
	                                        if (json.params.query._id !== undefined) {
	                                        
	                                            var id;
	                                            if (json.params.query._id.indexOf("ObjectId") > -1) {
	                                                id = eval("this.db." + jjson.params.query._id);
	                                            } else {
	                                                id = json.params.query._id;
	                                            }
	                                            
	                                            // save uploads
	                                            json.params.update = this.saveUploads(collection, id, request.session.data.uploads, json.update);
	                                            
	                                            // clear uploads
	                                            request.session.data.uploads = this.clearUploads(collection, id, request.session.data.uploads);
	                                        }
	                                    }
	                                    
	                                    validationComplete(validationSummaryFind, validationSummaryFindAndModify);
	                                
	                                }.bind(this));
	                            }                
	                        }
	                    }.bind(this));
	                    
	                } else if (method == "group") {
	                
    	                var validationComplete = function (validationSummary) { 
    	                    if (validationSummary === true) {
    	                        var tempId = undefined;
    	                        if (json.params != undefined) {
    	                            if (json.params.cond != undefined) {
        	                            if (json.params.cond._id != undefined) {
    	                                    tempId = json.params.cond._id;
    	                                    json.params.cond._id = "###tempId###"; 
        	                            }
        	                        }
    	                        }
    	                        
    	                        // hash the password
    	                        if (collection == this.settings.httpAuthCollection) {
	                                var passwordField = (!this.settings.httpAuthPasswordField ? "password" : this.settings.httpAuthPasswordField);
                                    if (json.params.cond != undefined) {
                                        if (json.params.cond[passwordField] != undefined) {
                                            json.params.cond[passwordField] = passwordHash.generate(json.params.cond[passwordField]);
	                                    }
	                                }                
	                            }
    	                        
    	                        if (tempId != undefined) {
    	                        
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
    	                validators.validate(this, collection, "find", action, json.params.query, function (validationCondition) {
    	                
    	                    // emit validateFind event
    	                    this.emit(collection + "_" + method + "_" + action + "_validate", { "currentTarget": this, "params": json.params.cond});
    	                    
    	                    // filter the query
    	                    json.params.cond = filters.filter(this.settings, collection, "group", action, json.params.cond, "in");
    	                    
    	                    // emit filterFind event
    	                    this.emit(collection + "_" + method + "_" + action + "_filter", { "direction": "in", "currentTarget": this, "params": json.params.cond});
    	                    
    	                    // finish validating, filtering, then execute
                            validationComplete(validationCondition);
                            
    	                }.bind(this));
    	                
    	            } else if (method == "mapReduce") {
    	            
    	                var validationComplete = function (validationSummary) { 
    	                    if (validationSummary === true) {
    	                        var tempId = undefined;
    	                        if (json.params != undefined) {
    	                            if (json.params.query != undefined) {
    	                                if (json.params.query._id != undefined) {
	                                        tempId = json.params.query._id;
	                                        json.params.query._id = "###tempId###";
    	                                }
    	                            }
    	                        }
    	                        
    	                        // hash the password
    	                        if (collection == this.settings.httpAuthCollection) {
    	                            var passwordField = (!this.settings.httpAuthPasswordField ? "password" : this.settings.httpAuthPasswordField);
    	                            if (json.params.query != undefined) {
    	                                if (json.params.query[passwordField] != undefined) {
    	                                    json.params.query[passwordField] = passwordHash.generate(json.params.query[passwordField]);
    	                                }
    	                            }                
    	                        }
    	                        
    	                        if (tempId != undefined) {
    	                        
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
    	                validators.validate(this, collection, "find", action, json.params.query, function (validationCondition) {
    	                
    	                    // emit validateFind event
    	                    this.emit(collection + "_" + method + "_" + action + "_validate", { "currentTarget": this, "params": json.params.query});
    	                    
    	                    // filter the query
    	                    json.params.query = filters.filter(this.settings, collection, "group", action, json.params.query, "in");
    	                    
    	                    // emit filterFind event
    	                    this.emit(collection + "_" + method + "_" + action + "_filter", { "direction": "in", "currentTarget": this, "params": json.params.query});
    	                    
    	                    // finish validating, filtering, then execute
    	                    validationComplete(validationCondition);
    	                    
    	                }.bind(this));
    	                
    	            
    	            
	                } else {
	                    
	                    // validate
	                    validators.validate(this, collection, method, action, json.params, function (validationSummary) {
	                        
	                        // emit validate event
	                        this.emit(collection + "_" + method + "_" + action + "_validate", { "currentTarget": this, "params": json.params});
	                        
	                        if (validationSummary == true) {
	                            
	                            // filter the params
	                            json.params = filters.filter(this.settings, collection, method, action, json.params, "in");
	                            
	                            // emit filtered event
	                            this.emit(collection + "_" + method + "_" + action + "_filter", { "direction": "in", "currentTarget": this, "params": json.params});
	                            
	                            var tempId = undefined;
	                            if (json.params != undefined) {
	                                if (json.params._id != undefined) {
                                        tempId = json.params._id;
                                        json.params._id = "###tempId###";
	                                }
	                            }
	                            
	                            // hash the password
	                            if (collection == this.settings.httpAuthCollection) {
	                                if (json.params != undefined) {
	                                    var passwordField = (!this.settings.httpAuthPasswordField ? "password" : this.settings.httpAuthPasswordField);
	                                    if (json.params[passwordField] != undefined) {
	                                        json.params[passwordField] = passwordHash.generate(json.params[passwordField]);
	                                    }
	                                }
	                            }
	                            
	                            if (tempId != undefined) {
	                            
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
	                    }.bind(this));
	                }
	            
	            } else {
	            
	                // method not allowed, return with error and validation summary
	                this.processError(request, response, -32601, "Procedure not found.", json.id);
	                return;
	            }
	        }.bind(this));
		} catch (error) {

            // throw error to console
            console.log(error);
        
            // Internal error occurred, create internal error response
            this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
		}
    }

    this.processPost = function (request, response) {
    
        if (request.headers["content-type"].indexOf("multipart/form-data") > -1) {
            var form = new formidable.IncomingForm();
            form.parse(request, function(error, fields, files) {
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
                    roles.check(this, fields.collection, fields.method, fields.action, request.session.data.user, null, function (allowed) {
                        if (allowed) {
                            
                            // filter the params
                            files = filters.filter(this.settings, fields.collection, fields.method, fields.action, files, "in");
                            
                            // set id to new if not defined    
                            if (fields._id ==="" || fields._id === undefined) {
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
                                
                                // write to log
                                console.log(request.session.id + ": uploaded a file (" + files[keys[0]].path + ")"); 
                                
                                // respond and show the final step
                                this.processUpload(request, response, fields.collection, field, 3);
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
            }.bind(this));
        
        } else {
        
            // load chunks into data
            var data = "";
            request.on("data", function (chunk) {
                data += chunk;
            }.bind(this));
            
            // chucks have loaded, continue the request
            request.on("end", function () {
            
                var json = undefined;
                try {
                    
                    // parse data to json
                    json = JSON.parse(data);
                
                } catch (error) {
                    
                    // Internal error occurred, create internal error response
                    this.processError(request, response, -32700, "Parse error.", undefined);
                    return;
                }
                
                try {
                    var pathParts = request.url.split("/");
                    var collection = pathParts[pathParts.length - 1];
                    if (collection != undefined) {
                        if (collection == this.settings.httpAuthCollection && json.method == "login") {
                        
                            // process login request
                            this.processLogin(request, response, json);
                            
                        } else if (collection == this.settings.httpAuthCollection && json.method == "logout") {
                        
                            // process logout request
                            this.processLogout(request, response, json);
                        
                        } else if (collection == this.settings.httpAuthCollection && json.method == "isAuthenticated") {
                        
                            // process authentication status request
                            this.processIsAuthenticated(request, response, json);
                        
                        } else if (collection == this.settings.httpAuthCollection && json.method == "isInRole") {
                        
                            // process authentication status request
                            this.processIsInRole(request, response, json);
                            
                        } else if (collection == this.settings.httpAuthCollection && json.method == "changePassword") {
                        
                            // process authentication status request
                            this.processChangePassword(request, response, json);
                            
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
                        throw error;
                    } else {
                    
                        // throw error to console
                        console.log(error);
                    
                        // Internal error occurred, create internal error response
                        this.processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                        return;
                    }
                }
            }.bind(this));
        }
    }

    this.processUpload = function (request, response, collection, field, step) {
        
        // respond to request with error
        response.writeHead(302, {"Location": "/upload.html?collection=" + collection + "&field=" + field + "&step=" + step});
        response.end();
        return;
    }

    this.processGet = function (request, response) {
    
        var uri = url.parse(request.url).pathname;
        if (uri.indexOf("settings.json", 0) < 0 && 
            uri.indexOf("server.js", 0) < 0 && 
            uri.indexOf("lib/", 0) < 0 && 
            uri.indexOf("node_modules/", 0) < 0 &&
            uri.indexOf(this.settings.privateKey, 0) < 0 &&
            uri.indexOf(this.settings.certificate, 0) < 0) {
            
            if ((uri.indexOf("index.html") === 1 && !this.settings.isDebug) || 
                (uri === "/" && !this.settings.isDebug) ) {
                response.writeHead(404, {"Content-Type": "text/plain" });
                response.write("404 Not Found\n");
                response.end();
            } else {
                
                var filename = libpath.join(this.path, uri);
                libpath.exists(filename, function (exists) {
                    if (!exists) {
                        libpath.exists("./lib/" + filename + ".js", function (requireExists) {
                            if (!requireExists) {
                                response.writeHead(404, {"Content-Type": "text/plain" });
                                response.write("404 Not Found\n");
                                response.end();
                                return;
                            }
                            
                            try {
                                var file = require("./lib/" + filename + ".js");   
                                if (file.render !== undefined) {
                                    file.render(this, request, response);
                                    return;
                                } else  {
                                    response.writeHead(404, {"Content-Type": "text/plain" });
                                    response.write("404 Not Found\n");
                                    response.end();
                                    return;                        
                                }
                            } catch (error) {
                                response.writeHead(500, {"Content-Type": "text/plain" });
                                response.write("500 Internal Server Error\n");
                                response.end();
                            }
                        }.bind(this));
                        return;
                    }
                
                    if (fs.statSync(filename).isDirectory()) {
                        filename += "/index.html";
                    }
                
                    fs.readFile(filename, "binary", function (error, file) {
                        if (error) {
                            response.writeHead(500, {"Content-Type": "text/plain" });
                            response.write(error + "\n");
                            response.end();
                            return;
                        } else {
                            var type = mime.lookup(filename);
                            response.writeHead(200, { "Content-Type": type });
                            response.write(file, "binary");
                            response.end();
                        }
                    }.bind(this));
                }.bind(this));
            }
        } else {
            response.writeHead(404, {"Content-Type": "text/plain" });
            response.write("404 Not Found\n");
            response.end();
        }
    }

    this.processResult = function (request, response, result, id) {
    
        var json = {
            "jsonrpc": "2.0", 
            "result": result, 
            "id": id
        };
        
        response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin" : "*"});
        response.end(JSON.stringify(json));
    }

    this.processError = function (request, response, errorCode, errorMessage, id, validationSummary) {
          // Internal error occurred, create internal error response
        var json = {
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
            
        response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin" : "*" });
        response.write(JSON.stringify(json));
        response.end();	
    }

    this.getUploads = function (collection, _id, uploads) {
        var files = undefined;
        if (uploads !== undefined) {
            if (uploads[collection] !== undefined) {
                if (uploads[collection][_id] !== undefined) {
                    files = uploads[collection][_id];
                }
            }
        }
        return files;
    }

    this.hasUploads = function (collection, _id, uploads) {
        var hasUploads = false;
        if (uploads !== undefined) {
            if (uploads[collection] !== undefined) {
                if (uploads[collection][_id] !== undefined) {
                    hasUploads = true;
                }
            }
        }
        return hasUploads;
    }

    this.saveUploads = function (collection, _id, uploads, params, isNew) {
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
                        if (file != undefined) {
                            
                            // get the extension
                            var extension = file.name.split(".").pop();
                            
                            // create the final path
                            var directory = "uploads/" + collection + "/" + _id + "/";
                            var path = directory + keys[i] + "." + extension
                            var root = "./";
                            if (this.settings.paths !== undefined) {
                                if (this.settings.paths.uploads !== undefined) {
                                    root = this.settings.paths.uploads;
                                }
                            }
                            
                            // make the directory
                            fs.mkdirSync(root + directory, 0755, true);
                            
                            // rename the file
                            fs.renameSync(file.path,  this.settings.paths.uploads + path);
                        
                            // update the field 
                            params[keys[i]] = path;
                        }
                    }
                }
            }
        }
        
        return params;
    }

    this.clearUploads = function (collection, _id, uploads) {
        if (uploads !== undefined) {
            if (uploads[collection] !== undefined) {
                if (uploads[collection][_id] !== undefined) {
                    delete uploads[collection][_id];
                }
            }
        }
        return uploads;
    }
};

util.inherits(MongoRpc, events.EventEmitter);

var mongoRpc = new MongoRpc();
mongoRpc.init();


