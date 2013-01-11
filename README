Note: README will soon be updated to correspond with recent changes.

MongoRPC

The behavior of MongoRPC depends entirely on the settings.json file.  

Collections	1
Filters	1
Validators	2
Required	3
Compare	4
Range	5
Regular Expression	6
Custom	7


Collections
----------
Collections are mapped directly to the collections wihtin a MongoDB.  Collections consist of a name, filters, and validators. 

{
  "databaseUrl" : "db",
  "collections" : [
    {
      "name" : "users",
      "filters" : [],
      "validators" : [],
      "events": []
    }
  ]
}

Filters
Filters are used to allow or disallow a field entering or leaving MongoRPC for a specific function.  

fieldToFilter: This can be set as any value, however it typically matches a field in a MongoDB.  Additionally, this can be set to a wildcard (“*”).  When setting to a wildcard, the filter will be ran across all fields.  For instance if you wanted to block all fields entering, you would set the fieldToFilter to a wildcard, the “direction” to “in”, and “allowed” to “false”.

direction: Determines whether the filter is processed on data entering a MongoDB through MongoRPC or data being return from a MongoDB through MongoRPC.  Relevent values are “in” for values entering, and “out” for values leaving.

allowed: Determines if the filter allows the field or disallows the field.  This property is boolean and accepts either a true or false value.

functions: An array of function names which determines which MongoDB functions the filter is ran against.  The following are the functions that are allowed:

count
find
findOne
findAndModify
save
update
remove

Example Fitler

{
  "databaseUrl" : "db",
  "collections" : [
    {
      "name" : "users",
      "filters" : [
        {
          "fieldToFilter" : "*",
          "direction" : "in",
          "allowed" : false,
          "functions" : [ "find" ]
        }
      ]
    }
  ]
}

Validators

An array of validators.  Validators ensure fields entering MongoRPC are allowed to be passed through to MongoDB.  If the fields being validate fail, the command being executed against MongoDB will not be executed.  The following is a list of the different types of validators.

Required
This validator requires a field to have a value.  Validation will fail if the field does not have a value.

type: The type of validator.  For the required validator this must be set to “required”.

fieldToValidate: Specifies the field to be validated.

errorMessage: The message to display the field fails to validate.

functions: An array of function names which determines which MongoDB functions the filter is ran against.  The following are the functions that are allowed:

count
find
findOne
findAndModify
save
update
remove

groups: An array of group names that group the current validator with other validators.  If all the groups fail, the command will not be executed, however if one of the groups pass validation, the command will be executed.

Example Required Validator

{
  "httpPort" : "8080",
  "databaseUrl" : "db",
  "collections" : [
    {
      "name" : "users",
      "validators" : [
        {
          "type" : "required",
          "fieldToValidate" : "name",
          "errorMessage" : "Name is required.",
          "functions" : [ "save", "update" ],
          "groups" : [ "groupOne", "groupTwo" ]
        },
      ]
    }
  ]
}


Compare
This validator requires a field against a value or a different field.  

type: The type of validator.  For the compare validator this must be set to “compare”.

fieldToValidate: Specifies the field to be validated.

fieldToCompare: Specifies the field to be compared when being validated.  If this field is null or left empty, the value assigned to valueToCompare will be used.  

valueToCompare: Rather than comparing against a field, a value can be compared.

dataType: Sets the data type for comparing values.  Valid dataType include "string", “integer", "float", "date", or "currency".

operator: Determines how the fieldToValue should be compared against valueToCompare or fieldToCompare. Valid values include “==”, “!=”, “<=”, “>=”, “<“, or “>”.  Only “==” and “!=” operators are valid for the “string” data type.

errorMessage: The message to display the field fails to validate.

functions: An array of function names which determines which MongoDB functions the filter is ran against.  The following are the functions that are allowed:

count
find
findOne
findAndModify
save
update
remove

groups: An array of group names that group the current validator with other validators.  If all the groups fail, the command will not be executed, however if one of the groups pass validation, the command will be executed.

Example Custom Validator

{
  "httpPort" : "8080",
  "databaseUrl" : "db",
  "collections" : [
    {
      "name" : "users",
      "validators" : [
        {
          "type" : "required",
          "fieldToValidate" : "password",
     "fieldToCompare" : "passwordConfirmation",
     "valueToCompare" : null,
     “dateType" : "string",
     "operator" : "==",
          "errorMessage" : "Passwords do not match",
          "functions" : [ "save", "update" ],
          "groups" : [ "groupOne", "groupTwo" ]
        },
      ]
    }
  ]
}

Range
This validator requires a field to be greater than a minimum value and less than a maximum value..  Validation will fail if the field is greater than the maximum value or less than the minimum value.

type: The type of validator.  For the range validator this must be set to “range”.

fieldToValidate: Specifies the field to be validated.

minimumValue: The minimum the value must be to pass validation.

maximumValue: The maximum the value must be to pass validation.

errorMessage: The message to display the field fails to validate.

functions: An array of function names which determines which MongoDB functions the filter is ran against.  The following are the functions that are allowed:

count
find
findOne
findAndModify
save
update
remove

groups: An array of group names that group the current validator with other validators.  If all the groups fail, the command will not be executed, however if one of the groups pass validation, the command will be executed.

Example Range Validator

{
  "httpPort" : "8080",
  "databaseUrl" : "db",
  "collections" : [
    {
      "name" : "users",
      "validators" : [
        {
          "type" : "range",
          "fieldToValidate" : "age",
                      “minimumValue" : 13,
          "maximumValue" : 120,
          "errorMessage" : "Age is needs to be between 13 and 120.",
          "functions" : [ "save", "update" ],
          "groups" : [ "groupOne", "groupTwo" ]
        },
      ]
    }
  ]
}

Regular Expression
This validator requires a field to pass a regularExpression.  Validation will fail if the field does pass the regularExpression.  More on regular expressions can be found here: http://www.regular-expressions.info/

type: The type of validator.  For the required validator this must be set to “regularExpression”.

fieldToValidate: Specifies the field to be validated.

expression: The regular expression the value must pass.

errorMessage: The message to display the field fails to validate.

functions: An array of function names which determines which MongoDB functions the filter is ran against.  The following are the functions that are allowed:

count
find
findOne
findAndModify
save
update
remove

groups: An array of group names that group the current validator with other validators.  If all the groups fail, the command will not be executed, however if one of the groups pass validation, the command will be executed.

Example Regular Expression Validator

{
  "httpPort" : "8080",
  "databaseUrl" : "db",
  "collections" : [
    {
      "name" : "users",
      "validators" : [
        {
          "type" : "regularExpression",
          "fieldToValidate" : "name",
          "expression" : "%5Ba-z0-9%21%23%24%25%26%2….-9%5D%29%3F",
          "errorMessage" : "Name is required.",
          "functions" : [ "save", "update" ],
          "groups" : [ "groupOne", "groupTwo" ]
        },
      ]
    }
  ]
}

Custom
This validator is not yet implemented.
