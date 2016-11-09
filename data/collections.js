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
		"acl": {
			"type": "Mixed"
		},
		"_created": "Date",
		"_modified": "Date"
	},
	"acl": {
		"create": {
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
		"read": {
			"admin": [
				"_id",
				"name",
				"label",
				"definition",
				"filter",
				"_created",
				"_modified"
			],
			"public": []
		},
		"update": {
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
		"delete": ["admin"]
	},
	"_modified": new Date(),
	"_created": new Date()
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
		"password": {
			"label": "Password",
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
	"acl": {
		"create": {
			"public": [
				"_id",
				"firstName",
				"lastName",
				"email",
				"password",
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
			]
		},
		"read": {
			"owner": [
				"_id",
				"firstName",
				"lastName",
				"email",
				"_created",
				"_modified",
				"_lastLogin"
			],
			"admin": [
				"_id",
				"firstName",
				"lastName",
				"email",
				"_created",
				"_modified",
				"_lastLogin",
				"roles"
			],
			"public": [
				"_id",
				"firstName",
				"lastName",
				"_created",
				"_modified"
			]
		},
		"update": {
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
		"delete": ["admin"]
	},
	"_modified": new Date(),
	"_created": new Date()
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
	"acl": {
		"create": {
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
		"read": {
			"owner": [
				"_id",
				"name",
				"_created",
				"_modified"
			],
			"admin": [
				"_id",
				"name",
				"_created",
				"_modified"
			],
			"public": []
		},
		"update": {
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
		"delete": ["admin"]
	},
	"_modified": new Date(),
	"_created": new Date()
}];