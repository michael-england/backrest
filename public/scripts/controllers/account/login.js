'use strict';

angular.module('publicApp').controller('AccountLoginCtrl', function($scope, $rootScope, $location, api) {
  $scope.login = function() {
    api.login({
      email: $scope.email,
      password: $scope.password,
      success: function(data) {

        // store user profile
        $rootScope.user = data;

        // re-route to home
        $location.path('/');
      }
    });
  };
});