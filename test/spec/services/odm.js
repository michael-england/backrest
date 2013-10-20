'use strict';

describe('Service: odm', function () {

  // load the service's module
  beforeEach(module('mongoConductorApp'));

  // instantiate service
  var odm;
  beforeEach(inject(function (_odm_) {
    odm = _odm_;
  }));

  it('should do something', function () {
    expect(!!odm).toBe(true);
  });

});
