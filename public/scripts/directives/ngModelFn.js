'use strict';

angular.module('mongoConductorApp').directive('ngModelFn', function($compile) {
	return {
		restrict: 'A',
		transclude: true,
		link: function(scope, element, attrs) {
			var model = scope.$eval(attrs.ngModelFn);
			if (model) {
				if (!element.attr('ng-model')) {
					element.attr('ng-model', model);
					$compile(element)(scope);
				}
			}
		}
	};
});