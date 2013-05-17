define([
    "jquery",
    "underscore",
    "backbone",
    "router"
], function ($, _, Backbone, Router) {
    var initialize = function () {
        // Pass in our Router module and call it"s initialize function
        Router.initialize();

        // show warning if running non https
        if (window.location.protocol !== "https:") {
            $("#httpsWarning").removeClass("hide");
        }
    };

    return {
        initialize: initialize
    };
});