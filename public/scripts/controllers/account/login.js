'use strict';

angular.module('mongoConductorApp').controller('AccountLoginCtrl', function($scope, $location, api) {
  $scope.login = function() {
    api.login({
      email: $scope.email,
      password: $scope.password,
      success: function(data) {

        // reload collection list
        $scope.$root.list();
        
        // store user profile
        $scope.$root.user = data;

        // re-route to home
        $location.path('/');
      }
    });
  };
});