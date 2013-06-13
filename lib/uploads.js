var imagemagick = require('imagemagick');
var fs = require("fs");
var roles = require("./roles");
var filters = require("./filters");

exports.upload = function(server, request, response, fields, files) {

    // retrieve the field name of the file being uploaded
    field = Object.keys(files)[0];

    // check roles
    roles.check(server, fields.collection, fields.method, fields.action, request.session.user, null, function(allowed) {
        if (allowed) {

            // filter the params
            files = filters.filter(server.settings, fields.collection, fields.method, fields.action, files, "in");

            // set id to new if not defined
            if (fields._id === "" || fields._id === "undefined" || fields._id === undefined) {
                fields._id = "new";
            }

            // create uploads
            if (request.session.uploads === undefined) {
                request.session.uploads = {};
            }

            // create collection for uploads
            if (request.session.uploads[fields.collection] === undefined) {
                request.session.uploads[fields.collection] = {};
            }

            // create document for uploads
            if (request.session.uploads[fields.collection][fields._id] === undefined) {
                request.session.uploads[fields.collection][fields._id] = {};
            }

            var keys = Object.keys(files);
            if (keys.length > 0) {

                // temporarily store the file
                var file = files[keys[0]];

                // create field for upload
                if (request.session.uploads[fields.collection][fields._id][keys[0]] === undefined) {
                    request.session.uploads[fields.collection][fields._id][keys[0]] = {};
                }

                // loop through files and add them to the session
                request.session.uploads[fields.collection][fields._id][keys[0]].file = file;
                request.session.uploads[fields.collection][fields._id][keys[0]].method = fields.method;
                request.session.uploads[fields.collection][fields._id][keys[0]].action = fields.action;

                // write to log
                console.log(request.sessionID + ": uploaded a file (" + file.path + ")");

                // get the extension
                var extension = file.name.split(".").pop();

                // create the final path
                var directory = "uploads/" + fields.collection + "/" + fields._id + "/";
                var path = directory + encodeURIComponent(request.sessionID) + "." + keys[0] + "." + extension;
                var root = "./";
                if (server.settings.paths !== undefined) {
                    if (server.settings.paths.uploads !== undefined) {
                        root = server.settings.paths.uploads;
                    }
                }

                // make the directory
                fs.exists(root + directory, function() {
                    fs.mkdirSync(root + directory, 0755, true);

                    // rename the file
                    fs.renameSync(file.path, root + path);

                    // resize the file
                    var resize = server.settings.collections[fields.collection][fields.method][fields.action].resize;
                    if (resize) {

                        var sizes = resize[keys[0]];
                        if (sizes) {

                            // resize images to settings specifications
                            this.resize(server, request, response, fields, field, path, sizes, 0);
                        } else {

                            // respond and show the final step
                            this.render(server, request, response, fields.collection, field, 3, fields._id, fields.origin, path);
                        }
                    } else {

                        // respond and show the final step
                        this.render(server, request, response, fields.collection, field, 3, fields._id, fields.origin, path);
                    }

                }.bind(this));
                return;
            }
        }

        // respond to request with error
        this.render(server, request, response, fields.collection, field, "error");
        return;
    }.bind(this));
}

exports.render = function(server, request, response, collection, field, step, _id, origin, temp) {

    // respond to request with error
    response.writeHead(302, {
        "Location": "/upload.html?collection=" + collection + "&field=" + field + "&step=" + step + "&_id=" + _id + "&origin=" + origin + "&temp=" + encodeURIComponent(temp)
    });
    response.end();
};

exports.clearUpload = function(server, request, response, json, collection) {
    if (request.session.uploads !== undefined && json.params._id !== undefined && json.params.field !== undefined) {
        if (request.session.uploads[collection] !== undefined) {
            if (request.session.uploads[collection][json.params._id] !== undefined) {
                if (request.session.uploads[collection][json.params._id][json.params.field] !== undefined) {

                    // write to log
                    console.log(request.sessionID + ": removed an uploaded file.");

                    // remove the upload
                    delete request.session.uploads[collection][json.params._id][json.params.field];

                    // return result
                    server.result(request, response, true, json.id);

                } else {

                    // Internal error occurred, create internal error response
                    server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);
                }
            } else {

                // Internal error occurred, create internal error response
                server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);
            }
        } else {

            // Internal error occurred, create internal error response
            server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);
        }
    } else {

        // Internal error occurred, create internal error response
        server.error(request, response, -32603, "Internal JSON-RPC error.", json.id);
    }
};

exports.resize = function(server, request, response, fields, field, path, sizes, index) {

    if (index === sizes.length) {

        // respond and show the final step
        this.render(server, request, response, fields.collection, field, 3, fields._id, fields.origin, path);
    } else {

        var options = sizes[index];
        var directory = "uploads/" + fields.collection + "/" + fields._id + "/";
        var pathDestination = directory + encodeURIComponent(request.sessionID) + "." + field + "." + options.width + "x" + options.height + "." + (options.format || ".jpg");
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

                        if (server.settings.isDebug) {

                            // email error
                            server.sendErrorEmail(request, undefined, e, function() {

                                // throw the error if in debug mode
                                throw e;
                            });

                        } else {

                            // throw error to console
                            console.log(e);

                            // respond to request with error
                            this.render(server, request, response, fields.collection, field, "error");

                            // email error
                            server.sendErrorEmail(request, data, e);
                            return;
                        }
                    } else {
                        this.resize(server, request, response, fields, field, path, sizes, index + 1);
                    }
                }.bind(this));
            } else {
                this.resize(server, request, response, fields, field, path, sizes, index + 1);
            }
        }.bind(this));
    }
};

exports.get = function(collection, _id, uploads) {
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

exports.has = function(collection, _id, uploads) {
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

exports.save = function(server, collection, _id, uploads, request, params, isNew) {

    if (uploads !== undefined) {
        if (uploads[collection]) {

            // get document reference
            var document = {};
            if (isNew) {
                document = uploads[collection]["new"];
            } else {
                document = uploads[collection][_id];
            }

            // save files in document
            if (document) {
                var keys = Object.keys(document);
                for (var i = 0; i < keys.length; i++) {

                    var fields = document[keys[i]];
                    var file = fields.file;
                    if (file) {

                        // get the extension
                        var extension = file.name.split(".").pop();

                        // create the final path
                        var directory = "uploads/" + collection + "/" + _id + "/";
                        var path = directory + keys[i] + "." + extension;
                        var root = "./";
                        if (server.settings.paths) {
                            if (server.settings.paths.uploads) {
                                root = server.settings.paths.uploads;
                            }
                        }

                        // make the directory
                        fs.mkdirSync(root + directory, 0755, true);

                        // rename temp file to final location
                        var tempPath = "";
                        if (isNew) {
                            tempPath = root + "uploads/" + collection + "/new/" + encodeURIComponent(request.sessionID) + "." + keys[i] + "." + extension;
                        } else {
                            tempPath = root + "uploads/" + collection + "/" + _id + "/" + encodeURIComponent(request.sessionID) + "." + keys[i] + "." + extension;
                        }

                        fs.renameSync(tempPath, server.settings.paths.uploads + path);

                        // move resized images
                        var resize = server.settings.collections[collection][fields.method][fields.action].resize;
                        if (resize) {

                            var sizes = resize[keys[0]];
                            if (sizes) {

                                for (var s = 0; s < sizes.length; s++) {

                                    var options = sizes[s];
                                    var tempPathSize = "";
                                    if (isNew) {
                                        tempPathSize = root + "uploads/" + collection + "/new/" + encodeURIComponent(request.sessionID) + "." + keys[i] + "." + options.width + "x" + options.height + "." + (options.format || extension);
                                    } else {
                                        tempPathSize = root + "uploads/" + collection + "/" + _id + "/" + encodeURIComponent(request.sessionID) + "." + keys[i] + "." + options.width + "x" + options.height + "." + (options.format || extension);
                                    }

                                    var pathSize = directory + keys[i] + "." + options.width + "x" + options.height + "." + (options.format || extension);

                                    // delete previous image
                                    if (fs.existsSync(server.settings.paths.uploads + pathSize)) {
                                        fs.unlinkSync(server.settings.paths.uploads + pathSize);
                                    }

                                    // move resized image if it exists
                                    if (fs.existsSync(tempPathSize)) {
                                        fs.renameSync(tempPathSize, server.settings.paths.uploads + pathSize);
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

exports.clear = function(collection, _id, uploads) {
    if (uploads !== undefined) {
        if (uploads[collection] !== undefined) {
            if (uploads[collection][_id] !== undefined) {
                delete uploads[collection][_id];
            }
        }
    }
    return uploads;
};

exports.error = function(error, request, response, next) {

    if (request.headers["content-type"].indexOf("multipart/form-data") > -1 && request.body.method === "upload") {

        // set default action if not set
        if (request.body.action === undefined) {
            request.body.action = "default";
        }

        // get field from key
        var field = "";
        var keys = Object.keys(request.files);
        if (keys.length > 0) {
            field = keys[0];
        }

        // respond to request with error
        this.render(undefined, request, response, request.body.collection, field, "error");
    }
};