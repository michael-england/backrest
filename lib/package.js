'use strict';

const bower = require('bower');
const npm = require('npm');

/**
 * Install and register packages.
 * @type {Package}
 */
module.exports = class Package {
	/**
	 * Install a package from Bower.
	 * @param {string} name Name of package to install.
	 * @param {string} [version] Optional version to install.
	 * @returns {Promise}
	 */
	static installFromBower (name, version) {
		return new Promise((resolve, reject) => {
			let installName = name + (version ? '#' + version : '');
			console.info('Installing bower package: ' + installName);
			bower.commands.install([installName])
					.on('error', reject)
					.on('end', (data) => {
						// package data is actually tucked behind a field
						// which resembles the name of the package being installed.
						let keys = Object.keys(data);
						let packageData;
						if (keys.length > 0) {
							packageData = data[keys[0]];
						}

						resolve(packageData);
					});
		});
	}

	/**
	 * Uninstall a Bower package.
	 * @param {string} name Name of package to install.
	 * @returns {Promise}
	 */
	static uninstallFromBower (name) {
		return new Promise((resolve, reject) => {
			console.info('Uninstalling bower package: ' + name);
			bower.commands.uninstall([name])
					.on('error', reject)
					.on('end', (data) => {
						console.log(data);
						// package data is actually tucked behind a field
						// which resembles the name of the package being installed.
						let keys = Object.keys(data);
						let packageData;
						if (keys.length > 0) {
							packageData = data[keys[0]];
						}

						resolve(packageData);
					});
		});
	}

	/**
	 * Install a package from Node Package Manager (NPM).
	 * @param {string} name Name of package to install.
	 * @param {string} [version] Optional version to install.
	 * @returns {Promise}
	 */
	static installFromNpm (name, version) {
		return new Promise((resolve, reject) => {
			let installName = name + (version ? '@' + version : '');
			console.info('Installing npm package: ' + installName);
			npm.load((error) => {
				if (error) {
					return reject(error);
				}

				// install module ffi
				npm.commands.install([installName], (error, data) => {
					if (error) {
						return reject(error);
					}

					resolve(data);
				});
			});
		});
	}
};