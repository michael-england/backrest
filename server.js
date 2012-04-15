var mongo = require("mongojs");
var http = require("http");
var session = require('./lib/core').session;
var libpath = require("path");
var fs = require("./lib/fs");
var url = require("url");
var mime = require("mime");
var passwordHash = require("password-hash");
var formidable = require("formidable");
var validators = require("./lib/validators");
var filters = require("./lib/filters");
var roles = require("./lib/roles");
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
    json.params = filters.filter(settings, settings.httpAuthCollection, "login", "default", json.params, "in");
    
    // validate
    var validationSummary = validators.validate(settings, settings.httpAuthCollection, "login", "default", json.params);
    if (validationSummary !== true) {
        isValid = false;
    }
    
    if (isValid) {	
        
        // temporarily save password and remove it from params
        var passwordField = (!settings.httpAuthPasswordField ? "password" : settings.httpAuthPasswordField);
        var password = json.params[passwordField];
        json.params[passwordField] = undefined;
        
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
                
                    // check password
                    if (passwordHash.verify(password, result[passwordField])) {
                    
                        // log authentication change
                        console.log("Session " + request.session.id + " is now logged in as " + result[(!settings.httpAuthUsernameField ? "email" : settings.httpAuthUsernameField)]);
                    
                        // filter out return values
                        result = filters.filter(settings, settings.httpAuthCollection, "login", "default", result, "out");
                    
                        // change the authenticated user
                        request.session.data.user = result;
                        
                        // return result
                        processResult (request, response, result, json.id);
                        return;
                    } else {
                        
                        // collection not provided, create procedure not found response
                        processError(request, response, -32000, "Invalid credentials.", json.id);
                    }
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
        processError(request, response, -32000, "Invalid credentials.", json.id, validationSummary);
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
    
    // set action to default then check for action in method
    var action = "default";
    if (method.indexOf("/") > -1) {
        action = method.substring(method.indexOf("/"));
    }
    
    // check roles
    var allowed = roles.check(settings, collection, method, action, request.session.data.user);
    if (allowed) {
        if (method == "update") {
            
            // validate
            var validationSummaryFind = validators.validate(settings, collection, "find", action, json.params[0]);
            var validationSummaryFindAndModify = validators.validate(settings, collection, "findAndModify", action, json.params[1]);
            if (validationSummaryFind == true && validationSummaryFindAndModify == true) {
                
                // filter the query
                json.params[0] = filters.filter(settings, collection, "find", action, json.params[0], "in");
                
                // filter the update and handle uploads
                var keys = Object.keys(json.params[1]);
                var modifiers = [ "$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];
                if (keys != undefined) {
                    if (modifiers.indexOf(keys[0]) > -1) {
                    
                        json.params[1][keys[0]] = filters.filter(settings, collection, "update", action, json.params[1][keys[0]], "in");
                        
                        // save and clear uploads
                        if (json.params[0]._id !== undefined) {
                        
                            // save uploads
                            json.params[1][keys[0]] = saveUploads(collection, json.params[0]._id, request.session.data.uploads, json.params[1][keys[0]]);
                            
                            // clear uploads
                            request.session.data.uploads = clearUploads(collection, json.params[0]._id, request.session.data.uploads);
                        }
                    } else {
                    
                    
                        json.params[1] = filters.filter(settings, collection, "update", action, json.params[1], "in");
                        
                        // save and clear uploads
                        if (json.params[0]._id !== undefined) {
                        
                            // save uploads
                            json.params[1] = saveUploads(collection, json.params[0]._id, request.session.data.uploads, json.params[1]);
                            
                            // clear uploads
                            request.session.data.uploads = clearUploads(collection, json.params[0]._id, request.session.data.uploads);
                        }
                    }                
                }
            
                var params = "";
                for (var i = 0; i < json.params.length; i++) {
                    var tempId = undefined;
                    if (json.params[i] != undefined) {
                        if (json.params[i]._id != undefined) {
                            if (json.params[i]._id.indexOf("ObjectId") > -1) {
                                tempId = json.params[i]._id;
                                json.params[i]._id = "###tempId###"; 
                            }
                        }
                    }
                    
                    // hash the password
                    if (collection == settings.httpAuthCollection) {
                        if (json.params[i] != undefined) {
                            var keys = Object.keys(json.params[1]);
                            var modifiers = [ "$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];
                            if (keys != undefined) {
                                var passwordField = (!settings.httpAuthPasswordField ? "password" : settings.httpAuthPasswordField);
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
                        if (tempId != undefined) {
                        
                            // add the parameters
                            params += JSON.stringify(json.params[i]);
                            params = params.replace("\"###tempId###\"", "db." + tempId);
                        } else {
                        
                            // add the parameters
                            params += JSON.stringify(json.params[i]);
                        }
                    } else {
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
            
            // validate
            var validationSummaryFind = validators.validate(settings, collection, "find", action, json.params.query);
            var validationSummaryFindAndModify = validators.validate(settings, collection, "findAndModify", action, json.params.update);
            if (validationSummaryFind == true && validationSummaryFindAndModify == true) {
                
                // filter the query
                json.params.query = filters.filter(settings, collection, "find", action, json.params.query, "in");
                
                // filter the update and handle uploads
                var keys = Object.keys(json.params.update);
                var modifiers = [ "$inc", "$set", "$unset", "$push", "$pushAll", "$addToSet", "$each", "$pop", "$pull", "$pullAll", "$rename", "$bit"];
                if (keys != undefined) {
                    if (modifiers.indexOf(keys[0]) > -1) {
                        
                        
                        json.params.update[keys[0]] = filters.filter(settings, collection, "update", action, json.params.update[keys[0]], "in");
                    
                        // save and clear uploads
                        if (json.params.query._id !== undefined) {
                        
                            // save uploads
                            json.params.update[keys[0]] = saveUploads(collection, json.params.query._id, request.session.data.uploads, json.update[keys[0]]);
                            
                            // clear uploads
                            request.session.data.uploads = clearUploads(collection, json.params.query._id, request.session.data.uploads);
                        }
                    } else {
                        json.params.update = filters.filter(settings, collection, "update", action, json.params.update, "in");
                        
                        // save and clear uploads
                        if (json.params.query._id !== undefined) {
                        
                            // save uploads
                            json.params.update = saveUploads(collection, json.params.query._id, request.session.data.uploads, json.update);
                            
                            // clear uploads
                            request.session.data.uploads = clearUploads(collection, json.params.query._id, request.session.data.uploads);
                        }
                    }                
                }
                
                var tempId = undefined;
                if (json.params != undefined) {
                    if (json.params._id != undefined) {
                        if (json.params._id.indexOf("ObjectId") > -1) {
                            tempId = json.params._id;
                            json.params._id = "###tempId###"; 
                        }
                    }
                }
                
                // hash the password
                if (collection == settings.httpAuthCollection) {
                    if (keys != undefined) {
                        var passwordField = (!settings.httpAuthPasswordField ? "password" : settings.httpAuthPasswordField);
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
            
            // validate
            validationSummary = validators.validate(settings, collection, method, action, json.params);
            if (validationSummary == true) {
                
                // filter the params
                json.params = filters.filter(settings, collection, method, action, json.params, "in");
                    
                var tempId = undefined;
                if (json.params != undefined) {
                    if (json.params._id != undefined) {
                        if (json.params._id.indexOf("ObjectId") > -1) {
                            tempId = json.params._id;
                            json.params._id = "###tempId###"; 
                        }
                    }
                }
                
                // hash the password
                if (collection == settings.httpAuthCollection) {
                    if (json.params != undefined) {
                        var passwordField = (!settings.httpAuthPasswordField ? "password" : settings.httpAuthPasswordField);
                        if (json.params[passwordField] != undefined) {
                            json.params[passwordField] = passwordHash.generate(json.params[passwordField]);
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
            
            
                    var sendResponse = true;
                
                    // save and clear uploads
                    if (result != undefined) {
                        if (json.method.split("/")[0] == "save" && hasUploads(collection, "new", request.session.data.uploads)) {
                            
                            console.log(request.session.data.uploads);
                            
                            // create update object
                            var uploads = getUploads(collection, "new", request.session.data.uploads);
                            
                            console.log(uploads);
                            if (uploads != undefined) {
                            
                                console.log("here1");
    
                                // copy keys to update object
                                var keys = Object.keys(uploads);    
                                var update = {};
                                for (var i = 0; i < keys.length; i++) {
                                    update[keys[i]] = "";
                                }
                                
                                // hold off sending results
                                sendResult = false;
                                
                                // save uploads
                                var update = saveUploads(collection, result._id, request.session.data.uploads, update, true);
                                
                                // clear uploads
                                request.session.data.uploads = clearUploads(collection, "new", request.session.data.uploads);
                                
                                console.log(update);
                                
                                // create command
                                var commandUpdate = "db." + collection + ".update({\"_id\":db.ObjectId(\"" + result._id + "\")},{\"$set\":" + JSON.stringify(update) + "}, dbResultUpdate);";
                                var dbResultUpdate = function (errorUpdate, resultUpdate) {
                                    if(errorUpdate) {
                                    
                                        // collection not provided, create procedure not found response
                                        processError(request, response, -32603, "Internal JSON-RPC error.", json.id);
                                        return;
                                    } else {
                                        // update keys
                                        for (var i = 0; i < keys.length; i++) {
                                            resultUpdate[keys[i]] = update[keys[i]];
                                        }
                            
                                        // filter out return values
                                        resultUpdate = filters.filter(settings, collection, method, action, resultUpdate, "out");
                                        
                                        // return result
                                        processResult (request, response, resultUpdate, json.id);
                                        return;   
                                    }
                                };
                                            
                                // write command to log
                                console.log(request.session.id + ": " + commandUpdate);
                                
                                // execute command
                                eval(commandUpdate);
                            }
                        }
                    }
        
                    if (sendResponse) {
            
                        // filter out return values
                        result = filters.filter(settings, collection, method, action, result, "out");
                        
                        // return result
                        processResult (request, response, result, json.id);
                        return;            
                    }
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

    if (request.headers["content-type"].indexOf("multipart/form-data") > -1) {
        var form = new formidable.IncomingForm();
        form.parse(request, function(error, fields, files) {
            if (error) {
                // show error in log
                console.error(error.message);
                
                // respond to request with error
                processUpload(request, response, fields.collection, field, "error");
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
            
            // check roles
            var allowed = roles.check(settings, fields.collection, fields.method, fields.action, request.session.data.user);
            if (allowed) {
                if (fields.method === "upload") {
                    
                    // filter the params
                    files = filters.filter(settings, fields.collection, fields.method, fields.action, files, "in");
                    
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
                        processUpload(request, response, fields.collection, field, 3);
                        return;
                    }
                }
            }
            
            // respond to request with error
            processUpload(request, response, fields.collection, field, "error");
            return;
        });
        return;
    } else {
    
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
                    if (collection == settings.httpAuthCollection && json.method == "login") {
                    
                        // process login request
                        processLogin(request, response, json);
                        
                    } else if (collection == settings.httpAuthCollection && json.method == "logout") {
                    
                        // process logout request
                        processLogout(request, response, json);
                    
                    } else if (collection == settings.httpAuthCollection && json.method == "isAuthenticated") {
                    
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
}

function processUpload (request, response, collection, field, step) {
    
    // respond to request with error
    response.writeHead(302, {"Location": "/upload.html?collection=" + collection + "&field=" + field + "&step=" + step});
    response.end();
    return;
}

function processGet (request, response) {

    var uri = url.parse(request.url).pathname;
    if (uri.indexOf("settings.json", 0) < 0 && uri.indexOf("server.js", 0) < 0) {
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

function getUploads (collection, _id, uploads) {
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

function hasUploads (collection, _id, uploads) {
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

function saveUploads (collection, _id, uploads, params, isNew) {
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
                        
                        console.log(settings.paths.uploads + directory);
                        
                        // make the directory
                        fs.mkdirSync(settings.paths.uploads + directory, 0755, true);
                        
                        // rename the file
                        fs.renameSync(file.path,  settings.paths.uploads + path);
                    
                        // update the field 
                        params[keys[i]] = path;
                    }
                }
            }
        }
    }
    
    return params;
}

function clearUploads (collection, _id, uploads) {
    if (uploads !== undefined) {
        if (uploads[collection] !== undefined) {
            if (uploads[collection][_id] !== undefined) {
                delete uploads[collection][_id];
            }
        }
    }
    return uploads;
}





