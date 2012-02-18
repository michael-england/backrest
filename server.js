var databaseUrl = "db"; // "username:password@example.com/mydb"
var collections = ["users", "reports"]

var db = require("mongojs").connect(databaseUrl, collections);
var http = require("http");
var libpath = require("path");
var fs = require("fs");
var url = require("url");
var mime = require("mime");

var currentRequest = null;
var currentResponse = null;
var filename = null;
var path = ".";

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
			  		
			  		// execute command
			  		eval("db." + collection + "." + json.method + "(" + JSON.stringify(json.params) + ", dbResult);")
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
		        currentResponse.write(json);
		        currentResponse.end();		  		
		  	}
		});
    } else {
    
    	var uri = url.parse(request.url).pathname;
    	filename = libpath.join(path, uri);
	    libpath.exists(filename, libpathExists);
	}    
    
}).listen(1337, "127.0.0.1");

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


// app.js
//db.users.save({email: "srirangan@gmail.com", password: "iLoveMongo", sex: "male"}, function(err, saved) {
//  if( err || !saved ) console.log("User not saved");
//  else console.log("User saved");
//});

// app.js
//db.users.find({sex: "female"}, function(err, users) {
//  if( err || !users) console.log("No female users found");
//  else users.forEach( function(femaleUser) {
//    console.log(femaleUser);
//  } );
//});