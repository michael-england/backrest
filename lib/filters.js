
exports.filter = function (settings, collection, method, params, direction) {

	// filter out param values
	var filterMode = "field";
	var filters = this.get(settings, collection, method, direction);
	var fieldFiltered = new Array();
	var fieldAllowed = new Array();
	for (var i = 0; i < filters.length; i++) {
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
	
	// filter based on mode
	switch (filterMode) {
		case "allowAll": // allow all params except the filtered ones
			for (var i = 0; i < fieldFiltered.length; i++) {
				params[fieldFiltered] = undefined;
			}
			break;
			
		case "allowNone": // excluded all params except the allowed ones
			for (var key in params) {
				if (fieldAllowed.indexOf(key) == -1) {
					params[key] = undefined;
				}
			}
			break;
		
		case "field": // filter on a field basis
			for (var i = 0; i < filters.length; i++) {
				if (filters[i].allowed == false) {
				    if (params != null) {
    				    if (params[filters[i].fieldToFilter] != undefined && 
    				        params[filters[i].fieldToFilter] != null) {
    					    params[filters[i].fieldToFilter] = undefined;
    					}
					}
				}							
			}
			break;
	}
	
	return params;
}

exports.get = function (settings, collection, method, direction) {
	var filters = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			if (settings.collections[i].filters != undefined) {
				for (var n = 0; n < settings.collections[i].filters.length; n++) {
					if (settings.collections[i].filters[n].direction == direction) {
						for (var f = 0; f < settings.collections[i].filters[n].functions.length; f++) {
							if (settings.collections[i].filters[n].functions[f] == method) {
								filters.push(settings.collections[i].filters[n]);
								break;
							}
						}
					}
				}
			}
		}
		break;
	}	
	return filters;
}
