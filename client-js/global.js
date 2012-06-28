String.prototype.getValueByKey = function (k) {
    var p = new RegExp('\\b' + k + '\\b', 'gi');
    return this.search(p) != -1 ? decodeURIComponent(this.substr(this.search(p) + k.length + 1).substr(0, this.substr(this.search(p) + k.length + 1).search(/(&|;|$)/))) : undefined;
};

function upload_Load () {
    var collection = location.search.getValueByKey("collection");
    var _id = location.search.getValueByKey("_id");
    var field = location.search.getValueByKey("field");
    var step = location.search.getValueByKey("step");
    if (step == 1 || step === undefined) {
        
        $("#step1").css("display", "block");
        $("#step2").css("display", "none");
        $("#step3").css("display", "none");
        $("#error").css("display", "none");
        
        $("#collection").val(collection);
        $("#_id").val(_id);
        $("#uploadFile").attr("name", field);
        $("#uploadFile").attr("id", field);
    } else if (step == 2) {
        $("#step1").css("display", "none");
        $("#step2").css("display", "block");
        $("#step3").css("display", "none");
        $("#error").css("display", "none");
    } else if (step == 3) {
        $("#step1").css("display", "none");
        $("#step2").css("display", "none");
        $("#step3").css("display", "block");
        $("#error").css("display", "none");
    } else if (step === "error") {
        $("#step1").css("display", "none");
        $("#step2").css("display", "none");
        $("#step3").css("display", "none");
        $("#error").css("display", "block");
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
                    var message = {
                        "collection": collection,
                        "callback": callback,
                        "json": data
                    };
                    parent.postMessage(JSON.stringify(message), origin);
                } catch (error) {
                    alert(error.Message);
                }
            }
		});
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