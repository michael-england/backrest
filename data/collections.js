module.exports = [{
	"name": "collections",
	"label": "Collections",
	"isSystemCollection": true,
	"definition": {
		"name": {
			"type": "String"
		},
		"label": {
			"type": "String"
		},
		"definition": {
			"type": "Mixed"
		},
		"filter": {
			"type": "Mixed"
		},
		"_acl": {
			"type": "Mixed"
		},
		"_created": "Date",
		"_modified": "Date"
	},
	"filter": {
		"readFilter": {
			"admin": [
				"name",
				"label",
				"definition",
				"filter",
				"_created",
				"_modified"
			],
			"public": []
		},
		"writeFilter": {
			"admin": [
				"name",
				"label",
				"definition",
				"filter",
				"_created",
				"_modified"
			],
			"public": []
		},
		"sanitize": true
	},
	"_modified": new Date("2014-10-05T00:00:00.000Z"),
	"_created": new Date("2014-10-05T00:00:00.000Z")
}, {
	"name": "users",
	"label": "Users",
	"isSystemCollection": true,
	"definition": {
		"firstName": {
			"label": "First Name",
			"type": "String"
		},
		"lastName": {
			"label": "Last Name",
			"type": "String"
		},
		"email": {
			"label": "Email",
			"type": "String"
		},
		"_acl": {
			"label": "Access Control List",
			"type": "Mixed"
		},
		"hash": {
			"label": "Hash",
			"visible": false,
			"type": "String"
		},
		"salt": {
			"label": "Salt",
			"visible": false,
			"type": "String"
		},
		"isConfirmed": {
			"label": "Is Confirmed",
			"visible": true,
			"type": "Boolean"
		},
		"roles": [],
		"_created": {
			"label": "Created",
			"visible": true,
			"type": "Date"
		},
		"_modified": {
			"label": "Modified",
			"visible": true,
			"type": "Date"
		},
		"_lastLogin": {
			"label": "Last Login",
			"visible": true,
			"type": "Date"
		}
	},
	"filter": {
		"readFilter": {
			"owner": [
				"firstName",
				"lastName",
				"email",
				"_created",
				"_modified",
				"_lastLogin"
			],
			"admin": [
				"firstName",
				"lastName",
				"email",
				"_created",
				"_modified",
				"_lastLogin",
				"roles"
			],
			"public": [
				"firstName",
				"lastName",
				"_created",
				"_modified"
			]
		},
		"writeFilter": {
			"owner": [
				"firstName",
				"lastName",
				"email",
				"_created",
				"_modified",
				"_lastLogin"
			],
			"admin": [
				"firstName",
				"lastName",
				"email",
				"_created",
				"_modified",
				"roles"
			],
			"public": []
		},
		"sanitize": true
	},
	"_modified": new Date("2014-10-05T00:00:00.000Z"),
	"_created": new Date("2014-10-05T00:00:00.000Z")
}, {
	"name": "roles",
	"label": "Roles",
	"isSystemCollection": true,
	"definition": {
		"name": {
			"label": "Name",
			"type": "String"
		},
		"_created": "Date",
		"_modified": "Date"
	},
	"filter": {
		"readFilter": {
			"owner": [
				"name",
				"_created",
				"_modified"
			],
			"admin": [
				"name",
				"_created",
				"_modified"
			],
			"public": []
		},
		"writeFilter": {
			"owner": [
				"name",
				"_created",
				"_modified"
			],
			"admin": [
				"name",
				"_created",
				"_modified"
			],
			"public": []
		},
		"sanitize": true
	},
	"_modified": new Date("2014-10-05T00:00:00.000Z"),
	"_created": new Date("2014-10-05T00:00:00.000Z")
}];