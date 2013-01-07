String.prototype.getValueByKey = function (k) {
    var p = new RegExp('\\b' + k + '\\b', 'gi');
    return this.search(p) != -1 ? decodeURIComponent(this.substr(this.search(p) + k.length + 1).substr(0, this.substr(this.search(p) + k.length + 1).search(/(&|;|$)/))) : undefined;
};

function upload_Load () {
    var collection = location.search.getValueByKey("collection");
    var origin = location.search.getValueByKey("origin");
    var _id = location.search.getValueByKey("_id");
    var field = location.search.getValueByKey("field");
    var temp = location.search.getValueByKey("temp");
    var step = location.search.getValueByKey("step");
    var event;
    
    if (step == 1 || step === undefined) {
        $("#step1").css("display", "block");
        $("#step2").css("display", "none");
        $("#step3").css("display", "none");
        $("#error").css("display", "none");
        
        $("#collection").val(collection);
        $("#_id").val(_id);
        $("#origin").val(origin);
        $("#uploadFile").attr("name", field);
        $("#uploadFile").attr("id", field);
        event = "initiated";
    } else if (step == 2) {
        $("#step1").css("display", "none");
        $("#step2").css("display", "block");
        $("#step3").css("display", "none");
        $("#error").css("display", "none");
        event = "uploading";
    } else if (step == 3) {
        $("#step1").css("display", "none");
        $("#step2").css("display", "none");
        $("#step3").css("display", "block");
        $("#error").css("display", "none");
        event = "uploaded";
    } else if (step === "error") {
        $("#step1").css("display", "none");
        $("#step2").css("display", "none");
        $("#step3").css("display", "none");
        $("#error").css("display", "block");
        event = "error";
    }

    try {
        var message = {
            "collection": collection,
            "json": {
                "upload" : {
                    "_id": _id,
                    "field": field,
                    "event": event,
                    "temp": temp
                },
                "_id": _id
            }
        };
        
        parent.postMessage(JSON.stringify(message), origin);
    } catch (error) {
        if (console) {
            console.log(error);
        } else {
            alert(error);        
        }
    }
}

function upload_Submit() {
    
    // update the status
    $("#step1").css("display", "none");
    $("#step2").css("display", "block");
    $("#step3").css("display", "none");
    
    // submit the status
    document.uploadForm.submit();
}

function proxy_Load () {
    try {
        if (location.search.getValueByKey("json")) {
                
            var collection = location.search.getValueByKey("collection");
            var callback = location.search.getValueByKey("callback");
            var origin = location.search.getValueByKey("origin");
            var data = JSON.parse(location.search.getValueByKey("json"));
    		var url = "/" + collection;
    
    		$.ajax({
    			type: "POST",
    			url: url,
    			data: JSON.stringify(data),
    			dataType: "json",
    			contentType: "text/json",
    			success: function (data) {
                    try {
                        var response = {
                            "collection": collection,
                            "callback": callback,
                            "json": data
                        };
                        parent.postMessage(JSON.stringify(response), origin);
                    } catch (error) {
                        alert(error.Message);
                    }
                }
    		});
        } else {
            window.addEventListener("message", function (event) {
                if (event) {
                    if (event.data) {
                        var request = JSON.parse(event.data);
                		$.ajax({
                			type: "POST",
                			url: "/" + request.collection,
                			data: JSON.stringify(request.json),
                			dataType: "json",
                			contentType: "text/json",
                			success: function (data) {
                			
                                try {
                                    var response = {
                                        "collection": request.collection,
                                        "callback": request.callback,
                                        "json": data
                                    };
                                    parent.postMessage(JSON.stringify(response), request.origin);
                                } catch (error) {
                                    alert(error.Message);
                                }
                            }
                		});
                    }
                }
            }, false);
        }
    
    } catch (error) {
    }
}

function execute() {
	
	try {
		var url = "/" + $("#collection").val();
		
		var params = null;
		if ($("#params").val() != "")
			params = JSON.parse($("#params").val());
		
		var data = {
			"jsonrpc": "2.0", 
			"method": $("#method").val(), 
			"params": params, 
			"id": 0
		};
		
		var methodAction = $("#methodAction").val();
		if (methodAction != "") {
		    data.method += "/" + methodAction;
		}
		
		data = JSON.stringify(data);
		
		$.ajax({
			type: "POST",
			url: url,
			data: data,
      		dataType: "json",
    		contentType: "text/json",
			success: function (data) {
			    
			    if (data.error != undefined) {
			    
			    	$(".output").append("<div class=\"error\">" + data.error.message + (data.result != undefined ? (" " +JSON.stringify(data.result)) : "") + "</div>");
			    	$(".output").stop(true);
			    	$(".output").animate({ scrollTop: $(".output").get(0).scrollHeight - $(".output").height() }, 500);
			    
			    } else {
			    
			    	$(".output").append("<div>" + JSON.stringify(data.result) + "</div>");
			    	$(".output").stop(true);
			    	$(".output").animate({ scrollTop: $(".output").get(0).scrollHeight - $(".output").height() }, 500);
			    }
			}
		});
	} catch (error) {
		$(".output").append("<div class=\"error\">" + error.message + "</div>");
		$(".output").stop(true);
		$(".output").animate({ scrollTop: $(".output").get(0).scrollHeight - $(".output").height() }, 500);
	}
}

// adds addEventListener for browsers that don't have it implemented
('Element' in this) && !('addEventListener' in this.Element.prototype) && (function (global) {
    function Event(e, element) {
        var instance = this, property;

        for (property in e) {
            instance[property] = e[property];
        }

        instance.currentTarget =  element;
        instance.target = e.srcElement || element;
        instance.timeStamp = +new Date;

        instance.preventDefault = function () {
            e.returnValue = false;
        };
        instance.stopPropagation = function () {
            e.cancelBubble = true;
        };
    }

    function addEventListener(type, listener) {
        var
        element = this,
        listeners = element.listeners = element.listeners || [],
        index = listeners.push([listener, function (e) {
            listener.call(element, new Event(e, element));
        }]) - 1;

        element.attachEvent('on' + type, listeners[index][1]);
    }

    function removeEventListener(type, listener) {
        for (var element = this, listeners = element.listeners || [], length = listeners.length, index = 0; index < length; ++index) {
            if (listeners[index][0] === listener) {
                element.detachEvent('on' + type, listeners[index][1]);
            }
        }
    }

    global.addEventListener = document.addEventListener = global.Element.prototype.addEventListener = addEventListener;
    global.removeEventListener = document.removeEventListener = global.Element.prototype.removeEventListener = removeEventListener;
})(this);
