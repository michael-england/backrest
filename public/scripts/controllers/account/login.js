'use strict';

angular.module('mongoConductorApp').controller('AccountLoginCtrl', function($scope, $location, api) {
  $scope.login = function() {

    // mark the form as being submitted
    $scope.formLogin.submitted = true;

    // clear validation
    $scope.formLogin.validationSummary = [];

    // continue only if form is valid
    if ($scope.formLogin.$valid) {

      // log the user in
      api.login({
        'email': $scope.email,
        'password': $scope.password,
        'success': function(data, status, headers, config) {

          // reload collection list
          $scope.$root.list();

          // store user profile
          $scope.$root.user = data;

          // re-route to home
          $location.path('/');
        },
        'error': function(data, status, headers, config) {

          // reset submission state
          $scope.formLogin.submitted = false;

          // show invalid login message
          if (status === 401) {
            $scope.formLogin.validationSummary = [
              'Invalid email address or password.'
            ];
          }
        }
      });
    }
  };
});