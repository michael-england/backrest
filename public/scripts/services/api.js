'use strict';

angular.module('mongoConductor').factory('api', function($http) {

  // Public API here
  return {

    create: function(options) {

      if (!options) {
        throw 'Invalid Argurment: options is required.';
      }

      if (!options.collection) {
        throw 'Invalid Argurment: options.collection is required.';
      }

      if (!options.document) {
        throw 'Invalid Argurment: options.document is required.';
      }

      // build the service url
      var url = '/api/collections/' + options.collection;

      // execute the service call
      $http({
        'method': 'POST',
        'url': url,
        'data': options.document,
        'cache': false
      }).success(options.success);
    },

    update: function(options) {

      if (!options) {
        throw 'Invalid Argurment: options is required.';
      }

      if (!options.collection) {
        throw 'Invalid Argurment: options.collection is required.';
      }

      if (!options.document) {
        throw 'Invalid Argurment: options.document is required.';
      }

      if (!options.document._id) {
        throw 'Invalid Argurment: options.document._id is required.';
      }

      // build the service url
      var url = '/api/collections/' + options.collection + '/' + options.document._id;

      // execute the service call
      $http({
        'method': 'PUT',
        'url': url,
        'data': options.document,
        'cache': false
      }).success(options.success);
    },

    read: function(options) {

      if (!options) {
        throw 'Invalid Argurment: options is required.';
      }

      if (!options.collection) {
        throw 'Invalid Argurment: options.collection is required.';
      }

      // build the service url
      var url = '/api/collections/' + options.collection;
      var params = {};

      if (options._id) {

        // append id to url
        url += '/' + options._id;
      } else {

        // build the parameters
        params = {
          conditions: options.conditions || {},
          sort: options.sort || {
            '_created': -1
          },
          skip: options.skip || 0,
          limit: options.limit || 10
        };
      }

      // execute the service call
      $http({
        'method': 'GET',
        'url': url,
        'params': params,
        'cache': false
      }).success(options.success);
    },

    delete: function(options) {

      if (!options) {
        throw 'Invalid Argurment: options is required.';
      }

      if (!options.collection) {
        throw 'Invalid Argurment: options.collection is required.';
      }

      if (!options._id) {
        throw 'Invalid Argurment: options._id is required.';
      }

      // build the service url
      var url = '/api/collections/' + options.collection + '/' + options._id;

      // execute the service call
      $http({
        'method': 'DELETE',
        'url': url,
        'cache': false
      }).success(options.success);
    },

    login: function(options) {

      if (!options) {
        throw 'Invalid Argurment: options is required.';
      }

      if (!options.email) {
        throw 'Invalid Argurment: options.email is required.';
      }

      if (!options.password) {
        throw 'Invalid Argurment: options.password is required.';
      }

      $http({
        'method': 'POST',
        'url': '/api/users/login',
        'data': {
          'email': options.email,
          'password': options.password
        },
        'cache': false
      }).success(options.success);
    },

    logout: function(options) {

      if (!options) {
        options = {};
      }

      $http({
        'method': 'GET',
        'url': '/api/users/logout',
        'cache': false
      }).success(options.success);
    },

    current: function(options) {

      if (!options) {
        options = {};
      }

      $http({
        'method': 'GET',
        'url': '/api/users/current',
        'cache': false
      }).success(options.success);
    }
  };
});