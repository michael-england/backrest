'use strict';

angular.module('backrestApp').directive('ngCheckboxChanged', function() {
  return {
    restrict: 'A',
    transclude: true,
    link: function postLink(scope, element, attrs) {
      element.bind('change', function () {
        scope.$eval(attrs.ngCheckboxChanged);
      });
    }
  };
});