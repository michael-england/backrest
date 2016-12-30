'use strict';

const fs = require('fs');
const bower = require('bower');
const db = require('../lib/db');

/**
 * Setup a new instance
 * @type {Setup}
 */
module.exports = class Setup {

	/**
	 * Initializes a setup for a new instance.
	 * @returns {Promise}
	 */
	static init () {
		return this.importFiles()
				.then(this.installBowerComponents);
	}

	/**
	 * Import json and js files from ../data
	 * @returns {Promise}
	 */
	static importFiles () {
		let fileNames = fs.readdirSync('./data');
		let promises = [];

		fileNames.forEach((fileName) => {
			let data = require('../data/' + fileName);
			let parts = fileName.split('.');
			let collectionName = parts[0];
			let collection = db.collection(collectionName);

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

	static installBowerComponents () {
		return new Promise ((resolve, reject) => {
			db.collection('components').find({
				'type': 'bower'
			}, (error, data) => {
				const packages = data.map((component) => {
					return component.package.source + '@' + component.package.version;
				});

				bower.commands.install(packages)
					.on('error', reject)
					.on('end', resolve);
			});
		});
	}
};