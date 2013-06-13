var url = require("url");
var path = require("path");
var fs = require("fs");

module.exports = function(server) {
    return function (error, request, response, next) {

        // throw error to console
        console.log(error);

        try {

            // execute api call
            var query = url.parse(request.url, true).query;

            // parse data to json
            var data = JSON.parse(query.data);

            var json;
            if (query.error) {

                // Internal error occurred, create internal error response
                json = {
                    "code": errorCode,
                    "message": errorMessage
                };

                if (request.validationSummary !== undefined) {
                    json.result = request.validationSummary;
                }

                response.writeHead(200, {
                    "Content-Type": "text/javascript",
                    "Access-Control-Allow-Origin": "*"
                });
                response.end(query.error + "(" + JSON.stringify(json) + ")");
            } else if (query.callback) {

                // Internal error occurred, create internal error response
                json = {
                    "error": {
                        "code": errorCode,
                        "message": errorMessage
                    }
                };

                if (request.validationSummary !== undefined) {
                    json.result = request.validationSummary;
                }

                response.writeHead(200, {
                    "Content-Type": "text/javascript",
                    "Access-Control-Allow-Origin": "*"
                });
                response.end(query.callback + "(" + JSON.stringify(json) + ")");
            } else {

                // Internal error occurred, create internal error response
                json = {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": errorCode,
                        "message": errorMessage
                    },
                    "id": id
                };

                if (request.validationSummary !== undefined) {
                    json.result = request.validationSummary;
                }

                response.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                });
                response.end(JSON.stringify(json));
            }

            next(error);

            // email error
            if (server.settings.mail.messages.errorEmail) {
                if (server.settings.mail.messages.errorEmail.enabled) {

                    // format the email message - textevents.js
                    var mailMessage = JSON.parse(JSON.stringify(server.settings.mail.messages.errorEmail));
                    mailMessage.text = mailMessage.text.replace(/{timestamp}/g, new Date().toString());
                    mailMessage.text = mailMessage.text.replace(/{error}/g, error.stack);
                    mailMessage.text = mailMessage.text.replace(/{url}/g, request.url);
                    mailMessage.text = mailMessage.text.replace(/{method}/g, request.method);
                    mailMessage.text = mailMessage.text.replace(/{headers}/g, JSON.stringify(request.headers, null, 4));
                    mailMessage.text = mailMessage.text.replace(/{session}/g, JSON.stringify(request.session, null, 4));
                    mailMessage.text = mailMessage.text.replace(/{data}/g, data);

                    // format the email message - html
                    if (mailMessage.attachment) {
                        for (var a = 0; a < mailMessage.attachment.length; a++) {
                            if (mailMessage.attachment[a].alternative === true) {
                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{timestamp}/g, new Date().toString());
                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{error}/g, error.stack);
                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{url}/g, request.url);
                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{method}/g, request.method);
                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{headers}/g, JSON.stringify(request.headers, null, 4));
                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{session}/g, JSON.stringify(request.session, null, 4));
                                mailMessage.attachment[a].data = mailMessage.attachment[a].data.replace(/{data}/g, data);
                            }
                        }
                    }

                    // send the email
                    server.mail.send(mailMessage, callback);
                }
            }


        } catch (errorMail) {

            // throw the error if in debug mode
            throw error;
        }
    };
};