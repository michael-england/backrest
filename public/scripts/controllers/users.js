'use strict';
angular.module('mongoConductorApp').controller('UsersCtrl', function($scope, api, odm) {

  $scope.users = [];
  $scope.odm = odm;
  $scope.baseUri = document.location.protocol + '//' + document.location.host;
  $scope.collection = {
    'name': 'users',
    'definition': {
      'firstName': {
        'type': 'String'
      },
      'lastName': {
        'type': 'String'
      },
      'email': {
        'type': 'String'
      },
      'password': {
        'type': 'String'
      },
      '_acl': {
        'type': 'Mixed'
      },
      'hash': {
        'type': 'String'
      },
      'salt': {
        'type': 'String'
      },
      'roles': [],
      '_created': 'Date',
      '_modified': 'Date',
      '_lastLogin': 'Date'
    }
  };

  $scope.apiCalls = [{
    'key': 'collapseUpdate',
    'method': 'PUT',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/{_id}',
    'description': 'Updates a user by id.',
    'include': '/views/documentation/update.html'
  },{
    'key': 'collapseDelete',
    'method': 'DELETE',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/{_id}',
    'description': 'Deletes a user.',
    'include': '/views/documentation/delete.html'
  },{
    'key': 'collapseList',
    'method': 'GET',
    'url': $scope.baseUri + '/api/' + $scope.collection.name,
    'description': 'Gets a list of users.',
    'include': '/views/documentation/getlist.html'
  },{
    'key': 'collapseGet',
    'method': 'GET',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/{_id}',
    'description': 'Gets an individual user by id.',
    'include': '/views/documentation/get.html'
  },{
    'key': 'collapseCreate',
    'method': 'POST',
    'url': $scope.baseUri + '/api/' + $scope.collection.name,
    'description': 'Creates a new user.',
    'include': '/views/documentation/create.html'
  },{
    'key': 'collapseResetPasswordRequest',
    'method': 'POST',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/reset-password-request',
    'description': 'Sends a token to the provided email so a user can reset their password.',
    'include': '/views/documentation/reset-password-request.html'
  },{
    'key': 'collapseResetPassword',
    'method': 'POST',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/reset-password',
    'description': 'Resets a user\'s password using a token previous requested.',
    'include': '/views/documentation/reset-password.html'
  },{
    'key': 'collapseRequestConfirmEmail',
    'method': 'POST',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/confirm-email-request',
    'description': 'Sends a token to the provided email so a user can confirm their account.',
    'include': '/views/documentation/confirm-email-request.html'
  },{
    'key': 'collapseConfirmEmail',
    'method': 'POST',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/confirm-email',
    'description': 'Confirms a users account using a token sent to the user\'s email.',
    'include': '/views/documentation/confirm-email.html'
  },{
    'key': 'collapseCurrent',
    'method': 'GET',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/current',
    'description': 'Gets the currently logged in user.',
    'include': '/views/documentation/current.html'
  },{
    'key': 'collapseCurrentIsInRole',
    'method': 'POST',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/current/is-in-role',
    'description': 'Determines if the currently logged in user is in a role',
    'include': '/views/documentation/current-is-in-role.html'
  },{
    'key': 'collapseCurrentChangePassword',
    'method': 'POST',
    'url': $scope.baseUri + '/api/' + $scope.collection.name + '/current/change-password',
    'description': 'Updates the current user\'s password',
    'include': '/views/documentation/current-change-password.html'
  }];

  $scope.getColor = function (method) {
    switch (method) {
      case 'GET':
        return 'info';
      case 'PUT':
        return 'warning';
      case 'DELETE':
        return 'danger';
      case 'POST':
        return 'success';
    }
  };

  $scope.list = {};
  $scope.list.end = false;
  $scope.list.index = 0;
  $scope.list.loading = false;
  $scope.list.page = function() {
    if (!$scope.list.end && !$scope.list.loading) {

      $scope.list.loading = true;
      api.read({
        'collection': 'users',
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
            if ($scope.users.length < result.total) {
              $scope.list.index++;
              $scope.users = $scope.users.concat(result.data);
            }
          }
          $scope.list.loading = false;
        }
      });
    }
  };

  $scope.save = function() {

    var success = function() {
      $scope.users = [];
      $scope.list.end = false;
      $scope.list.index = 0;
      $scope.list.loading = false;
      $scope.list.page();
    };

    if ($scope.user._id) {
      api.update({
        'collection': 'users',
        'document': $scope.user,
        'success': success
      });
    } else {
      api.create({
        'collection': 'users',
        'document': $scope.user,
        'success': success
      });
    }
  };

  $scope.edit = function(user) {
    $scope.modalTitle = 'Edit User';
    $scope.modalMode = 'EDIT';
    $scope.user = user;
  };

  $scope.add = function() {
    $scope.modalTitle = 'Add User';
    $scope.modalMode = 'ADD';
    $scope.user = {};
  };

  $scope.delete = function(user) {
    $scope.user = user;
  };

  $scope.deleteConfirm = function() {
    api.delete({
      'collection': 'users',
      '_id': $scope.user._id,
      'success': function() {
        $scope.users.splice($scope.users.indexOf($scope.user), 1);
        $scope.user = {};
      }
    });
  };
});