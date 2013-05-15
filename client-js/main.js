require.config({
    paths: {
        app: "app",
        jquery: "libs/jquery/jquery",
        underscore: "libs/underscore/underscore",
        backbone: "libs/backbone/backbone",
        bootstrap: "libs/bootstrap/bootstrap",
        codemirror: "libs/codemirror/codemirror",
        codemirrorJavascript: "libs/codemirror/mode/javascript/javascript",
        text: "libs/require/text",
        css: "libs/require/css",
        api: "api",
        formListener: "formListener",
        router: "router",
        fuelux: "libs/fuelux/all"
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

require(["app", "api", "bootstrap", "codemirror", "codemirrorJavascript", "jquery", "fuelux"], function (App, Api) {

    // retrieve settings
    Api.call("_settings", "get", null, function (settings) {

        // store globally
        window.Settings = settings;

        // init the app
        App.initialize();

    }.bind(this));
});