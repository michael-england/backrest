'use strict';

describe('Controller: ValidationCtrl', function () {

  // load the controller's module
  beforeEach(module('publicApp'));

  var ValidationCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    ValidationCtrl = $controller('ValidationCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    expect(scope.awesomeThings.length).toBe(3);
  });
});
