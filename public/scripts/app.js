'use strict';

angular.module('publicApp', ['$strap.directives', 'ui', 'ui.keypress', 'ui.event', 'ui.gravatar', 'infinite-scroll']).config(function($routeProvider) {

  $routeProvider
    .when('/', {
      templateUrl: 'views/main.html',
      controller: 'MainCtrl'
    })
    .when('/myroute', {
      templateUrl: 'views/myroute.html',
      controller: 'MyrouteCtrl'
    })
    .when('/users', {
      templateUrl: 'views/users.html',
      controller: 'UsersCtrl'
    })
    .when('/collections', {
      templateUrl: 'views/collections.html',
      controller: 'CollectionsCtrl'
    })
    .when('/collections/:_id', {
      templateUrl: 'views/collections.html',
      controller: 'CollectionsCtrl'
    })
    .when('/validation', {
      templateUrl: 'views/validation.html',
      controller: 'ValidationCtrl'
    })
    .when('/data', {
      templateUrl: 'views/data.html',
      controller: 'DataCtrl'
    })
    .when('/reports', {
      templateUrl: 'views/reports.html',
      controller: 'ReportsCtrl'
    })
    .when('/account/login', {
      templateUrl: 'views/account/login.html',
      controller: 'AccountLoginCtrl'
    })
    .when('/account/settings', {
      templateUrl: 'views/account/settings.html',
      controller: 'AccountSettingsCtrl'
    })
    .otherwise({
      redirectTo: '/'
    });
}).run(function($rootScope, $location, api) {
  $rootScope.user = {};

  $rootScope.logout = function() {
    api.logout({
      success: function(data) {
        if (data === 'true') {
          $rootScope.user = undefined;
          $location.path('/account/login');
        }
      }
    });
  };

  $rootScope.list = function() {
    api.read({
      'collection': 'collections',
      'conditions': {},
      'limit': 30,
      'sort': {
        'name': 1
      },
      'success': function(result) {
        $rootScope.collections = result.data;
      }
    });
  };

  $rootScope.list();
  $rootScope.$on('collections.list', $rootScope.list);


  api.current({
    success: function(data) {
      if (!data) {
        $location.path('/account/login');
      } else {
        $rootScope.user = data;
      }
    }
  });
});
