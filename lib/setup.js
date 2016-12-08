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
			var parts = fileName.split('.');
			var collectionName = parts[0];
			var collection = db.collection(collectionName);

			if (data instanceof Array) {
				return promises.push(new Promise((resolve, reject) => {
					if (data.length > 0) {
						data.forEach((item) => {
							item._id = db.ObjectId(item._id.$oid);
							item._created = new Date();
							item._modified = new Date();
						});

						collection.save(data, (error) => {
							if (error) {
								return reject(error);
							}

							resolve();
						});
					} else {
						resolve();
					}
				}));
			}

			promises.push(new Promise((resolve, reject) => {
				data._id = db.ObjectId(data._id.$oid);
				data._created = new Date();
				data._modified = new Date();
				collection.save(data, (error) => {
					if (error) {
						return reject(error);
					}

					resolve();
				});
			}));

		});

		return Promise.all(promises);
	}
};