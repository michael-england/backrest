var mongo = require("mongojs");
var http = require("http");
var session = require('./lib/core').session;
var libpath = require("path");
var fs = require("fs");
var url = require("url");
var mime = require("mime");
var validators = require("./lib/validators");
var filters = require("./lib/filters");
var settings = undefined;
var collections = undefined;
var db = undefined;
var path = ".";

var settingsFilename = libpath.join(path, "settings.json");
libpath.exists(settingsFilename, libpathExists);

function libpathExists(exists) {
    if (exists) {
        fs.readFile(settingsFilename, "binary", fsReadFile);
    } else {    

        // handle error
        console.log("settings.json file does not exist.");

        // exit the application    		
        process.exit();	
    }
}

function fsReadFile(error, file) {
    if (!error) {
        try
        {
            // parse file to settings object
            settings = JSON.parse(file);
            
            // push setting's collection to collections name array
            collections = Object.keys(settings.collections);
            
            // start the http server
            httpStart();    		
            
            // connect to the database
            db = mongo.connect(settings.databaseUrl, collections);
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

function httpStart() {
    http.createServer(function (request, response) {
        session (request, response, function(request, response) {
            if (request.method == "POST") {	
                
                // process POST request
                processPost(request, response);
                  
            } else {
            
                // process with the requested file
                processGet(request, response);
            } 
        });   
    }).listen(settings.httpPort);
    
    console.log("HTTP Server running on port " + settings.httpPort + ".");
}

function processLogin (request, response, json) {

    var isValid = true;
        
    // filter the params
    json.params = filters.filter(settings, settings.httpAuthCollection, "findOne", "default", json.params, "in");
    
    // validate
    var validationSummary = validators.validate(settings, settings.httpAuthCollection, "findOne", "default", json.params);
    if (validationSummary !== true || 
        !json.params[(!settings.httpAuthUsernameField ? "email" : settings.httpAuthUsernameField)] ||
        !json.params[(!settings.httpAuthPasswordField ? "password" : settings.httpAuthPasswordField)]) {
        isValid = false;
    }
    
    if (isValid) {	
        
        // the login response
        var dbLoginResult = function (error, result) {
            if(error) {
            
                  // collection not provided, create procedure not found response
                processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                
            } else {
                
                if (!result) {
                
                      // collection not provided, create procedure not found response
                    processError(request, response, -32000, "Invalid credentials.", json.id);
                    
                } else {
                
                    // change the authenticated user
                    request.session.data.user = result._id;
                
                    // log authentication change
                    console.log("Session " + request.session.id + " is now logged in as " + result[(!settings.httpAuthUsernameField ? settings.httpAuthUsernameField : "email")]);
                
                    // filter out return values
                    result = filters.filter(settings, settings.httpAuthCollection, "findOne", "default", result, "out");
                    
                    // return result
                    processResult (request, response, result, json.id);
                    return;
                }
            }
        };
        
        // build the command		
        var command = "db." + settings.httpAuthCollection + ".findOne(" + JSON.stringify(json.params) + ", dbLoginResult);";
        
        // write command to log
        console.log(request.session.id + ": " + command);
    
        // execute command
        eval(command)
    } else {
        
        // validation not passed, return with error and validation summary
        processError(request, response, -32000, "Invalid credentials.", json.id);
        return;
    }
}

function processLogout (request, response, json) {

    // change the authenticated user
    request.session.data.user = "Guest";

    // log authentication change
    console.log("Session " + request.session.id + " is now logged in as " + request.session.data.user);
    
    // return result
    processResult (request, response, "Logout successful.", json.id);
    return;
}

function processIsAuthenticated (request, response, json) {

    // change the authenticated user
    var isAuthenticated = false;
    
    if (request.session.data.user != "Guest") {
        isAuthenticated = true;
    }
    
    // return result
    processResult (request, response, isAuthenticated, json.id);
    return;
}

function processRpc (request, response, json, collection) {
    var isValid = true;
    var command = undefined;
    var validationSummary = undefined;
    var method = json.method;
    var action = "default";
    var allowed = false;
    
    if (method.indexOf("/") > -1) {
        action = method.substring(method.indexOf("/"));
    }
    
    if (settings.collections[collection] != undefined) {
        if (settings.collections[collection][method] != undefined) {
            if (settings.collections[collection][method].enabled == true) {
                 if (settings.collections[collection][method][action] != undefined) {
                     allowed = true;
                 }
            }   
        }
    }   
            
    if (allowed) {
        if (method == "update") {
            
            // filter the query
            json.params[0] = filters.filter(settings, collection, "find", action, json.params[0], "in");
            
            // filter the update
            var keys = Object.keys(json.params[1]);
            var modifiers = [ "$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];
            if (keys != undefined) {
                if (modifiers.indexOf(keys[0]) > 0) {
                    json.params[1][keys[0]] = filters.filter(settings, collection, "update", action, json.params[1][keys[0]], "in");
                } else {
                    json.params[1] = filters.filter(settings, collection, "update", action, json.params[1], "in");
                }                
            }
            
            // validate
            var validationSummaryFind = validators.validate(settings, collection, "find", action, json.params[0]);
            var validationSummaryFindAndModify = validators.validate(settings, collection, "findAndModify", action, json.params[1]);
            if (validationSummaryFind == true && validationSummaryFindAndModify == true) {
                
                var params = "";
                for (var i = 0; i < json.params.length; i++) {
                    if (i == 0) {
                        var tempId = undefined;
                        if (json.params[i] != undefined) {
                            if (json.params[i]._id != undefined) {
                                if (json.params[i]._id.indexOf("ObjectId") > -1) {
                                    tempId = json.params[i]._id;
                                    json.params[i]._id = "###tempId###"; 
                                }
                            }
                        }
                    
                        if (tempId != undefined) {
                        
                            // add the parameters
                            params += JSON.stringify(json.params[i]);
                            params = params.replace("\"###tempId###\"", "db." + tempId);
                        } else {
                        
                            // add the parameters
                            params += JSON.stringify(json.params[i]);
                        }
                    } else {
                    
                        var tempId = undefined;
                        if (json.params[i]._id != undefined) {
                            if (json.params[i]._id.indexOf("ObjectId") > -1) {
                                tempId = json.params[i]._id;
                                json.params[i]._id = "###tempId###"; 
                            }
                        }
                    
                        if (tempId != undefined) {
                        
                            // add the parameters
                            params += ", " + JSON.stringify(json.params[i]);
                            params = params.replace("\"###tempId###\"", "db." + tempId);
                        } else {
                        
                            // add the parameters
                            params += ", " + JSON.stringify(json.params[i]);
                        }
                    }
                }
                
                // create the command
                command = "db." + collection + "." + method + "(" + params + ", dbResult);";
                
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
        } else if (method == "findAndModify") {
            
            // filter the query
            json.params.query = filters.filter(settings, collection, "find", action, json.params.query, "in");
            
            // filter the update
            var keys = Object.keys(json.params.update);
            var modifiers = [ "$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];
            if (keys != undefined) {
                if (modifiers.indexOf(keys[0]) > 0) {
                    json.params.update[keys[0]] = filters.filter(settings, collection, "update", action, json.params.update[keys[0]], "in");
                } else {
                    json.params.update = filters.filter(settings, collection, "update", action, json.params.update, "in");
                }                
            }
            
            // validate
            var validationSummaryFind = validators.validate(settings, collection, "find", action, json.params.query);
            var validationSummaryFindAndModify = validators.validate(settings, collection, "findAndModify", action, json.params.update);
            if (validationSummaryFind == true && validationSummaryFindAndModify == true) {
                
                var tempId = undefined;
                if (json.params != undefined) {
                    if (json.params._id != undefined) {
                        if (json.params._id.indexOf("ObjectId") > -1) {
                            tempId = json.params._id;
                            json.params._id = "###tempId###"; 
                        }
                    }
                }
                
                if (tempId != undefined) {
                
                    // create the command
                    command = "db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                    command = command.replace("\"###tempId###\"", "db." + tempId);
                } else {
                
                    // create the command
                    command = "db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
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
        } else {
            
            // filter the params
            json.params = filters.filter(settings, collection, method, action, json.params, "in");
            
            // validate
            validationSummary = validators.validate(settings, collection, method, action, json.params);
    
            if (validationSummary == true) {
                
                var tempId = undefined;
                if (json.params != undefined) {
                    if (json.params._id != undefined) {
                        if (json.params._id.indexOf("ObjectId") > -1) {
                            tempId = json.params._id;
                            json.params._id = "###tempId###"; 
                        }
                    }
                }
                
                if (tempId != undefined) {
                
                    // create the command
                    command = "db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                    command = command.replace("\"###tempId###\"", "db." + tempId);
                } else {
                
                    // create the command
                    command = "db." + collection + "." + method + "(" + JSON.stringify(json.params) + ", dbResult);";
                }
                
            } else {
            
                isValid = false;
            }
        }
    
        if (isValid) {
    
            var dbResult = function (error, result) {
                if(error) {
                
                    // collection not provided, create procedure not found response
                    processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                    return;
                } else {
        
                    // filter out return values
                    result = filters.filter(settings, collection, method, action, result, "out");
                    
                    // return result
                    processResult (request, response, result, json.id);
                    return;
                }
            };
            
            // write command to log
            console.log(request.session.id + ": " + command);
            
            // execute command
            eval(command);
        } else {
    
            // validation not passed, return with error and validation summary
            processError(request, response, -32603, "Internal JSON-RPC error.", json.id, validationSummary);
            return;
        }
    } else {
    
        // method not allowed, return with error and validation summary
        processError(request, response, -32601, "Procedure not found.", json.id);
        return;
    }
}

function processPost (request, response) {

    // load chunks into data
    var data = "";
    request.on("data", function (chunk) {
        data += chunk;
    });
    
    // chucks have loaded, continue the request
    request.on("end", function () {
        
        var json = undefined;
        try {
            
            // parse data to json
            json = JSON.parse(data);
        
        } catch (error) {
            
            // Internal error occurred, create internal error response
            processError(request, response, -32700, "Parse error.", undefined);
            return;
        }
        
        try {
            var pathParts = request.url.split("/");
            var collection = pathParts[pathParts.length - 1];
            if (collection != undefined) {
                if (collection == "login") {
                
                    // process login request
                    processLogin(request, response, json);
                    
                } else if (collection == "logout") {
                
                    // process logout request
                    processLogout(request, response, json);
                
                } else if (collection == "isAuthenticated") {
                
                    // process authentication status request
                    processIsAuthenticated(request, response, json);
                    
                } else {
                
                    // process logout request
                    processRpc(request, response, json, collection);
                }
            } else {
            
                // collection not provided, create procedure not found response
                processError(request, response, -32601, "Procedure not found.", json.id);
                return;
            }
        } catch (error) {
        
            if (settings.isDebug) {
                throw error;
            } else {
            
                // throw error to console
                console.log(error);
            
                // Internal error occurred, create internal error response
                processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                return;
            }
        }
    });
}

function processGet (request, response) {

    var uri = url.parse(request.url).pathname;
    if (uri.indexOf("settings.json", 0) < 0) {
        var filename = libpath.join(path, uri);
        libpath.exists(filename, function (exists) {
            if (!exists) {
                response.writeHead(404, {"Content-Type": "text/plain" });
                response.write("404 Not Found\n");
                response.end();
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
            });
        });
    } else {		    
        response.writeHead(404, {"Content-Type": "text/plain" });
        response.write("404 Not Found\n");
        response.end();
    }
}

function processResult (request, response, result, id) {

    var json = {
        "jsonrpc": "2.0", 
        "result": result, 
        "id": id
    };
    
    response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin" : "*"});
    response.end(JSON.stringify(json));
}

function processError (request, response, errorCode, errorMessage, id, validationSummary) {
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

