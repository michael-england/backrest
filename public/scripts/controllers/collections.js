'use strict';

angular.module('publicApp').controller('CollectionsCtrl', function($scope, $routeParams, api) {

  Array.prototype.naturalSort = function() {
    var a, b, a1, b1, rx = /(\d+)|(\D+)/g,
      rd = /\d+/;
    return this.sort(function(as, bs) {
      a = String(as).toLowerCase().match(rx);
      b = String(bs).toLowerCase().match(rx);
      while (a.length && b.length) {
        a1 = a.shift();
        b1 = b.shift();
        if (rd.test(a1) || rd.test(b1)) {
          if (!rd.test(a1)) {
            return 1;
          }
          if (!rd.test(b1)) {
            return -1;
          }
          if (a1 !== b1) {
            return a1 - b1;
          }
        } else if (a1 !== b1) {
          return a1 > b1 ? 1 : -1;
        }
      }
      return a.length - b.length;
    });
  };

  $scope.definitionKeys = function(definition, excludeModelDefinition) {
    if (definition) {
      var fields = Object.keys(definition).sort();

      if (excludeModelDefinition) {
        var modelFields = Object.keys($scope.collectionModel.definition);
        angular.forEach(modelFields, function(modelField) {
          fields.splice(fields.indexOf(modelField), 1);
        });
      }

      return fields;
    } else {
      return [];
    }
  };

  $scope.modelDefinitionField = function() {
    return Object.keys($scope.collectionModel.definition);
  };

  $scope.isModelDefinitionField = function(field) {
    return Object.keys($scope.collectionModel.definition).indexOf(field) > -1;
  };

  var firstField = function() {

    if ($scope.collection.definition) {

      // list all keys
      var keys = $scope.definitionKeys($scope.collection.definition, true);

      // sort the keys
      keys.sort();

      // select the first key
      return $scope.collection.definition[keys[0]] || {};

    } else {

      return {};
    }
  };

  $scope.collectionModel = {
    'name': 'NewCollection',
    'definition': {
      '_acl': {
        'label': 'Access Control List',
        'type': 'Mixed'
      },
      '_created': {
        'label': 'Created Date',
        'type': 'Date'
      },
      '_modified': {
        'label': 'Modified Date',
        'type': 'Date'
      }
    },
    'filter': {
      'readFilter': {
        'owner': ['_created', '_modified'],
        'admin': ['_created', '_modified'],
        'public': ['_created', '_modified']
      },
      'writeFilter': {
        'owner': ['_created', '_modified'],
        'admin': ['_created', '_modified'],
        'public': []
      },
      'sanitize': true
    }
  };

  $scope.schema = {};
  $scope.schema.types = [
    'String',
    'Number',
    'Date',
    'Buffer',
    'Boolean',
    'Mixed',
    'Objectid',
    'Array'
  ];

  $scope.collection = {};
  $scope.fieldNameFocus = false;
  $scope.items = [];
  $scope.list = {};
  $scope.list.end = false;
  $scope.list.index = 0;
  $scope.list.loading = false;
  $scope.list.refresh = function() {
    $scope.items = [];
    $scope.list.end = false;
    $scope.list.index = 0;
    $scope.list.loading = false;
    $scope.list.page();
  };
  $scope.list.page = function() {
    if ($scope.collection.name) {
      if (!$scope.list.end && !$scope.list.loading) {

        $scope.list.loading = true;
        api.read({
          'collection': $scope.collection.name,
          'conditions': {},
          'limit': 30,
          'sort': {
            '_created': -1
          },
          'skip': ($scope.list.index * 30),
          'success': function(result) {

            if (result.data.length === 0) {
              $scope.list.end = true;
            } else {
              if ($scope.items.length < result.total) {
                $scope.list.index++;
                $scope.items = $scope.items.concat(result.data);
              }
            }
            $scope.list.loading = false;
          }
        });
      }
    }
  };

  if ($routeParams._id) {

    // retrieve the collection
    api.read({
      'collection': 'collections',
      '_id': $routeParams._id,
      'success': function(result) {
        $scope.collection = result;

        if (!$scope.collection.definition) {
          $scope.collection.definition = {};
        }

        var keys = Object.keys($scope.collection.definition);
        angular.forEach(keys, function(key) {
          $scope.collection.definition[key].name = key;
        });

        // select first field
        $scope.field = firstField();

        // list items from the collection
        $scope.list.page();
      }
    });
  } else {

    // copy the collection definition
    angular.copy($scope.collectionModel, $scope.collection);

    // show the edit pane
    angular.element('#collectionFlipPanel').toggleClass('flip');

    // move key to name in scope
    var keys = Object.keys($scope.collection.definition);
    angular.forEach(keys, function(key) {
      $scope.collection.definition[key].name = key;
    });

    // select first field
    $scope.field = firstField();
  }

  $scope.save = function() {
    if ($scope.item._id) {
      api.update({
        'collection': $scope.collection.name,
        'document': $scope.item,
        'success': function() {
          $scope.list.refresh();
        }
      });
    } else {
      api.create({
        'collection': $scope.collection.name,
        'document': $scope.item,
        'success': function() {
          $scope.list.refresh();
        }
      });
    }
  };

  $scope.edit = function(item) {
    $scope.modalTitle = 'Edit ' + $scope.collection.name;
    $scope.modalMode = 'EDIT';
    $scope.item = item;
  };

  $scope.add = function() {
    $scope.modalTitle = 'Add ' + $scope.collection.name;
    $scope.modalMode = 'ADD';
    $scope.item = {};
  };

  $scope.delete = function(item) {
    $scope.item = item;
  };

  $scope.deleteConfirm = function() {
    api.delete({
      'collection': $scope.collection.name,
      '_id': $scope.item._id,
      'success': function() {
        $scope.items.splice($scope.items.indexOf($scope.item), 1);
        $scope.item = {};
      }
    });
  };

  $scope.saveCollection = function() {

    Object.keys($scope.collection.definition);
    angular.forEach(keys, function(key) {
      delete $scope.collection.definition[key].name;
    });

    if ($scope.collection._id) {
      api.update({
        'collection': 'collections',
        'document': $scope.collection,
        'success': function() {
          angular.element('#collectionFlipPanel').toggleClass('flip');
          $scope.$root.$broadcast('collections.list');
        }
      });
    } else {
      api.create({
        'collection': 'collections',
        'document': $scope.collection,
        'success': function() {
          angular.element('#collectionFlipPanel').toggleClass('flip');
          $scope.$root.$broadcast('collections.list');
        }
      });
    }
  };

  $scope.editCollection = function() {
    angular.element('#collectionFlipPanel').toggleClass('flip');
  };

  $scope.cancelCollection = function() {
    angular.element('#collectionFlipPanel').toggleClass('flip');
  };

  $scope.isFieldRequired = function(required) {
    return required ? 'required' : '';
  };

  $scope.isFieldValid = function(name) {
    return angular.element('#' + name).hasClass('ng-valid');
  };

  $scope.deleteCollection = function() {
    api.delete({
      'collection': 'collections',
      '_id': $scope.collection._id,
      'success': function() {
        $scope.collection = undefined;
        $scope.$root.$broadcast('collections.list');
      }
    });
  };

  $scope.editField = function(key, value) {
    $scope.fieldName = key;
    $scope.field = value;
  };

  $scope.addField = function() {

    var keys = Object.keys($scope.collection.definition);
    var pattern = new RegExp(/NewField[0-9]+$/);
    var newFieldKeys = [];

    // look for keys match regular expression
    angular.forEach(keys, function(key) {
      if (pattern.test(key)) {
        newFieldKeys.push(parseInt(key.replace('NewField', ''), 10));
      }
    });

    // sort the new field keys
    newFieldKeys.naturalSort();

    // find the next available index
    var newFieldKeyIndex;
    angular.forEach(newFieldKeys, function(key, index) {
      if (key === index + 1) {
        newFieldKeyIndex = (index + 2);
      }
    });

    // build the new name
    var newFieldKey = 'NewField' + (newFieldKeyIndex || 1);

    //  add the new field to the defition
    $scope.collection.definition[newFieldKey] = {
      type: String,
      name: newFieldKey
    };

    // select new field
    $scope.field = $scope.collection.definition[newFieldKey];

    // add the field to the filter
    var roles = ['owner', 'admin', 'public'];
    angular.forEach(roles, function(role) {

      if ($scope.collection.filter.readFilter[role].indexOf(newFieldKey) === -1) {
        $scope.collection.filter.readFilter[role].push(newFieldKey);
      }

      if ($scope.collection.filter.writeFilter[role].indexOf(newFieldKey) === -1) {
        $scope.collection.filter.writeFilter[role].push(newFieldKey);
      }
    });
  };

  $scope.deleteField = function() {

    // add the field to the filter
    var roles = ['owner', 'admin', 'public'];
    angular.forEach(roles, function(role) {

      var indexRead = $scope.collection.filter.readFilter[role].indexOf($scope.field.name);
      if (indexRead > -1) {
        $scope.collection.filter.readFilter[role] = $scope.collection.filter.readFilter[role].splice(indexRead, 1);
      }

      var indexWrite = $scope.collection.filter.writeFilter[role].indexOf($scope.field.name);
      if (indexWrite > -1) {
        $scope.collection.filter.writeFilter[role] = $scope.collection.filter.writeFilter[role].splice(indexWrite, 1);
      }
    });

    // delete the field from the definition
    delete $scope.collection.definition[$scope.field.name];

    // select first field
    $scope.field = firstField();
  };

  $scope.fieldNameFocus = function() {
    $scope.fieldNameFocus = true;
  };

  $scope.fieldNameBlur = function() {
    $scope.fieldNameFocus = false;
  };

  $scope.$watch('field.name', function(newValue, oldValue) {
    if (newValue !== oldValue && $scope.fieldNameFocus) {

      // ensure filters are maintained
      var roles = ['owner', 'admin', 'public'];
      angular.forEach(roles, function(role) {

        // update read index
        var indexRead = $scope.collection.filter.readFilter[role].indexOf(oldValue);
        if (indexRead > -1) {
          $scope.collection.filter.readFilter[role].splice(indexRead, 1);
          if ($scope.collection.filter.readFilter[role].indexOf(newValue) === -1) {
            $scope.collection.filter.readFilter[role].push(newValue);
          }
        }

        // update write index
        var indexWrite = $scope.collection.filter.writeFilter[role].indexOf($scope.field.name);
        if (indexWrite > -1) {
          $scope.collection.filter.writeFilter[role].splice(indexWrite, 1);
          if ($scope.collection.filter.writeFilter[role].indexOf(newValue) === -1) {
            $scope.collection.filter.writeFilter[role].push(newValue);
          }
        }
      });

      $scope.collection.definition[newValue] = JSON.parse(JSON.stringify($scope.collection.definition[oldValue]));
      $scope.field = $scope.collection.definition[newValue];
      delete $scope.collection.definition[oldValue];
    }
  });
});