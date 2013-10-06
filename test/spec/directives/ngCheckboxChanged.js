'use strict';

describe('Directive: ngCheckboxChanged', function () {

  // load the directive's module
  beforeEach(module('mongoConductor'));

  var element,
    scope;

  beforeEach(inject(function ($rootScope) {
    scope = $rootScope.$new();
  }));

  it('should make hidden element visible', inject(function ($compile) {
    element = angular.element('<filter-changed></filter-changed>');
    element = $compile(element)(scope);
    expect(element.text()).toBe('this is the filterChanged directive');
  }));
});
