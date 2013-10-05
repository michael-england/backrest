'use strict';

angular.module('mongoConductor').controller('AccountSettingsCtrl', function($scope, $rootScope, api) {
  $scope.save = function() {
    api.update({
      user: $rootScope.user,
      success: function(data) {
        if (data.error) {

        } else {
          $scope.showSuccess = true;
        }
      }
    });
  };
});