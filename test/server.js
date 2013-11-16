var request = require('superagent');
var expect = require('expect.js');
var mongojs = require('mongojs');
var fs = require('fs');
var crypto = require('crypto');

var rmdir = function(path) {
	if (fs.existsSync(path)) {
		fs.readdirSync(path).forEach(function(file, index) {
			var curPath = path + '/' + file;
			if (fs.statSync(curPath).isDirectory()) { // recurse
				rmdir(curPath);
			} else { // delete file
				fs.unlinkSync(curPath);
			}
		});
		fs.rmdirSync(path);
	}
};

var generateToken = function (timeout, algorithm, password, _id) {

	// determine expiration
  var expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + timeout);

  // create and encrypt the token
  var cipher = crypto.createCipher(algorithm, password);
  var token = {};
  token._id = _id;
  token.expiration = expiration;
  token = cipher.update(JSON.stringify(token), 'utf8', 'hex');
  token += cipher.final('hex');
  return token;
};

var sessionCookie;
var _id;
var tests = [{
	'method': 'POST',
	'url': 'http://localhost:8080/api/users',
	'description': 'should create a new user',
	'data': {
		'firstName': 'FirstNameCreate',
		'lastName': 'LastNameCreate',
		'email': 'emailCreate@8bitfactory.co',
		'password': 'password'
	},
	'assertions': function(result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameCreate');
		expect(result.lastName).to.equal('LastNameCreate');
		expect(result.email).to.equal('emailCreate@8bitfactory.co');

		// connect to the database
		var db = mongojs('db', ['users']);

		// manually add the user to the admin role
		db.users.update({
			'_id': db.ObjectId(result._id)
		}, {
			'$set': {
				'roles': ['admin']
			}
		}, function(error, result) {
			done();
		});
	}
}, {
	'method': 'POST',
	'url': 'http://localhost:8080/api/users/login',
	'description': 'should login a user',
	'data': {
		'email': 'emailCreate@8bitfactory.co',
		'password': 'password'
	},
	'assertions': function(result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameCreate');
		expect(result.lastName).to.equal('LastNameCreate');
		expect(result.email).to.equal('emailCreate@8bitfactory.co');
		done();
	}
}, {
	'method': 'PUT',
	'url': 'http://localhost:8080/api/users/{_id}',
	'description': 'should update a user by id',
	'data': {
		'firstName': 'FirstNameUpdate',
		'lastName': 'LastNameUpdate',
		'email': 'emailUpdate@8bitfactory.co'
	},
	'assertions': function(result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameUpdate');
		expect(result.lastName).to.equal('LastNameUpdate');
		expect(result.email).to.equal('emailUpdate@8bitfactory.co');
		done();
	}
}, {
	'method': 'GET',
	'url': 'http://localhost:8080/api/users',
	'description': 'should get a list of users',
	'assertions': function(result, done) {
		expect(result.data.length).to.be.greaterThan(0);
		done();
	}
}, {
	'method': 'GET',
	'url': 'http://localhost:8080/api/users/{_id}',
	'description': 'should get a user by id',
	'assertions': function(result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameUpdate');
		expect(result.lastName).to.equal('LastNameUpdate');
		expect(result.email).to.equal('emailUpdate@8bitfactory.co');
		done();
	}
}, {
	'method': 'POST',
	'url': 'http://localhost:8080/api/users/reset-password-request',
	'description': 'should request a password reset',
	'data': {
		'email': 'emailUpdate@8bitfactory.co'
	},
	'assertions': function(result, done) {
		expect(result).to.be(true);
		done();
	}
}, {
	'method': 'POST',
	'url': 'http://localhost:8080/api/users/reset-password',
	'description': 'should reset a password',
	'data': function () {
		return {
			'token': generateToken(120, 'aes-256-cbc', '012345678', _id),
			'password': 'password'
		};
	},
	'assertions': function(result, done) {
		expect(result).to.be(true);
		done();
	}
}, {
	'method': 'POST',
	'url': 'http://localhost:8080/api/users/confirm-email-request',
	'description': 'should request an email confirmation',
	'data': {
		'email': 'emailUpdate@8bitfactory.co'
	},
	'assertions': function(result, done) {
		expect(result).to.be(true);
		done();
	}
}, {
	'method': 'POST',
	'url': 'http://localhost:8080/api/users/confirm-email',
	'description': 'should confirm an email',
	'data': function () {
		return {
			'token': generateToken(1440, 'aes-256-cbc', '0123456', _id)
		};
	},
	'assertions': function(result, done) {
		expect(result).to.be(true);
		done();
	}
}, {
	'method': 'GET',
	'url': 'http://localhost:8080/api/users/current',
	'description': 'should get the currently logged in user',
	'assertions': function(result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameUpdate');
		expect(result.lastName).to.equal('LastNameUpdate');
		expect(result.email).to.equal('emailUpdate@8bitfactory.co');
		done();
	}
}, {
	'method': 'POST',
	'url': 'http://localhost:8080/api/users/current/is-in-role',
	'description': 'should check wheter a user is in a role',
	'data': {
		'role': 'admin'
	},
	'assertions': function(result, done) {
		expect(result).to.be(true);
		done();
	}
}, {
	'method': 'POST',
	'url': 'http://localhost:8080/api/users/current/change-password',
	'description': 'should change the currently logged in user password',
	'data': {
		'oldPassword': 'password',
		'newPassword': 'password1'
	},
	'assertions': function(result, done) {
		expect(result).to.be(true);
		done();
	}
}, {
	'method': 'DELETE',
	'url': 'http://localhost:8080/api/users/{_id}',
	'description': 'should delete a user by id',
	'assertions': function(result, done) {
		expect(result.salt).to.be(undefined);
		expect(result.hash).to.be(undefined);
		expect(result.firstName).to.equal('FirstNameUpdate');
		expect(result.lastName).to.equal('LastNameUpdate');
		expect(result.email).to.equal('emailUpdate@8bitfactory.co');
		done();
	}
}];

describe('Load Static File', function() {
	it('Index.html can be loaded.', function(done) {
		request.get('http://localhost:8080/').end(function(res) {
			expect(res).to.exist;
			expect(res.status).to.equal(200);
			expect(res.text).to.contain('MongoConductor');
			done();
		});
	});
});

describe('API', function() {

	before(function(done) {

		// connect to the database
		var db = mongojs('db', ['users']);

		// remove existing test user
		db.users.remove({
			'email': {
				'$in': ['emailCreate@8bitfactory.co', 'emailUpdate@8bitfactory.co']
			}
		}, function(error, result) {
			done();
		});
	});


	// loop through each test
	tests.forEach(function(test) {
		it(test.description, function(done) {
  		this.timeout(5000);


			var method = test.method.toLowerCase();
			if (method === 'delete') {
				method = 'del';
			}

			var call = request[method](test.url.replace('{_id}', _id));

			// add cookies
			if (sessionCookie) {
				call = call.set('Cookie', sessionCookie);
			}

			// add data
			if (test.method === 'POST' || test.method === 'PUT') {
				if (test.data) {

					var type = Object.prototype.toString.call(test.data);
					if (type === '[object Function]') {
						call = call.send(test.data())
					} else {
						call = call.send(test.data);
					}
				}
			}

			call.end(function(response) {

				// remember cookies
				if (response.header['set-cookie']) {
					sessionCookie = response.header['set-cookie'];
				}

				// basic call assertions
				expect(response).to.exist;
				expect(response.status).to.equal(200);

				// append id to user
				var result = JSON.parse(response.text);
				if (result._id) {
					_id = result._id;
				}

				// check assertions
				if (test.assertions) {

					var type = Object.prototype.toString.call(test.assertions);
					if (type === '[object Array]') {

						// loop through the assertions
						test.assertions.forEach(function(assertion) {
							expect(result[assertion]).to.equal(test.body[assertion]);
						});

						// mark test as complete
						done();
					} else if (type === '[object Function]') {
						test.assertions(result, done);
					} else {

						// mark test as complete
						done();
					}
				} else {

					// mark test as complete
					done();
				}
			});
		});
	});
});



// 	// Upload an image
// 	it ('upload', function (done) {
// 		request.post('http://localhost:8080/')
// 			.set('Cookie', sessionCookie)
// 			.field('_id', userSave._id)
// 			.field('collection', 'users')
// 			.field('method', 'upload')
// 			.attach('avatar', 'avatar.png')
// 			.redirects(0)
// 			.end(function (response) {
// 			expect(response).to.exist;
// 			expect(response.status).to.equal(302);
// 			expect(response.headers.location).to.contain('step=3');
// 			done();
// 		});
// 	});

// 	// cleanup
// 	after (function (done) {
// 		rmdir('../uploads/users/' + userSave._id);
// 		done();
// 	});