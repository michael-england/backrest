define([
    "jquery",
    "underscore",
    "backbone"], function($, _, Backbone) {
    var api = {};
    api.callback = {};
    api.method = {};
    api.error = {};
    api.call = function(collection, method, data, callback, error) {

        // create the call
        var id = parseInt(Math.random() * 99999999, 10);
        if (false) {

            // save the callback
            if (callback !== undefined) {
                this.callback["Api_Callback_" + id] = callback;
            }

            // save the error
            if (error !== undefined) {
                this.error["Api_Error_" + id] = error;
            }

            // build the data
            data = {
                "collection": collection,
                "json": {
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": data,
                    "id": id
                },
                "origin": this.getOrigin(),
                "callback": undefined,
                "id": id
            };

            // create the json call via iframe proxy
            this.createFrame(id, "//" + window.location.host + "/proxy.html", data);
        } else {

            // save the callback
            if (!window.callback) {
                window.callback = {};
            }

            if (callback !== undefined) {
                window.callback["Api_Callback_" + id] = callback;
            }

            // save the error
            if (!window.error) {
                window.error = {};
            }

            if (error !== undefined) {
                window.error["Api_Error_" + id] = error;
            }

            // build the data
            data = {
                "jsonrpc": "2.0",
                "method": method,
                "params": data,
                "id": id
            };

            // create the jsonp call via script
            this.createScript(id, "//" + window.location.host + "/" + collection, data);
        }
    };

    api.postMessage = function(frame, method, data, origin) {
        var json = {
            "method": method,
            "params": data
        };

        var message = JSON.stringify(json);
        if (frame === "parent") {
            parent.postMessage(message, origin || this.getOrigin());
        } else {
            document.getElementById(frame).contentWindow.postMessage(message, origin || this.getOrigin());
        }
    };

    api.receiveMessage = function(event) {

        // verify postMessage origin
        if (event.origin !== (document.location.protocol + api.host)) {
            if (event.data !== undefined && event.data !== "") {

                try {
                    var data = JSON.parse(event.data);
                    if (data.method !== undefined && data.method !== "") {
                        if (api.method[data.method] !== undefined) {
                            api.method[data.method](data.params);
                        }
                    }
                } catch (e) {

                }
            }
        } else {

            // prase json string
            var data = JSON.parse(event.data);

            // remove api iframe
            if (data.json) {
                if (data.json.id) {
                    var iframe = document.getElementById("Api_Json_" + data.json.id);
                    if (iframe) {
                        if (iframe.parentNode) {
                            iframe.parentNode.removeChild(iframe);

                        }
                    }
                }

                if (data.json.error) {

                    if (api.error["Api_Error_" + data.json.id]) {

                        // execute error
                        api.error["Api_Error_" + data.json.id]({
                            "error": data.json.error,
                            "validationResults": data.json.result
                        });

                        // remove the error
                        try {
                            delete api.error["Api_Error_" + data.json.id];
                        } catch (e) {
                            api.error["Api_Error_" + data.json.id] = undefined;
                        }

                    } else if (api.callback["Api_Callback_" + data.json.id]) {

                        // execute callback
                        api.callback["Api_Callback_" + data.json.id](data.json.result);

                        // remove the callback
                        try {
                            delete api.callback["Api_Callback_" + data.json.id];
                        } catch (e) {
                            api.callback["Api_Callback_" + data.json.id] = undefined;
                        }
                    }

                } else {
                    if (api.callback["Api_Callback_" + data.json.id]) {

                        // execute callback
                        api.callback["Api_Callback_" + data.json.id](data.json.result);

                        // remove the callback
                        try {
                            delete api.callback["Api_Callback_" + data.json.id];
                        } catch (e) {
                            api.callback["Api_Callback_" + data.json.id] = undefined;
                        }
                    }
                }
            }
        }
    };

    api.createFrame = function(id, src, data) {
        var iframe = $("<iframe />");
        iframe.attr("id", "Api_Json_" + id);
        iframe.attr("src", src);
        iframe.attr("style", "display:none;");

        if (data) {
            iframe.load(function() {
                iframe.get(0).contentWindow.postMessage(JSON.stringify(data), document.location.protocol + "//" + window.location.host);
            }.bind(this));
        }

        $("body").append(iframe);
    };

    api.createScript = function (id, src, data) {

        var params = ["data=" + encodeURIComponent(JSON.stringify(data))];

        if (window.callback["Api_Callback_" + id]) {
            params.push("callback=window.callback.Api_Callback_" + id);
        }

        if (window.error["Api_Error_" + id]){
            params.push("error=window.callback.Api_Error_" + id);
        }

        var script = $("<script />");
        script.attr("id", "Api_Json_" + id);
        script.attr("src", src + "?" + params.join("&"));
        $("body").append(script);
    };

    api.getOrigin = function() {
        var portNumber = "";
        portNumber = window.location.host;
        if (portNumber.indexOf(":") > -1) {
            portNumber = portNumber.substring(portNumber.indexOf(":") + 1);
            if (portNumber !== null && portNumber !== "") {
                portNumber = ":" + portNumber;
            }
        } else {
            portNumber = "";
        }

        return document.location.protocol + "//" + document.domain + portNumber + "/";
    };

    window.addEventListener("message", api.receiveMessage.bind(api), false);

    return api;
});