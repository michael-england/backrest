
exports.filter = function (settings, collection, method, action, params, direction) {

	// filter out param values
	var filterMode = "field";
	var filters = this.get(settings, collection, method, action, direction);
	var fieldFiltered = [];
	var fieldAllowed = [];
	for (var i = 0; i < filters.length; i++) {
	    if (filters[i].direction == direction) {
    		if (filters[i].fieldToFilter == "*") {
    			if (filters[i].allowed == false) {
    				filterMode = "allowNone";
    			} else {
    				filterMode = "allowAll";
    			}
    		} else {
    			if (filters[i].allowed) {
    				fieldAllowed.push(filters[i].fieldToFilter);
    			} else {
    				fieldFiltered.push(filters[i].fieldToFilter);
    			}
    		}
		}
	}
	
	// filter based on mode
	switch (filterMode) {
		case "allowAll": // allow all params except the filtered ones
			for (var i = 0; i < fieldFiltered.length; i++) {
				delete params[fieldFiltered];
			}
			break;
			
		case "allowNone": // excluded all params except the allowed ones
			for (var key in params) {
				if (fieldAllowed.indexOf(key) == -1) {
					delete params[key];
				}
			}
			break;
		
		case "field": // filter on a field basis
			for (var i = 0; i < filters.length; i++) {
				if (filters[i].allowed == false && filters[i].direction == direction) {
				    if (params != undefined) {
				        if (params instanceof Array) {
				            for (var n = 0; n < params.length; n++) {
				                if (params[n][filters[i].fieldToFilter] != undefined) {
				                    delete params[n][filters[i].fieldToFilter];
				                }
				            }
				        } else {
				        
    				        if (params[filters[i].fieldToFilter] != undefined) {
    				            delete params[filters[i].fieldToFilter];
    				        }
				        }
					}
				}							
			}
			break;
	}
	
	// filter owner from params
	if (params != undefined && params != null) {
    	if (params instanceof Array) {
        	for (var n = 0; n < params.length; n++) {
    	    	if (direction === "in") {
    	        	if (method === "update" || method === "findAndModify" || method === "save") {
    	            	if (params[n]._owner !== undefined) {
    	            	    params[n]._owner = undefined;
    	            	}
    	        	}
    	    	} else {
    	        	if (params[n]._owner !== undefined) {
    	        	    params[n]._owner = undefined;
    	        	}
    	    	}
        	}
    	} else {
        	if (direction === "in") {
            	if (method === "update" || method === "findAndModify" || method === "save") {
                	if (params._owner !== undefined) {
                	    params._owner = undefined;
                	}
            	}
        	} else {
            	if (params._owner !== undefined) {
            	    params._owner = undefined;
            	}
        	}
    	}
	}
	
	return params;
}

exports.get = function (settings, collection, method, action, direction) {
	return settings.collections[collection][method][action].filters;
}
