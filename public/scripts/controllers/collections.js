'use strict';

angular.module('mongoConductorApp').controller('CollectionsCtrl', function($scope, $routeParams, $parse, api) {

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

  $scope.fieldKeys = function(fields, excludeModelFields) {
    if (fields) {
      var keys = Object.keys(fields).sort();
      if (excludeModelFields) {
        var modelFields = $scope.modelFields();
        angular.forEach(modelFields, function(modelField) {
          var index = keys.indexOf(modelField);
          if (index > -1) {
            keys.splice(index, 1);
          }
        });
      }

      return keys;
    } else {
      return [];
    }
  };

  $scope.fieldNamespace = function(field, name) {

    if (!name) {
      name = field.name;
    }

    if (field.parent) {
      var parent = $scope.fieldNamespace(field.parent);
      if (parent) {
        return parent + '.' + name;
      } else {
        return name;
      }
    } else {
      return name;
    }
  };

  $scope.getModel = function(field) {
    return 'item.' + $scope.fieldNamespace(field);
  };

  $scope.modelFields = function() {
    return Object.keys($scope.collectionModel.definition);
  };

  $scope.isModelField = function(field) {
    return $scope.modelFields().indexOf(field) > -1;
  };

  $scope.firstField = function(fields) {
    if (fields) {

      // list all keys
      var keys = $scope.fieldKeys(fields, true);

      // sort the keys
      keys.sort();

      // select the first key
      return fields[keys[0]] || {
        'id': Math.random(),
        'type': 'Mixed',
        'children': {},
        'parent': fields
      };

    } else {
      return {
        'id': Math.random(),
        'type': 'Mixed',
        'children': {},
        'parent': fields
      };
    }
  };

  $scope.fromOdm = function(fields, parent) {

    if (fields) {
      var keys = Object.keys(fields);
      angular.forEach(keys, function(key) {
        if (fields[key]) {
          if (!fields[key].type) {
            if (['children', 'parent', 'name', 'type'].indexOf(key) < 0) {

              // convert objects
              if (Object.prototype.toString.call(fields[key]) === '[object Object]') {
                var field = {
                  'id': Math.random(),
                  'type': 'Mixed',
                  'name': key,
                  'children': {},
                  'parent': parent
                };

                field.children = (Object.keys(fields[key]).length > 0 ? $scope.fromOdm(fields[key], field) : {});
                fields[key] = field;
              }

              // convert arrays
              if (Object.prototype.toString.call(fields[key]) === '[object Array]') {
                var field = {
                  'id': Math.random(),
                  'type': 'Array',
                  'name': key,
                  'children': {},
                  'parent': parent
                };

                field.children = (fields[key].length > 0 ? $scope.fromOdm(fields[key][0], field) : {})
                fields[key] = field;
              }
            }
          } else {

            // add name from key
            fields[key].id = Math.random();
            fields[key].name = key;
            fields[key].parent = parent;
            fields[key].children = {};
          }
        }
      });
    }

    return fields;
  };

  $scope.toOdm = function(fields) {

    if (fields) {
      var keys = Object.keys(fields);
      angular.forEach(keys, function(key) {

        // remove name
        delete fields[key].id;
        delete fields[key].name;
        delete fields[key].parent;

        // change array type to array
        if (fields[key].type === 'Array') {
          fields[key] = [JSON.parse(JSON.stringify($scope.toOdm(fields[key].children)))];
          delete fields[key].children;
        }

        // change mixed type to object
        if (fields[key].type === 'Mixed') {
          fields[key] = JSON.parse(JSON.stringify($scope.toOdm(fields[key].children)));
          delete fields[key].children;
        }
      });
    }

    return fields;
  };

  $scope.toOdmCopy = function(fields) {

    var newFields = {};
    var ignore = ['id', 'name', 'parent', '$$hashKey', 'children'];

    if (fields && typeof fields === 'object') {
      var keys = Object.keys(fields);
      angular.forEach(keys, function(key) {

        if (ignore.indexOf(key) === -1) {

          // change array type to array
          if (fields[key].type === 'Array') {
            newFields[key] = [JSON.parse(JSON.stringify($scope.toOdmCopy(fields[key].children)))];
          }

          // change mixed type to object
          else if (fields[key].type === 'Mixed') {
            newFields[key] = JSON.parse(JSON.stringify($scope.toOdmCopy(fields[key].children)));
          }

          else {
            newFields[key] = JSON.parse(JSON.stringify($scope.toOdmCopy(fields[key])));
          }
        }

      });
      return newFields;
    } else {
      return JSON.parse(JSON.stringify(fields));
    }
  };

  $scope.toJson = function (isArray) {

    var json = $scope.toOdmCopy($scope.collection.definition);
    if (isArray) {
      json = {
        'data': [json],
        'total': {
          'type': 'Number'
        }
      }
    }

    return JSON.stringify(json, null, '\t');
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
    'ObjectId',
    'Array'
  ];


  $scope.role = $scope.roles[0];

  $scope.collection = {};
  $scope.fieldNameFocused = false;
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

        // change odm to definition
        $scope.collection.definition = $scope.fromOdm($scope.collection.definition, $scope.collection.definition);

        // select first field
        $scope.field = $scope.firstField($scope.collection.definition);

        // list items from the collection
        $scope.list.page();
      }
    });
  } else {

    // copy the collection definition
    angular.copy($scope.collectionModel, $scope.collection);

    // show the edit pane
    angular.element('#collectionFlipPanel').toggleClass('flip');

    // change odm to definition
    $scope.collection.definition = $scope.fromOdm($scope.collection.definition, $scope.collection.definition);

    // select first field
    $scope.field = $scope.firstField($scope.collection.definition);
  }

  $scope.isItemChanged = function() {
    return !angular.equals($scope.item, $scope.itemOriginal);
  };

  $scope.saveItem = function() {
    if (angular.element(formItem).hasClass("ng-valid")) {
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
    } else {
      return false;
    }
  };

  $scope.editItem = function(item) {
    $scope.modalTitle = 'Edit ' + $scope.collection.name;
    $scope.modalMode = 'EDIT';
    $scope.item = item;
    $scope.itemOriginal = angular.copy($scope.item);
  };

  $scope.cancelItem = function() {
    angular.copy($scope.itemOriginal, $scope.item);
  };

  $scope.addItem = function() {
    $scope.modalTitle = 'Add ' + $scope.collection.name;
    $scope.modalMode = 'ADD';
    $scope.item = {};
    $scope.itemOriginal = angular.copy($scope.item);
  };

  $scope.deleteItem = function(item) {
    $scope.item = item;
  };

  $scope.deleteItemConfirm = function() {
    api.delete({
      'collection': $scope.collection.name,
      '_id': $scope.item._id,
      'success': function() {
        $scope.items.splice($scope.items.indexOf($scope.item), 1);
        $scope.item = {};
        $scope.itemOriginal = angular.copy($scope.item);
      }
    });
  };

  $scope.saveCollection = function() {

    // change definition to odm
    $scope.collection.definition = $scope.toOdm($scope.collection.definition);

    var success = function() {
      angular.element('#collectionFlipPanel').toggleClass('flip');
      $scope.$root.$broadcast('collections.list');
    };

    if ($scope.collection._id) {
      api.update({
        'collection': 'collections',
        'document': $scope.collection,
        'success': success
      });
    } else {
      api.create({
        'collection': 'collections',
        'document': $scope.collection,
        'success': success
      });
    }

    // change odm to definition and re-select first field
    $scope.collection.definition = $scope.fromOdm($scope.collection.definition);
    $scope.field = $scope.firstField($scope.collection.definition);
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
    var element = angular.element('#' + name);
    if (element.attr('ng-required')) {
      return angular.element('#' + name).hasClass('ng-valid');
    } else {
      return true;
    }
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

  $scope.addField = function(parent) {

    var fields;
    if (parent) {
      fields = parent.children;
    } else {
      fields = $scope.field.parent;
    }

    if (!fields) {
      fields = $scope.collection.definition;
    }

    var keys = Object.keys(fields);
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

    // add the new field to the defition
    fields[newFieldKey] = {
      'id': Math.random(),
      'type': 'String',
      'name': newFieldKey,
      'children': {},
      'parent': parent || $scope.field.parent
    };

    // select new field
    $scope.field = fields[newFieldKey];

    // namespace of new field
    var fieldNamespace = $scope.fieldNamespace($scope.field);

    // add the field to the filter
    angular.forEach($scope.roles, function(role) {

      if ($scope.collection.filter.readFilter[role.name].indexOf(fieldNamespace) === -1) {
        $scope.collection.filter.readFilter[role.name].push(fieldNamespace);
      }

      if ($scope.collection.filter.writeFilter[role.name].indexOf(fieldNamespace) === -1) {
        $scope.collection.filter.writeFilter[role.name].push(fieldNamespace);
      }
    });
  };

  $scope.deleteField = function() {

    // add the field to the filter
    angular.forEach($scope.roles, function(role) {

      var indexRead = $scope.collection.filter.readFilter[role.name].indexOf($scope.fieldNamespace($scope.field.name));
      if (indexRead > -1) {
        $scope.collection.filter.readFilter[role.name] = $scope.collection.filter.readFilter[role.name].splice(indexRead, 1);
      }

      var indexWrite = $scope.collection.filter.writeFilter[role.name].indexOf($scope.fieldNamespace($scope.field.name));
      if (indexWrite > -1) {
        $scope.collection.filter.writeFilter[role.name] = $scope.collection.filter.writeFilter[role.name].splice(indexWrite, 1);
      }
    });

    var parent = $scope.field.parent.children || $scope.field.parent;

    // delete the field from the parent
    delete parent[$scope.field.name];

    // select first field
    var field = $scope.firstField(parent);
    if (!field || !field.id) {
      field = $scope.firstField($scope.collection.definition);
    }

    $scope.field = field;
  };

  $scope.fieldNameFocus = function() {
    $scope.fieldNameFocused = true;
  };

  $scope.fieldNameBlur = function() {
    $scope.fieldNameFocused = false;
  };

  $scope.$watch('field.name', function(newValue, oldValue) {
    if (newValue !== oldValue && $scope.fieldNameFocused) {

      // namespace of new field
      var oldFieldNamespace = $scope.fieldNamespace($scope.field, oldValue);
      var newFieldNamespace = $scope.fieldNamespace($scope.field, newValue);

      // ensure filters are maintained
      angular.forEach($scope.roles, function(role) {

        // update read index
        var indexRead = $scope.collection.filter.readFilter[role.name].indexOf(oldFieldNamespace);
        if (indexRead > -1) {
          $scope.collection.filter.readFilter[role.name].splice(indexRead, 1);
          if ($scope.collection.filter.readFilter[role.name].indexOf(newFieldNamespace) === -1) {
            $scope.collection.filter.readFilter[role.name].push(newFieldNamespace);
          }
        }

        // update write index
        var indexWrite = $scope.collection.filter.writeFilter[role.name].indexOf(oldFieldNamespace);
        if (indexWrite > -1) {
          $scope.collection.filter.writeFilter[role.name].splice(indexWrite, 1);
          if ($scope.collection.filter.writeFilter[role.name].indexOf(newFieldNamespace) === -1) {
            $scope.collection.filter.writeFilter[role.name].push(newFieldNamespace);
          }
        }
      });

      var parent = $scope.field.parent.children || $scope.field.parent;
      if (parent[oldValue]) {
        parent[newValue] = parent[oldValue];
        $scope.field = parent[newValue];
        delete parent[oldValue];
      }
    }
  });

  $scope.editRole = function(role) {
    $scope.role = role;
  };

  $scope.hasFilter = function(role, field, filter) {
    var fieldNamespace = $scope.fieldNamespace(field);
    var index = $scope.collection.filter[filter][role.name].indexOf(fieldNamespace);
    return index > -1;
  };

  $scope.updateFilter = function(role, field, filter) {
    var fieldNamespace = $scope.fieldNamespace(field);
    var index = $scope.collection.filter[filter][role.name].indexOf(fieldNamespace);
    if (index > -1) {
      $scope.collection.filter[filter][role.name].splice(index, 1);
    } else {
      $scope.collection.filter[filter][role.name].push(fieldNamespace);
    }
  };

  $scope.datepicker = function (name) {
    angular.element('#' + name).datetimepicker();
  }
});