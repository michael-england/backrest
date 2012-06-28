exports.validate = function (server, collection, method, action, json, params, callback) {

	var validationSummary = [];
	var validators = this.get(server, collection, method, action);
	
	var validateField = function (index, callback) {
	    
	    if (index == validators.length) {
	    	if (validationSummary.length > 0) {
        		callback(validationSummary);
        	} else {
        		callback(true);
        	}
	    } else {
    	    
    	    // get the value from params
    	    var value = this.getParamValue(params, validators[index].fieldToValidate);
    	    switch (validators[index].type) {
    	    	case "required":
    	    		if (value == "" || value == undefined) {
    	    			if (validators[index].errorMessage != "" && 
    	    				validators[index].errorMessage != undefined) {
    	    				validationSummary.push(validators[index].errorMessage);
    	    			} else {
    	    				validationSummary.push(validators[index].fieldToValidate + " is required.");
    	    			}
    	    		}
    	    		validateField(index + 1, callback);
    	    		break; 
    	    	
    	    	case "compare":
    	    		var valueCompare = undefined;
    	    		var valid = true;
    	    		
    	    		if (validators[index].fieldToCompare != undefined && validators[index].fieldToCompare != "")
    	    			valueCompare = this.getParamValue(params, validators[index].fieldToCompare);			
    	    		else if (validators[index].valueToCompare != undefined)
    	    			valueCompare = validators[index].valueToCompare;		
    	    		
    	    		if (value !== undefined && value !== valueCompare) {
        	    		switch (validators[index].dataType) {
        	    			case "string":
        	    				if (value !== undefined) {
            	    				value = value.toString();
        	    				}
        	    				
        	    				if (valueCompare !== undefined) {
        	    				    valueCompare = valueCompare.toString();
        	    				}
        	    				break;
        	    			
        	    			case "integer":
        	    				if (value !== undefined) {
        	    					value = parseInt(valueCompare);
        	    				}
        	    				
        	    				if (valueCompare !== undefined) {
        	    				    valueCompare = parseInt(value);
        	    				}
        	    				break;
        	    			
        	    			case "float":
        	    				if (value !== undefined) {
        	    					value = parseFloat(valueCompare);
        	    				}
        	    				
        	    				if (valueCompare !== undefined) {
        	    				    valueCompare = parseFloat(value);
        	    				}
        	    				break;
        	    			
        	    			case "date":
        	    				if (value !== undefined) {
        	    					value = Date.parse(value);
        	    				}
        	    				
        	    				if (valueCompare !== undefined) {
        	    				    valueCompare = Date.parse(valueCompare);
        	    				}
        	    				break;
        	    				
        	    			case "currency":
        	    				if (value !== undefined) {
        	    					value = Number(value.replace(/[^0-9\.]+/g,""));
        	    				}
        	    				
        	    				if (valueCompare !== undefined) {
        	    				    valueCompare = Number(valueCompare.replace(/[^0-9\.]+/g,""));
        	    				}
        	    				break;				
        	    		}
        	    		
        	    		if (validators[index].operator != undefined && validators[index].operator != "") {
        	    			valid = eval("(value " + validators[index].operator + " valueCompare)");	
        	    		} else {
        	    			valid = eval("(value == valueCompare)");
        	    		}
        	    		
        	    		if (!valid) {
        	    			if (validators[index].errorMessage != "" && 
        	    				validators[index].errorMessage != undefined) {
        	    				validationSummary.push(validators[index].errorMessage);
        	    			} else {
        	    				validationSummary.push(validators[index].fieldToValidate + " failed to compare.");
        	    			}
        	    		}
    	    		}
    	    		
    	    		validateField(index + 1, callback);
    	    		break;
    	    		
    	    	case "range":
    	    		if (value != "" && value != undefined) {
    	    			var minimumValue = new Number(validators[index].minimumValue);
    	    			var maximumValue = new Number(validators[index].maximumValue);
    	    			var value = new Number(value);
    	    			
    	    			if (value < minimumValue || value > maximumValue) {
    	    				if (validators[index].errorMessage != "" && 
    	    					validators[index].errorMessage != undefined) {
    	    					validationSummary.push(validators[index].errorMessage);
    	    				} else {
    	    					validationSummary.push(validators[index].fieldToValidate + " is required.");
    	    				}
    	    			}
    	    		}
    	    		validateField(index + 1, callback);
    	    		break;
    	    		
    	    	case "regularExpression":
    	    		if (value != "" && value != undefined) {
    	    			var regularExpression = new RegExp(unescape(validators[index].expression));
    	    			if (value.match(regularExpression) == undefined) {
    	    				if (validators[index].errorMessage != "" && 
    	    					validators[index].errorMessage != undefined) {
    	    					validationSummary.push(validators[index].errorMessage);
    	    				} else {
    	    					validationSummary.push(validators[index].fieldToValidate + " is invalid.");
    	    				}
    	    			}
    	    		}
    	    		validateField(index + 1, callback);
    	    		break;
    	    		
    	    	case "custom":
    	    	    if (server.customValidators !== undefined && validators[index].validationFunction !== undefined && validators[index].validationFunction !== "") {
    	    		    if (server.customValidators[validators[index].validationFunction] !== undefined) {
    	    		        server.customValidators[validators[index].validationFunction](server, value, json, function (isValid) {
    	    		            if (!isValid) {
        	    		        	if (validators[index].errorMessage != "" && 
        	    		        		validators[index].errorMessage != undefined) {
        	    		        		validationSummary.push(validators[index].errorMessage);
        	    		        	} else {
        	    		        		validationSummary.push(validators[index].fieldToValidate + " is invalid.");
        	    		        	}
    	    		        	}
    	    		        
    	    		            validateField(index + 1, callback);
    	    		        }.bind(this));
    	    		    }
    	            }		    
    	    		break;
    	    }
	    }
	}.bind(this);
	
	validateField(0, callback);
}

exports.get = function (server, collection, method, action) {
	return server.settings.collections[collection][method][action].validators;
}

exports.getParamValue = function (params, name){
	try {
		return eval("(params." + name + ")");
	} catch (error) {
		return;
	}
}