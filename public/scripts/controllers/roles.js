'use strict';
angular.module('mongoConductorApp').controller('RolesCtrl', function($scope, api) {

  $scope.$root.roles = [];

  $scope.list = {};
  $scope.list.end = false;
  $scope.list.index = 0;
  $scope.list.loading = false;
  $scope.list.page = function() {
    if (!$scope.list.end && !$scope.list.loading) {

      $scope.list.loading = true;
      api.read({
        'collection': 'roles',
        'conditions': {},
        'limit': 30,
        'sort': {
          _created: -1
        },
        'skip': ($scope.list.index * 30),
        'success': function(result) {

          if (result.data.length === 0) {
            $scope.list.end = true;
          } else {
            if ($scope.$root.roles.length < result.total) {
              $scope.list.index++;
              $scope.$root.roles = $scope.$root.roles.concat(result.data);
            }
          }
          $scope.list.loading = false;
        }
      });
    }
  };

  $scope.save = function() {
    if ($scope.role._id) {
      api.update({
        'collection': 'roles',
        'document': $scope.role,
        'success': function() {
          $scope.$root.roles = [];
          $scope.list.end = false;
          $scope.list.index = 0;
          $scope.list.loading = false;
          $scope.list.page();
        }
      });
    } else {
      api.create({
        'collection': 'roles',
        'document': $scope.role,
        'success': function(data) {
          $scope.$root.roles = [];
          $scope.list.end = false;
          $scope.list.index = 0;
          $scope.list.loading = false;
          $scope.list.page();
        }
      });
    }
  };

  $scope.edit = function(role) {
    $scope.modalTitle = 'Edit Role';
    $scope.modalMode = 'EDIT';
    $scope.role = role;
  };

  $scope.add = function() {
    $scope.modalTitle = 'Add Role';
    $scope.modalMode = 'ADD';
    $scope.role = {};
  };

  $scope.delete = function(role) {
    $scope.role = role;
  };

  $scope.deleteConfirm = function() {
    api.delete({
      'collection': 'roles',
      '_id': $scope.role._id,
      'success': function() {
        $scope.$root.roles.splice($scope.$root.roles.indexOf($scope.role), 1);
        $scope.role = {};
      }
    });
  };
});