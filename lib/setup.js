'use strict';

const fs = require('fs');

module.exports = class Setup {
	static init (server) {
		this.server = server;

		return new Promise((resolve) => {

			// import files
			this.importFiles().then(() => {

				// mark as completed and save to settings
				fs.writeFileSync('./INSTALLED', '');

				// execute any callback
				resolve();
			});
		});
	}

	static importFiles () {
		var fileNames = fs.readdirSync('./data');
		var promises = [];

		fileNames.forEach((fileName) => {
			var data = require('../data/' + fileName);
			var collectionName = fileName.replace('.js', '');
			var collection = this.server.db.collection(collectionName);

			promises.push(new Promise((resolve, reject) => {
				if (data.length > 0) {
					collection.insert(data, (error) => {
						if (error) {
							reject(error);
						} else {
							resolve();
						}
					});
				} else {
					resolve();
				}
			}));
		});

		return Promise.all(promises);
	}
};