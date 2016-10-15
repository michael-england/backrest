'use strict';

const fs = require('fs');
const q = require('q');

module.exports = class Setup {
	static init (server) {
		this.server = server;
		var deferred = q.defer();

		// import files
		this.importFiles().then(() => {

			// mark as completed and save to settings
			fs.writeFileSync('./INSTALLED', '');

			// execute any callback
			deferred.resolve();
		});

		return deferred.promise;
	}

	static importFiles () {
		var fileNames = fs.readdirSync('./data');
		var promises = [];

		fileNames.forEach((fileName) => {
			var deferred = q.defer();
			var data = require('../data/' + fileName);
			var collectionName = fileName.replace('.js', '');
			var collection = this.server.db.collection(collectionName);
			
			if (data.length > 0) {
				collection.insert(data, (error) => {
					if (error) {
						deferred.reject(error);
					} else {
						deferred.resolve();
					}
				});
			} else {
				deferred.resolve();
			}

			promises.push(deferred.promise);
		});

		return q.all(promises);
	}
};