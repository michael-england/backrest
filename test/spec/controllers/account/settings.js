'use strict';

describe('Controller: AccountSettingsCtrl', function () {

  // load the controller's module
  beforeEach(module('publicApp'));

  var AccountSettingsCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    AccountSettingsCtrl = $controller('AccountSettingsCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    expect(scope.awesomeThings.length).toBe(3);
  });
});
