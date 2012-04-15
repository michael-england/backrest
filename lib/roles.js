exports.check = function (settings, collection, method, action, user) {    
    var allowed = false;
    if (settings.collections[collection] != undefined) {
        if (settings.collections[collection][method] != undefined) {
            if (settings.collections[collection][method].enabled == true) {
                if (settings.collections[collection][method][action] != undefined) {
                    
                    // get the action's roles
                    var roles = settings.collections[collection][method][action].roles;
                    
                    // if the action doesn't have a role, allow the request to perform the action
                    if (roles != undefined) {
                        if (roles.length > 0) {
                        
                            // check if the current user is guest
                            if (user != "Guest") {
                            
                                // get the roles field
                                var rolesField = !settings.httpAuthRolesField ? "roles" : settings.httpAuthRolesField;
                                
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
    
    return allowed;
}