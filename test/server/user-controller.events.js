const db = require('../../lib/db');
const expect = require('expect.js');

var eventIds = [];

module.exports = {
	'order': 9.1,
	'method': 'GET',
	'url': '/api/users/{_id}',
	'description': 'should run events',
	'before': () => {
		var events = db.collection('events');
		events.insert({
			'collection': 'users',
			'event': 'afterRead',
			'script': 'data.event1 = 1;done();',
		}, (error, data) => {
			eventIds.push(data._id);
		});

		// increment event 1 to verify order of events
		events.insert({
			'collection': 'users',
			'event': 'afterRead',
			'script': 'data.event2 = data.event1 + 1;done();',
		}, (error, data) => {
			eventIds.push(data._id);
		});
	},
	'assertions': (result, done) => {
		db.collection('events').remove({
			'_id': {
				'$in': eventIds
			}
		});

		expect(result.event1).to.equal(1);
		expect(result.event2).to.equal(2);
		done();
	},
	'after': () => {
		db.collection('events').remove({
			'_id': {
				'$in': eventIds
			}
		});
	}
};