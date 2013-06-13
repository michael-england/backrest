require.config({
    paths: {
        jquery: "//cdnjs.cloudflare.com/ajax/libs/jquery/1.7.1/jquery.min",
        underscore: "//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.4.4/underscore-min",
        backbone: "//cdnjs.cloudflare.com/ajax/libs/backbone.js/1.0.0/backbone-min",
        bootstrap: "//cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.1/js/bootstrap.min",
        codemirror: "//cdnjs.cloudflare.com/ajax/libs/codemirror/3.12.0/codemirror.min",
        codemirrorJavascript: "//cdnjs.cloudflare.com/ajax/libs/codemirror/2.36.0/javascript.min",
        text: "//cdnjs.cloudflare.com/ajax/libs/require-text/2.0.5/text",
        app: "app",
        api: "api",
        router: "router"
    },
    shim: {
        "underscore": {
            exports: "_"
        },
        "backbone": {
            deps: ["underscore", "jquery"],
            exports: "Backbone"
        },
        "bootstrap": {
            deps: ["jquery"]
        },
        "codemirror": {
            exports: "CodeMirror"
        },
        "codemirrorJavascript": {
            deps: ["codemirror"]
        }
    }
});

requirejs.catchError = true;
requirejs.onError = function (error) {};

require(["app", "api", "bootstrap", "codemirror", "codemirrorJavascript", "jquery"], function (App, Api) {

    // retrieve settings
    Api.call("_settings", "get", null, function (settings) {

        // store globally
        window.Settings = settings;

        // init the app
        App.initialize();

    }.bind(this));
});