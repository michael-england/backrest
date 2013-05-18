[logo]: https://github.com/michael-england/mongoConductor/raw/master/client/img/logo.png "mongoConductor"

mongoConductor is JSON-RPC server for MongoDB written in node.js and can be accessed through HTTP or HTTPS.  The behavior of mongoConductor depends entirely on the settings.json file.  Below are settings and their descriptions.

##Installation
```
  git clone http://github.com/michael-england/mongoConductor.git
  cd mongoConductor
  npm install
  node server.js
```
Depending on your environment you may need to change the http/https port (it's port 80 by default) configuration in settings.json or sudo the last command.  Once running you can browse to http://localhost and start playing with the debug console.  Note: this console is not available once debug mode is turned off.

##Collections
Collections are mapped directly to the collections within a MongoDB database.  An example of a users collection is below.  The collection below is named “users”.  This collection includes the find method.  Each method can be enabled or disabled, and can contain variations (or different actions) for controlling data input and output.  

For instance the default action below can be used to display a list of owners, but can only be executed by users in the admin role.  Another action could be created to display a list of users related to another user.  Each action contains fields for “roles”, “filters”, “validators”, and “events”.
```javascript
{
  "databaseUrl" : "db",
  "collections" : [
    "users" : {
      "find" : {
        "enabled" : true,
        "default" : {
          "roles" : [ "admin" ],
          "filters" : [],
          "validators" : [],
          "events": []
        }
      }
    }
  ]
}
```

##Filters
Filters are used to allow or disallow a field entering or leaving mongoConductor for a specific function.  

__fieldToFilter__: This can be set as any value, however it typically matches a field in a MongoDB.  Additionally, this can be set to a wildcard (“*”).  When set to a wildcard, the filter will be ran across all fields.  For instance if you wanted to block all fields entering, you would set the fieldToFilter to a wildcard, the “direction” to “in”, and “allowed” to “false”.

__direction__: Determines whether the filter is processed on data entering a MongoDB through mongoConductor or data being return from a MongoDB through mongoConductor.  Relevant values are “in” for values entering, and “out” for values leaving.

__allowed__: Determines if the filter allows the field or disallows the field.  This property is boolean and accepts either a true or false value.

__Example Filter__

```javascript
{
  "databaseUrl" : "db",
  "collections" : [
    "users" : {
      "find" : {
        "enabled" : true,
        "default" : {
          "roles" : [],
          "filters" : [
            {
              "fieldToFilter" : "*",
              "direction" : "in",
              "allowed" : false,
            }
          ],
          "validators" : [],
          "events": []
        }
      }
    }
  ]
}
```

##Validators

An array of validators.  Validators ensure fields entering mongoConductor are allowed to be passed through to MongoDB.  If the fields being validate fail, the command being executed against MongoDB will not be executed.  The following is a list of the different types of validators.

###Required
This validator requires a field to have a value.  Validation will fail if the field does not have a value.

__type__: The type of validator.  For the required validator this must be set to “required”.

__fieldToValidate__: Specifies the field to be validated.

__errorMessage__: The message to display the field fails to validate.

__Example Required Validator__

```javascript
{
  "databaseUrl" : "db",
  "collections" : [
    "users" : {
      "find" : {
        "enabled" : true,
        "default" : {
          "roles" : [ "admin" ],
          "filters" : [],
          "validators" : [
            {
              "type" : "required",
              "fieldToValidate" : "name",
              "errorMessage" : "Name is required."
            }
          ],
          "events": []
        }
      }
    }
  ]
}
```
###Compare
This validator requires a field against a value or a different field.  

__type__: The type of validator.  For the compare validator this must be set to “compare”.

__fieldToValidate__: Specifies the field to be validated.

__fieldToCompare__: Specifies the field to be compared when being validated.  If this field is null or left empty, the value assigned to valueToCompare will be used.  

__valueToCompare__: Rather than comparing against a field, a value can be compared.

__dataType__: Sets the data type for comparing values.  Valid dataType include "string", “integer", "float", "date", or "currency".

__operator__: Determines how the fieldToValue should be compared against valueToCompare or fieldToCompare. Valid values include “==”, “!=”, “<=”, “>=”, “<“, or “>”.  Only “==” and “!=” operators are valid for the “string” data type.

__errorMessage__: The message to display the field fails to validate.

__Example Custom Validator__

```javascript
{
  "databaseUrl" : "db",
  "collections" : [
    "users" : {
      "find" : {
        "enabled" : true,
        "default" : {
          "roles" : [ "admin" ],
          "filters" : [],
          "validators" : [
            {
              "type" : "compare",
              "fieldToValidate" : "password",
              "fieldToCompare" : "passwordConfirmation",
              "valueToCompare" : null,
              "dateType" : "string",
              "operator" : "==",
              "errorMessage" : "Passwords do not match"
            }
          ],
          "events": []
        }
      }
    }
  ]
}
```

###Range
This validator requires a field to be greater than a minimum value and less than a maximum value..  Validation will fail if the field is greater than the maximum value or less than the minimum value.

__type__: The type of validator.  For the range validator this must be set to “range”.

__fieldToValidate__: Specifies the field to be validated.

__minimumValue__: The minimum the value must be to pass validation.

__maximumValue__: The maximum the value must be to pass validation.

__errorMessage__: The message to display the field fails to validate.

__Example Range Validator__

```javascript
{
  "databaseUrl" : "db",
  "collections" : [
    "users" : {
      "find" : {
        "enabled" : true,
        "default" : {
          "roles" : [ "admin" ],
          "filters" : [],
          "validators" : [
            {
              "type" : "range",
              "fieldToValidate" : "age",
              "minimumValue" : 13,
              "maximumValue" : 99,
              "errorMessage" : "Age is needs to be between 13 and 99."
            }
          ],
          "events": []
        }
      }
    }
  ]
}
```

###Regular Expression
This validator requires a field to pass a regularExpression.  Validation will fail if the field does pass the regularExpression.  More on regular expressions can be found here: http://www.regular-expressions.info/

__type__: The type of validator.  For the required validator this must be set to “regularExpression”.

__fieldToValidate__: Specifies the field to be validated.

__expression__: The regular expression the value must pass.

__errorMessage__: The message to display the field fails to validate.

__Example Regular Expression Validator__

```javascript
{
  "databaseUrl" : "db",
  "collections" : [
    "users" : {
      "find" : {
        "enabled" : true,
        "default" : {
          "roles" : [ "admin" ],
          "filters" : [],
          "validators" : [
            {
              "type" : "regularExpression",
              "fieldToValidate" : "name",
              "expression" : "%5Ba-z0-9%21%23%24%25%2....-9%5D%29%3F",
              "errorMessage" : "Name is required."
            }
          ],
          "events": []
        }
      }
    }
  ]
}
```

###Custom
This validator is not yet implemented.
