'use strict';

describe('Directive: ngAttribute', function () {
  beforeEach(module('publicApp'));

  var element;

  it('should make hidden element visible', inject(function ($rootScope, $compile) {
    element = angular.element('<ng-attribute></ng-attribute>');
    element = $compile(element)($rootScope);
    expect(element.text()).toBe('this is the ngAttribute directive');
  }));
});
