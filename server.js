var mongo = require("mongojs");
var http = require("http");
var libpath = require("path");
var fs = require("fs");
var url = require("url");
var mime = require("mime");
var currentRequest = null;
var currentResponse = null;
var filename = null;
var path = ".";
var settings = null;
var collections = null;
var db = null;

var settingsFilename = libpath.join(path, "settings.json");
libpath.exists(settingsFilename, libpathExists_Settings);

function libpathExists_Settings(exists) {
    if (exists) {
	    fs.readFile(settingsFilename, "binary", fsReadFile_Settings);
    } else {    

		// handel error
		console.log("settings.json file does not exist.");

		// exit the application    		
		process.exit();	
    }
}

function fsReadFile_Settings(error, file) {
	if (!error) {
    	try
    	{
    		// parse file to settings object
    		settings = JSON.parse(file);
    		
    		// push setting's collection to collections name array
    		collections = new Array();
			for (var i = 0; i < settings.collections.length; i++) {
				collections.push(settings.collections[i].name)
			}    		
			
			// connect to the database
    		db = mongo.connect(settings.databaseUrl, collections);
       	}
    	catch (ex)
    	{
    		// handel error
    		console.log(ex.message);

			// exit the application    		
    		process.exit();	
    	}
    } else {
    
		// exit the application    		
		process.exit();	
    	
	}
}

http.createServer(function (request, response) {
  	currentResponse = response;
  	currentRequest = request;
  	
  	// process POST request
  	if (currentRequest.method == "POST") {	
  		
  		// load chunks into data
  		var data = "";
  		currentRequest.on("data", function (chunk) {
			console.log("JSON: " + chunk.toString());
			data += chunk;
		});
  		
  		// chucks have loaded, continue the request
	    currentRequest.on("end", function requestEnd() {  	
	    	try {
			  	var pathParts = currentRequest.url.split("/");
			  	var collection = pathParts[pathParts.length - 1];
			  	if (collection != null && collection != undefined) {
			  		
			  		var json = null;
			  		try {
			  		
			  			// parse data to json
			  			json = JSON.parse(data);
			  			
			  		} catch (error) {
				  		
				  		// data failed to parse, create parse error response
				  		json = {
				  			"jsonrpc": "2.0", 
				  			"error": {
				  				"code": -32700, 
				  				"message": "Parse error"
				  			}, 
				  			"id": null
				  		};
			  			
			  			// respond with parse error 
			  			currentResponse.writeHead(200, {"Content-Type": "application/json"});
			  			currentResponse.write(json);
				  		currentResponse.end();
			  			return;
			  		}
			  		
			  		// write command to log
			  		console.log("db." + collection + "." + json.method + "(" + JSON.stringify(json.params) + ", dbResult);");
			  		
			  		if (validate(collection, json.method, json.params)) {
			  	
			  			// execute command
			  			eval("db." + collection + "." + json.method + "(" + JSON.stringify(json.params) + ", dbResult);")
			  		}			  	
			  	} else {
			  	
			  		// collection not provided, create procedure not found response
			  		var json = {
			  			"jsonrpc": "2.0", 
			  			"error": {
			  				"code": -32601, 
			  				"message": "Procedure not found."
			  			}, 
			  			"id": null
			  		};
			  		
			  		// respond with procedure not found
			  		currentResponse.writeHead(200, {"Content-Type": "application/json"});
			  		currentResponse.write(json);
				  	currentResponse.end();
				  	return;
			  	}

		  	} catch (error) {
	
			  	// Internal error occured, create internal error response
		  		var json = {
		  			"jsonrpc": "2.0", 
		  			"error": {
		  				"code": -32603, 
		  				"message": "Internal JSON-RPC error."
		  			}, 
		  			"id": null
		  		};
		  		
		        currentResponse.writeHead(500, {"Content-Type": "application/json" });
		        currentResponse.write(JSON.stringify(json));
		        currentResponse.end();		  		
		  	}

		});
    } else {
    
    	var uri = url.parse(request.url).pathname;
       	filename = libpath.join(path, uri);
	    libpath.exists(filename, libpathExists);
	}    
    
}).listen(1337, "127.0.0.1");

function validate(collection, method, params) {

	var validationSummary = new Array();
	var validators = getValidators(collection, method);
	
	for (var i = 0; validators.length; i++) {

		// get the value from params
		var value = getParamValue(params, validators[i].fieldToValidate);
		switch (validators[i].type)
		{
			case "required":
				if (value == "" || value == null) {
					if (validators[i].errorMessage != "" && 
						validators[i].errorMessage != null) {
						validationSummary.push(validators[i].errorMessage);
					} else {
						validationSummary.push(validators[i].fieldToValidate + " is required.");
					}
				}
				break; 
			
			case "compare":
				var valueCompare = null;
				var valid = true;
				
				if (validators[i].fieldToCompare != null && validators[i].fieldToCompare != "")
					valueCompare = getParamValue(params, validators[i].fieldToCompare);			
				else if (validators[i].valueToCompare != null)
					valueCompare = validators[i].valueToCompare;		
					
				switch (validators[i].type) {
					case "string":
						value = value.toString();
						valueCompare = valueCompare.toString();
						break;
					
					case "integer":
						value = parseInt(valueCompare);
						valueCompare = parseInt(value);
						break;
					
					case "float":
						value = parseFloat(valueCompare);
						valueCompare = parseFloat(value);
						break;
					
					case "date":
						value = Date.parse(value);
						valueCompare = Date.parse(valueCompare);
						break;
						
					case "currency":
						value = Number(value.replace(/[^0-9\.]+/g,""));
						valueCompare = Number(valueCompare.replace(/[^0-9\.]+/g,""));
						break;				
				}
				
				if (validators[i].operator != null && validators[i].operator != "") {
					valid = eval("(value " + validators[i].operator + " valueCompare)");	
				} else {
					valid = eval("(value == valueCompare)");
				}
				
				if (valid) {
					if (validators[i].errorMessage != "" && 
						validators[i].errorMessage != null) {
						validationSummary.push(validators[i].errorMessage);
					} else {
						validationSummary.push(validators[i].fieldToValidate + " failed to compare.");
					}
				}
				break;
				
			case "range":
				if (value == "" || value == null) {
					var minimumValue = new Number(validators[i].minimumValue);
					var maximumValue = new Number(validators[i].maximumValue);
					var value = new Number(value);
					
					if (value < minimumValue || value > maximumValue) {
						if (validators[i].errorMessage != "" && 
							validators[i].errorMessage != null) {
							validationSummary.push(validators[i].errorMessage);
						} else {
							validationSummary.push(validators[i].fieldToValidate + " is required.");
						}
					}
				}
				break;
				
			case "regularExpression":
				break;
				
			case "custom":
				break;
		}
	}
	
	
	if (validationSummary.length > 0) {
		console.log(validationSummary);
		return false;
	} else {
		return true;
	}
}

function getParamValue(params, name){
	return eval("(params." + name + ")");
}

function getValidators(collection, method) {
	var validators = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			for (var n = 0; n < settings.collections[i].validators.length; n++) {
				for (var f = 0; f < settings.collections[i].validators[n].functions.length; f++) {
					if (settings.collections[i].validators[n].functions[f] == method) {
						validators.push(settings.collections[i].validators[n]);
						break;
					}
				}
			}
		}
		break;
	}	
	return validators;
}

function libpathExists(exists) {

	
    if (!exists) {
        currentResponse.writeHead(404, {"Content-Type": "text/plain" });
        currentResponse.write("404 Not Found\n");
        currentResponse.end();
        return;
    }

    if (fs.statSync(filename).isDirectory()) {
        filename += "/index.html";
    }

    fs.readFile(filename, "binary", fsReadFile);
}

function fsReadFile(error, file) {
	if (error) {
        currentResponse.writeHead(500, {"Content-Type": "text/plain" });
        currentResponse.write(error + "\n");
        currentResponse.end();
        return;
    } else {
	    var type = mime.lookup(filename);
	    currentResponse.writeHead(200, { "Content-Type": type });
	    currentResponse.write(file, "binary");
	    currentResponse.end();
	}
}

function dbResult(error, result) {
	if(error) {
	} else {
  		var json = {
  			"jsonrpc": "2.0", 
  			"result": result, 
  			"id": null
  		};
  		currentResponse.writeHead(200, {"Content-Type": "application/json"});
	  	currentResponse.end(JSON.stringify(json));
	}
}

console.log("Server running at http://127.0.0.1:1337/");