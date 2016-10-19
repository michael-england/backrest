'use strict';

const fs = require('fs');
const db = require('../lib/db');

module.exports = class Setup {
	static init () {
		return this.importFiles();
	}

	static importFiles () {
		var fileNames = fs.readdirSync('./data');
		var promises = [];

		fileNames.forEach((fileName) => {
			var data = require('../data/' + fileName);
			var collectionName = fileName.replace('.js', '');
			var collection = db.collection(collectionName);

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