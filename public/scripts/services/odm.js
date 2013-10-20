'use strict';

angular.module('mongoConductorApp').service('odm', function odm() {

  var from = function(fields, parent) {
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

                field.children = (Object.keys(fields[key]).length > 0 ? from(fields[key], field) : {});
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

                field.children = (fields[key].length > 0 ? from(fields[key][0], field) : {})
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

  var to = function(fields) {

    if (fields) {
      var keys = Object.keys(fields);
      angular.forEach(keys, function(key) {

        // remove name
        delete fields[key].id;
        delete fields[key].name;
        delete fields[key].parent;

        // change array type to array
        if (fields[key].type === 'Array') {
          fields[key] = [JSON.parse(JSON.stringify(to(fields[key].children)))];
          delete fields[key].children;
        }

        // change mixed type to object
        if (fields[key].type === 'Mixed') {
          fields[key] = JSON.parse(JSON.stringify(to(fields[key].children)));
          delete fields[key].children;
        }
      });
    }

    return fields;
  };

  var copy = function(fields) {

    var newFields = {};
    var ignore = ['id', 'name', 'parent', '$$hashKey', 'children'];

    if (fields && typeof fields === 'object') {
      var keys = Object.keys(fields);
      angular.forEach(keys, function(key) {

        if (ignore.indexOf(key) === -1) {

          if (fields[key].type === 'Array') {

            // change array type to array
            if (fields[key].children) {
              newFields[key] = [JSON.parse(JSON.stringify(copy(fields[key].children)))];
            } else {
              newFields[key] = [];
            }
          } else if (fields[key].type === 'Mixed') {

            // change mixed type to object
            if (fields[key].children) {
              newFields[key] = JSON.parse(JSON.stringify(copy(fields[key].children)));
            } else {
              newFields[key] = { 'type': 'Mixed' };
            }
          } else if (fields[key]) {

            // change all other types
            newFields[key] = JSON.parse(JSON.stringify(copy(fields[key])));
          }
        }

      });
      return newFields;
    } else {
      if (fields) {
        return JSON.parse(JSON.stringify(fields));
      }
    }
  };


  var json = function(fields, isArray) {
    var json = copy(fields);
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

  return {
    'to': to,
    'from': from,
    'copy': copy,
    'json': json
  };
});