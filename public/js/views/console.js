define([
    "jquery",
    "underscore",
    "backbone",
    "api",
    "text!/templates/console.html",
    "codemirror",
    "codemirrorJavascript"
], function ($, _, Backbone, Api, template) {
      var consoleView = Backbone.View.extend({
        el: $("#page"),
        events: {
            "click #btnExecute": "btnExecute_Click",
            "click #collection ul li a": "collection_Change",
            "click #method ul li a": "method_Change",
            "click #methodAction ul li a": "methodAction_Change"
        },
        request: {},
        authenticationMethods: ["login", "logout","isAuthenticated","isInRole","changePassword","passwordResetRequest","passwordReset","confirmEmail","confirmEmailRequest"],
        fileMethods: ["upload", "clearUpload"],
        codeMirrorParams: undefined,
        codeMirrorRequestUrl: undefined,
        codeMirrorRequestPost: undefined,
        render: function () {

            // load the template
            $(this.el).html(template);

            // use code mirror for params
            this.codeMirrorParams = CodeMirror(function(elt) {
                $("#params").get(0).parentNode.replaceChild(elt, $("#params").get(0));
            }, {
                value: $("#params").val(),
                lineNumbers: true
            });

            // use code mirror for request url
            this.codeMirrorRequestUrl = CodeMirror(function(elt) {
                $(".request-url").get(0).parentNode.replaceChild(elt, $(".request-url").get(0));
            }, {
                readOnly: true
            });

            // use code mirror for request post
            this.codeMirrorRequestPost = CodeMirror(function(elt) {
                $(".request-post").get(0).parentNode.replaceChild(elt, $(".request-post").get(0));
            }, {
                readOnly: true
            });

            // format empty response
            this.formatResults();

            $("#collection ul li").remove();
            $("#collection ul").append(this.buildItem("None", "None", true));

            var collections = Object.keys(Settings.collections).sort();
            if (collections.length > 0) {

                // add first divider
                $("#collection ul").append(this.buildItemDivider());

                // add collections
                for (var i = 0; i < collections.length; i++) {
                    $("#collection ul").append(this.buildItem(collections[i], collections[i], false));
                }
            }
        },
        btnExecute_Click: function (event) {

            if (this.request.collection !== "None" && this.request.collection !== undefined) {
                if (this.request.method !== "None" && this.request.method !== undefined) {

                    var requestMethod = this.request.method;
                    if (this.request.methodAction !== "None" && this.request.methodAction !== undefined) {
                        requestMethod += "/" + this.request.methodAction;
                    }

                    // make the request
                    Api.call(this.request.collection, requestMethod, $.parseJSON(this.codeMirrorParams.getValue()), function (results) {
                        this.formatResults(results);
                    }.bind(this));

                    // display updated request
                    this.updateRequest();
                }
            }
        },
        collection_Change: function (event) {

            // save collection to request
            this.request.collection = $(event.currentTarget).attr("data-value");

            // select collection
            $("#collection .icon").removeClass("icon-ok");
            $(event.currentTarget).find(".icon").addClass("icon-ok");

            // update selected text
            $("#collection .text").html($(event.currentTarget).attr("data-value"));

            // clear methods
            $("#method ul li").remove();
            $("#method .text").html("None");
            $("#method ul").append(this.buildItem("None", "None", true));
            this.request.method = undefined;

            if (Settings.collections[$(event.currentTarget).attr("data-value")]) {
                var methods = Object.keys(Settings.collections[$(event.currentTarget).attr("data-value")]).sort();
                if (methods.length > 0) {

                    // add first divider
                    $("#method ul").append(this.buildItemDivider());

                    // add collection's authentication methods
                    if ($(event.currentTarget).attr("data-value") === Settings.authentication.collection) {
                        var hasAuthenticationMethods = false;
                        for (var i = 0; i < methods.length; i++) {
                            if (this.authenticationMethods.indexOf(methods[i]) > -1) {

                                if (!hasAuthenticationMethods) {
                                    $("#method ul").append(this.buildItemHeader("Authentication Commands"));
                                    hasAuthenticationMethods = true;
                                }

                                $("#method ul").append(this.buildItem(methods[i], methods[i], false));
                            }
                        }
                    }

                    // add collection's authentication methods
                    var hasFileMethods = false;
                    for (var i = 0; i < methods.length; i++) {
                        if (this.fileMethods.indexOf(methods[i]) > -1) {

                            if (!hasFileMethods) {
                                $("#method ul").append(this.buildItemHeader("File Commands"));
                                hasFileMethods = true;
                            }

                            $("#method ul").append(this.buildItem(methods[i], methods[i], false));
                        }
                    }

                    // add collection's MongoDB commands
                    $("#method ul").append(this.buildItemHeader("MongoDB Commands"));
                    for (var i = 0; i < methods.length; i++) {
                        if (this.authenticationMethods.indexOf(methods[i]) < 0 &&
                            this.fileMethods.indexOf(methods[i]) < 0 ) {
                            $("#method ul").append(this.buildItem(methods[i], methods[i], false));
                        }
                    }
                }
            }

            // clear methodActions
            $("#methodAction ul li").remove();
            $("#methodAction .text").html("None");
            $("#methodAction ul").append(this.buildItem("None", "None", true));
            this.request.methodAction = undefined;
        },
        method_Change: function (event) {

            // save method to request
            this.request.method = $(event.currentTarget).attr("data-value");

            // select method
            $("#method .icon").removeClass("icon-ok");
            $(event.currentTarget).find(".icon").addClass("icon-ok");

            // update selected text
            $("#method .text").html($(event.currentTarget).attr("data-value"));

            // clear methodActions
            $("#methodAction ul li").remove();
            $("#methodAction .text").html("None");
            $("#methodAction ul").append(this.buildItem("None", "None", true));
            this.request.methodAction = undefined;

            if (this.authenticationMethods.indexOf(this.request.method) > -1) {
                $("#methodActionField").hide();
            } else {
                var methodActions = Object.keys(Settings.collections[this.request.collection][$(event.currentTarget).attr("data-value")]).sort();
                if (methodActions.length > 0) {

                    // add first divider
                    $("#methodAction ul").append(this.buildItemDivider());
                    for (var i = 0; i < methodActions.length; i++) {
                        if (methodActions[i] !== "enabled") {
                            $("#methodAction ul").append(this.buildItem(methodActions[i], methodActions[i], false));
                        }
                    }
                }
                $("#methodActionField").show();
            }
        },
        methodAction_Change: function (event) {

            // save methodAction to request
            this.request.methodAction = $(event.currentTarget).attr("data-value");

            // select methodAction
            $("#methodAction .icon").removeClass("icon-ok");
            $(event.currentTarget).find(".icon").addClass("icon-ok");

            // update selected text
            $("#methodAction .text").html($(event.currentTarget).attr("data-value"));
        },
        buildItem: function (text, value, selected) {

            var icon = $("<i />", { "class": "icon"});
            if (selected) {
                icon.addClass("icon-ok");
            }

            var link = $("<a />", { "href": "#", "data-value": value});
            link.append(icon);
            link.append(" " + text);
            var li = $("<li />").append(link);
            return li;
        },
        buildItemDivider: function () {
            return $("<li />", { "class": "divider" });
        },
        buildItemHeader: function (text) {
            return $("<li />", { "class": "dropdown-menu-header", "text": text });
        },
        formatResults: function (results) {

            // clear previous response
            $(".response .CodeMirror").remove();
            $(".response").append($("<div />", { "class": "response-result" }));

            // show the response
            if (results) {
                var codeMirrorresponse = CodeMirror(function(elt) {
                    $(".response-result").get(0).parentNode.replaceChild(elt, $(".response-result").get(0));
                }, {
                    value: JSON.stringify(results, null, "\t"),
                    lineNumbers: true,
                    readOnly: true,
                    viewportMargin: Infinity
                });
            } else {
                var codeMirrorresponse = CodeMirror(function(elt) {
                    $(".response-result").get(0).parentNode.replaceChild(elt, $(".response-result").get(0));
                }, {
                    lineNumbers: true,
                    readOnly: true,
                    viewportMargin: Infinity
                });
            }
        },
        updateRequest: function () {

            if (this.request.collection !== "None" && this.request.collection !== undefined) {
                if (this.request.method !== "None" && this.request.method !== undefined) {

                    // build the url
                    var url = window.location.protocol + "//" + window.location.host + "/" + this.request.collection;
                    this.codeMirrorRequestUrl.setValue(url);

                    var params = this.codeMirrorParams.getValue();
                    if (params === "") {
                        params = undefined;
                    } else {
                        try {
                            params = $.parseJSON(params);
                        } catch (error) {

                        }
                    }

                    // build the data
                    data = {
                        "jsonrpc": "2.0",
                        "method": this.request.method,
                        "params": params,
                        "id": parseInt(Math.random() * 99999999, 10)
                    };
                    if (this.request.methodAction !== "None" && this.request.methodAction !== undefined)  {
                        data.method += "/" + this.request.methodAction;
                    }

                    this.codeMirrorRequestPost.setValue(JSON.stringify(data));
                }
            }
        }
    });
    return new consoleView;
});
