var mongo = require("mongojs");
var http = require("http");
var session = require('./lib/core').session;
var libpath = require("path");
var fs = require("fs");
var url = require("url");
var mime = require("mime");
var validators = require("./lib/validators");
var filters = require("./lib/filters");
var settings = null;
var collections = null;
var db = null;
var path = ".";
//var manager = new Manager();

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
    json.params = filters.filter(settings, settings.httpAuthCollection, "findOne", json.params, "in");
    
    // validate
    var validationSummary = validators.validate(settings, settings.httpAuthCollection, "findOne", json.params);
    if (validationSummary !== true) {
        isValid = false;
    }
    
    if (isValid) {	
        
        // the login response
        var dbLoginResult = function (error, result) {
            if(error) {
            
                  // collection not provided, create procedure not found response
                processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                
            } else {
                
                // change the authenticated user
                request.session.data.user = result.email;
            
                // log authentication change
                console.log("Session " + request.session.id + " is now logged in as " + request.session.data.user);
            
                // filter out return values
                result = filters.filter(settings, settings.httpAuthCollection, "findOne", result, "out");
                
                // return result
                processResult (request, response, result, json.id);
                return;
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
        processError(request, response, -32603, "Internal JSON-RPC error.", id, validationSummary);
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
    
    if (settings.collections[collection][json.method] != undefined) {
        if (settings.collections[collection][json.method].enabled == true) {
            if (json.method == "update") {
                
                // filter the query
                json.params[0] = filters.filter(settings, collection, "find", json.params[0], "in");
                
                // filter the update
                json.params[1] = filters.filter(settings, collection, "update", json.params[1], "in");
        
                // validate
                var validationSummaryFind = validators.validate(settings, collection, "find", json.params[0]);
                var validationSummaryFindAndModify = validators.validate(settings, collection, "findAndModify", json.params[1]);
                if (validationSummaryFind == true && validationSummaryFindAndModify == true) {
                    
                    var params = "";
                    for (var i = 0; i < json.params.length; i++) {
                        if (i == 0) {
                            params += JSON.stringify(json.params[i]);
                        } else {
                            params += ", " + JSON.stringify(json.params[i]);
                        }
                    }
                    
                    // create the command
                    command = "db." + collection + "." + json.method + "(" + params + ", dbResult);";
                    
                } else {
                
                    validationSummary = new Array();
                    
                    if (validationSummaryFind != true) {
                        validationSummary = validationSummary.concat(validationSummary, validationSummaryFind);
                    }
                    
                    if (validationSummaryFindAndModify != true) {
                        validationSummary = validationSummary.concat(validationSummary, validationSummaryFindAndModify);
                    }
                    
                    isValid = false;
                }
            } else if (json.method == "findAndModify") {
                
                // filter the query
                json.params.query = filters.filter(settings, collection, "find", json.params.query, "in");
                
                // filter the update
                json.params.update = filters.filter(settings, collection, "update", json.params.update, "in");
                
                // validate
                var validationSummaryFind = validators.validate(settings, collection, "find", json.params.query);
                var validationSummaryFindAndModify = validators.validate(settings, collection, "findAndModify", json.params.update);
                if (validationSummaryFind == true && validationSummaryFindAndModify == true) {
                
                    // create the command
                    command = "db." + collection + "." + json.method + "(" + JSON.stringify(json.params) + ", dbResult);";
                } else {
                
                    validationSummary = new Array();
                    
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
                json.params = filters.filter(settings, collection, json.method, json.params, "in");
                
                // validate
                validationSummary = validators.validate(settings, collection, json.method, json.params);
        
                if (validationSummary == true) {
                    
                    // create the command
                    command = "db." + collection + "." + json.method + "(" + JSON.stringify(json.params) + ", dbResult);";
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
                        result = filters.filter(settings, collection, json.method, result, "out");
                        
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
        
        var json = null;
        var method = null;
        var id = null;
        try {
            
            // parse data to json
            json = JSON.parse(data);
            
            method = json.method;
            id = json.id;
        
        } catch (error) {
            
            // Internal error occurred, create internal error response
            processError(request, response, -32700, "Parse error.", null);
            return;
        }
        
        try {
            var pathParts = request.url.split("/");
            var collection = pathParts[pathParts.length - 1];
            if (collection != null && collection != undefined) {
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
                processError(request, response, -32601, "Procedure not found.", id);
                return;
            }
        } catch (error) {
        
            // throw error to console
            console.log(error);
        
            // Internal error occurred, create internal error response
            processError(request, response, -32603, "Internal JSON-RPC error.", id);
            return;
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
      // Internal error occured, create internal error response
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

