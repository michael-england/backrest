'use strict';

const async = require('async');
const vm = require('vm');
const db = require('./db');
const constants = require('./constants');
const Data = require('./data');
const Email = require('./email');
const Property = require('./property');

/**
 * Handle events
 * @type {Event}
 */
module.exports = class Event {
	/**
	 * Synchronously execute event handlers on CRUD operations in isolated contexts.
	 * @param {string} collectionName Name of the collection.
	 * @param {string} eventName Name of the event.
	 * @param {object} user User object provided to event handlers.
	 * @param {object} query Query object provided to event handlers.
	 * @param {object} data Data object provided to event handlers.
	 * @returns {Promise}
	 */
	static trigger (collectionName, eventName, user, query, data) {
		return new Promise((resolve, reject) => {
			const events = [
				constants.EVENT.BEFORE_CREATE,
				constants.EVENT.BEFORE_READ,
				constants.EVENT.BEFORE_UPDATE,
				constants.EVENT.BEFORE_DELETE,
				constants.EVENT.AFTER_CREATE,
				constants.EVENT.AFTER_READ,
				constants.EVENT.AFTER_UPDATE,
				constants.EVENT.AFTER_DELETE
			];

			if (events.indexOf(eventName) === -1) {
				return reject(constants.ERROR.INVALID_EVENT);
			}

			db.collection(constants.COLLECTION.EVENTS).find({
				collection: collectionName,
				event: eventName
			}, (error, events) => {
				if (error) {
					return reject(error);
				}

				async.eachSeries(events, (event, done) => {
					const script = new vm.Script(event.script, {
						timeout: 5000
					});

					script.runInNewContext({
						require: () => {
							throw new Error("Not supported");
						},
						done, Data, Email, Property, user, query, data
					}, {
						timeout: 5000
					});
				}, (error) => {
					if (error) {
						return reject(error);
					}

					resolve({query, data});
				});
			});
		});
	}
};