define(["jquery", "underscore", "backbone"], function($, _, Backbone) {

    var AppRouter = Backbone.Router.extend({
        routes: {

            // Default
            "*action": "defaultAction"
        },
        defaultAction: function() {

            loadView("console", "views/console");

        }
    });

    var loadView = function(menu, url, options) {

        // clear the page
        $("#page").html("");

        // show loading progress
        showLoading();

        // highlight appropriate navigation
        $(".nav li").removeClass("active");
        $(".nav #" + menu).addClass("active");

        // load the view
        require([url], function(view) {

            // render the view
            view.render(options);

            // hide loading progress
            hideLoading();

        }.bind(this));
    };

    var showLoading = function() {
        $("#loading").removeClass("hide");
    };

    var hideLoading = function() {
        $("#loading").addClass("hide");
    };

    var initialize = function() {
        var app_router = new AppRouter;
        Backbone.history.start();
    };

    return {
        initialize: initialize
    };
});