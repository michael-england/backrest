var request = require("superagent");
var expect = require("expect.js");
var mongojs = require("mongojs");

function createJsonWrapper (method, json) {
	return {
		"jsonrpc": "2.0",
		"method": method,
		"params": json,
		"id": Math.round(Math.random() * 10000000)
	};
}

function assertText(response, text) {
	expect(response).to.exist;
	expect(response.status).to.equal(200);
	expect(response.text).to.contain(text);
}

function assertNumber(response, number) {
	var json = JSON.parse(response.text);
	expect(response).to.exist;
	expect(response.status).to.equal(200);
	expect(json.result).to.be(number);
}

function assertLength(response, length) {
	var json = JSON.parse(response.text);
	expect(response).to.exist;
	expect(response.status).to.equal(200);
	expect(json.result.length).to.be(length);
}

var sessionCookie;
var userSave = {
	"firstName":"Save",
	"lastName":"Test",
	"email":"save@element8labs.com",
	"password":"password",
	"passwordConfirm":"password"
};
var userInsert = {
	"firstName":"Insert",
	"lastName":"Test",
	"email":"insert@element8labs.com",
	"password":"password",
	"passwordConfirm":"password"
};


describe("Load Static File", function() {
	it ("Index.html can be loaded.", function(done){
		request.get("http://localhost:8080/").end(function(res){
			expect(res).to.exist;
			expect(res.status).to.equal(200);
			expect(res.text).to.contain("MongoConductor");
			done();
		});
	});
});

describe("MongoDB Methods:", function () {

	before(function(done){

		// connect to the database
		var db = mongojs("db", ["users"]);

		// remove existing test user
		db.users.remove({"email":{"$in":[userSave.email, userInsert.email]}}, function (error, result) {
			done();
		});
	});

	it ("save", function(done){
		var json = createJsonWrapper("save", userSave);
		request.post("http://localhost:8080/users").send(json).end(function (response) {
			assertText(response, userSave.email);

			// append id to user
			var json = JSON.parse(response.text);
			userSave._id = json.result._id;
			done();
		});
	});

	after(function(done) {

		// connect to the database
		var db = mongojs("db", ["users"]);

		// manually add the user tot he admin role
		db.users.update({"_id":db.ObjectId(userSave._id)}, {"$set": {"roles": ["admin"]}}, function (error, result) {
			done();
		});
	});
});

describe("Authentication Methods:", function() {
	it ("Login", function(done){
		var json = createJsonWrapper("login", {
			"email":userSave.email,
			"password":userSave.password
		});
		request.post("http://localhost:8080/users").send(json).end(function (response) {
			sessionCookie = response.header["set-cookie"]
			assertText(response,userSave.email);
			done();
		});
	});

	it ("changePassword", function(done){
		var json = createJsonWrapper("changePassword", {
			"password":userSave.password,
			"newPassword":userSave.password + "2",
			"confirmPassword":userSave.password + "2"
		});
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertText(response,"Password successfully changed.");
			done();
		});
	});

	it ("requestEmailConfirmation.", function(done){
		this.timeout(8000);
		var json = createJsonWrapper("confirmEmailRequest", {
			"email":userSave.email
		});
		request.post("http://localhost:8080/users").send(json).end(function (response) {
			assertText(response,"true");
			done();
		});
	});

	it ("requestPasswordReset.", function(done){
		this.timeout(4000);
		var json = createJsonWrapper("passwordResetRequest", {
			"email":userSave.email
		});
		request.post("http://localhost:8080/users").send(json).end(function (response) {
			assertText(response,"true");
			done();
		});
	});
});

describe("MongoDB Methods:", function () {

	// Wraps count to return a count of the number of documents in a collection or matching a query.
	it ("count", function (done) {
		var json = createJsonWrapper("count", {
			"_id":userSave._id
		});
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertNumber(response, 1);
			done();
		});
	});


	//Performs a query on a collection and returns a cursor object.
	it ("find", function (done) {
		var json = createJsonWrapper("find", {
			"_id":userSave._id
		});
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertLength(response, 1);
			done();
		});
	});

	// Atomically modifies and returns a single document.
	it ("findAndModify", function (done) {
		userSave.firstName = "findAndModify";
		userSave.lastName = "Test";
		var json = createJsonWrapper("findAndModify", {
			"query":{
				"_id":userSave._id
			},
			"update": { "$set": {
				"firstName":userSave.firstName
			}}
		});

		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertText(response, userSave.email);
			done();
		});
	});

	// Performs a query and returns a single document.
	it ("findOne", function (done) {
		var json = createJsonWrapper("findOne", {
			"_id":userSave._id
		});
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertText(response, userSave.email);
			done();
		});
	});

	// Provides simple data aggregation function. Groups documents in a collection by a key, and processes the results. Use aggregate() for more complex data aggregation
	it ("group", function (done) {
		var json = createJsonWrapper("group", {
            "cond": {
				"email":userSave.email
            },
            "initial": {
                "count": 0
            },
            "key": {"_id":1},
            "reduce": "function(doc, out){out.count++;}",
            "finalize": "function(out){}"
		});
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			var json = JSON.parse(response.text);
			expect(response).to.exist;
			expect(response.status).to.equal(200);
			expect(json.result[0].count).to.be(1);
			done();
		});
	});

	// Performs map-reduce style data aggregation.
	it ("mapReduce", function (done) {
		var json = createJsonWrapper("mapReduce", [
			"function () {emit(this._id, this.email)}",
			"function (_id, email) {return email}",{
				"out":"test_email",
				"query": {
					"email":userSave.email
				}
			}
		]);
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertText(response, userSave.email);
			done();
		});
	});

	// Creates a new document in a collection.
	it ("insert", function (done) {
		var json = createJsonWrapper("insert", userInsert);
		request.post("http://localhost:8080/users").send(json).end(function (response) {
			assertText(response, userInsert.email);

			// append id to user
			var json = JSON.parse(response.text);
			done();
		});
	});

	// Deletes documents from a collection.
	it ("remove", function (done) {
		var json = createJsonWrapper("remove", {"email":userInsert.email});
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertNumber(response, 1);
			done();
		});
	});

	// Modifies a document in a collection.
	it ("update", function (done) {
		userSave.firstName = "Update";
		userSave.lastName = "Test";
		var json = createJsonWrapper("update/admin", [{
			"_id":userSave._id
		},userSave]);
		request.post("http://localhost:8080/users").set("Cookie", sessionCookie).send(json).end(function (response) {
			assertNumber(response, 1);
			done();
		});
	});
});