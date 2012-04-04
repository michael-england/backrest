
exports.validate = function (settings, collection, method, params) {

	var validationSummary = new Array();
	var validatorGroups = getValidatorGroups(settings, collection, method);
	if (validatorGroups.length > 0) {
		for (var i = 0; i < validatorGroups.length; i++) {
			var validators = getValidatorsByGroup(settings, collection, method, validatorGroups[i]);			
			validationSummary = validateGroup(settings, validators, params);
			if (validationSummary.length == 0)
				break;
		}
	} else {
		var validators = getValidators(settings, collection, method);
		validationSummary = validateGroup(settings, validators, params);
	}
	
	if (validationSummary.length > 0) {
		return validationSummary;
	} else {
		return true;
	}
}

function validateGroup(settings, validators, params) {
	var validationSummary = new Array();

	for (var i = 0; i < validators.length; i++) {
		// get the value from params
		var value = getParamValue(params, validators[i].fieldToValidate);
		switch (validators[i].type) {
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
					
				switch (validators[i].dataType) {
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
				if (value != "" && value != null) {
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
				if (value != "" && value != null) {
					var regularExpression = new RegExp(unescape(validators[i].expression));
					if (value.match(regularExpression) == null) {
						if (validators[i].errorMessage != "" && 
							validators[i].errorMessage != null) {
							validationSummary.push(validators[i].errorMessage);
						} else {
							validationSummary.push(validators[i].fieldToValidate + " is invalid.");
						}
					}
				}
				break;
				
			case "custom":
				break;
		}
	}
	
	return validationSummary;
}

function getValidators(settings, collection, method) {
	var validators = [];
    if (settings != undefined) {
        if (settings.collections != undefined) {
            if (settings.collections[collection] != undefined) {
                if (settings.collections[collection][method] != undefined) {
                    if (settings.collections[collection][method].validators != undefined) {
                        validators = settings.collections[collection][method].validators;
                    }
                }
            }
        }
    }
	return validators;
}

function getValidatorGroups(settings, collection, method) {
	var validatorGroups = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			for (var n = 0; n < settings.collections[i].validators.length; n++) {
				if (settings.collections[i].validators[n].groups != undefined) {				
					var hasFunction = false;
					for (var f = 0; f < settings.collections[i].validators[n].functions.length; f++) {
						if (settings.collections[i].validators[n].functions[f] == method) {
							hasFunction = true;
							break;
						}
					}
					
					if (hasFunction)
						for (var f = 0; f < settings.collections[i].validators[n].groups.length; f++) {
							if (settings.collections[i].validators[n].groups[f] != "*")
								if (validatorGroups.indexOf(settings.collections[i].validators[n].groups[f]) == -1)
									validatorGroups.push(settings.collections[i].validators[n].groups[f]);	
				
					}
				}	
			}
		}
	}	
	return validatorGroups;
}

function getValidatorsByGroup(settings, collection, method, group) {
	var validators = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			for (var n = 0; n < settings.collections[i].validators.length; n++) {
				if (settings.collections[i].validators[n].groups != undefined) {		
					if (settings.collections[i].validators[n].groups.indexOf(group) != -1 ||
						settings.collections[i].validators[n].groups.indexOf("*") != -1) {
						for (var f = 0; f < settings.collections[i].validators[n].functions.length; f++) {
							if (settings.collections[i].validators[n].functions[f] == method) {
								validators.push(settings.collections[i].validators[n]);
								break;
							}
						}
					}
				}
			}
		}
		break;
	}	
	return validators;
}

function getParamValue(params, name){
	try {
		return eval("(params." + name + ")");
	} catch (error) {
		return null;
	}
}