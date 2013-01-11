exports.check = function (server, collection, method, action, user, params, callback) {    
    var allowed = false;
    var checkOwner = false;
    if (server.settings.collections[collection] != undefined) {
        if (server.settings.collections[collection][method] != undefined) {
            if (server.settings.collections[collection][method].enabled == true) {
                if (server.settings.collections[collection][method][action] != undefined) {
                    
                    // get the action's roles
                    var roles = server.settings.collections[collection][method][action].roles;
                    
                    // if the action doesn't have a role, allow the request to perform the action
                    if (roles != undefined) {
                        if (roles.length > 0) {
                        
                            // check if the current user is guest
                            if (user != "guest") {
                            
                                // get the roles field
                                var rolesField = !server.settings.authentication.rolesField ? "roles" : server.settings.authentication.rolesField;
                                
                                // check if the user has the role field
                                if (user[rolesField] != undefined) {
                                    
                                    // loop through user's roles
                                    for (var i = 0; i < user[rolesField].length; i++) {
                                        
                                        // check if role is allowed to perform action
                                        if (roles.indexOf(user[rolesField][i]) > -1) {
                                        
                                            // break if allowed
                                            allowed = true; 
                                            break;
                                        }
                                    }
                                }
                                
                                // check if role is allowed to perform action
                                if (roles.indexOf("owner") > -1 && allowed === false) {
                                
                                    // break if allowed
                                    checkOwner = true; 
                                }
                            } else {
                                
                                // check if guest role is allowed to perform action
                                if (roles.indexOf("guest") > -1) {
                                
                                    // break if allowed
                                    allowed = true; 
                                }
                            }
                        } else {
                            allowed = true;    
                        }
                    } else {
                        allowed = true;                
                    }
                }
            }   
        }
    }
    
    if (checkOwner && user !== "Guest") {
        if (method == "update") {
            
            // add owner to the query
            if (params === undefined) {
                params = [];
                params.push({});
            }
            params[0]._owner = server.db.ObjectId(user._id);
                
        } else if (method === "findAndModify") {
        
            // add owner to the query
            if (params === undefined) {
                params = {};
            } 
            params.query._owner = server.db.ObjectId(user._id);
        } else if (method === "group") {
            
            // add owner to the query
            if (params.cond === undefined) {
                params.cond = {};
            }
            params.cond._owner = server.db.ObjectId(user._id);
        } else {
        
            // add owner to the query
            if (params === undefined) {
                params = {};
            } 
            params._owner = server.db.ObjectId(user._id);
        }
        allowed = true;
    }
    
    if (callback !== undefined) {
        callback(allowed);
    } else {
        return callback;
    }
}