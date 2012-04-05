exports.validate = function (settings, collection, method, action, params) {

	var validationSummary = [];
	var validators = this.get(settings, collection, method, action);
	for (var i = 0; i < validators.length; i++) {
		// get the value from params
		var value = this.getParamValue(params, validators[i].fieldToValidate);
		switch (validators[i].type) {
			case "required":
				if (value == "" || value == undefined) {
					if (validators[i].errorMessage != "" && 
						validators[i].errorMessage != undefined) {
						validationSummary.push(validators[i].errorMessage);
					} else {
						validationSummary.push(validators[i].fieldToValidate + " is required.");
					}
				}
				break; 
			
			case "compare":
				var valueCompare = undefined;
				var valid = true;
				
				if (validators[i].fieldToCompare != undefined && validators[i].fieldToCompare != "")
					valueCompare = this.getParamValue(params, validators[i].fieldToCompare);			
				else if (validators[i].valueToCompare != undefined)
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
				
				if (validators[i].operator != undefined && validators[i].operator != "") {
					valid = eval("(value " + validators[i].operator + " valueCompare)");	
				} else {
					valid = eval("(value == valueCompare)");
				}
				
				if (valid) {
					if (validators[i].errorMessage != "" && 
						validators[i].errorMessage != undefined) {
						validationSummary.push(validators[i].errorMessage);
					} else {
						validationSummary.push(validators[i].fieldToValidate + " failed to compare.");
					}
				}
				break;
				
			case "range":
				if (value != "" && value != undefined) {
					var minimumValue = new Number(validators[i].minimumValue);
					var maximumValue = new Number(validators[i].maximumValue);
					var value = new Number(value);
					
					if (value < minimumValue || value > maximumValue) {
						if (validators[i].errorMessage != "" && 
							validators[i].errorMessage != undefined) {
							validationSummary.push(validators[i].errorMessage);
						} else {
							validationSummary.push(validators[i].fieldToValidate + " is required.");
						}
					}
				}
				break;
				
			case "regularExpression":
				if (value != "" && value != undefined) {
					var regularExpression = new RegExp(unescape(validators[i].expression));
					if (value.match(regularExpression) == undefined) {
						if (validators[i].errorMessage != "" && 
							validators[i].errorMessage != undefined) {
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
	
	if (validationSummary.length > 0) {
		return validationSummary;
	} else {
		return true;
	}
}

exports.get = function (settings, collection, method, action) {
	return settings.collections[collection][method][action].validators;
}

exports.getParamValue = function (params, name){
	try {
		return eval("(params." + name + ")");
	} catch (error) {
		return;
	}
}