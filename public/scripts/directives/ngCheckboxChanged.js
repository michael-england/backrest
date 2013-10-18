'use strict';

angular.module('mongoConductorApp').directive('ngCheckboxChanged', function() {
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