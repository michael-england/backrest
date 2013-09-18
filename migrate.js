db.users.find().forEach(function(user) {

	var update = {};

	// update created date
	if (user._created && !(user._created instanceof Date)) {
		update._created = new Date(user._created * 1000);
	}

	// update modified date
	if (user._modified && !(user._modified instanceof Date)) {
		update._modified = new Date(user._modified * 1000);
	}

	// update last login
	if (user._lastLogin && !(user._lastLogin instanceof Date)) {
		update._lastLogin = new Date(user._lastLogin * 1000);
	}

	// update salt and hash
	if (user.password) {
		var passwordParts = user.password.split("$")
		if (passwordParts.length = 3) {

			if (!user.salt) {
				update.salt = passwordParts[1];
			}

			if (!user.hash) {
				update.hash = passwordParts[2];
			}
		} else {

			if (!user.salt) {
				update.salt = "";
			}

			if (!user.hash) {
				update.hash = "";
			}
		}
	} else {

		if (!user.salt) {
			update.salt = "";
		}

		if (!user.hash) {
			update.hash = "";
		}
	}

	// execute the update
	db.users.update({
		_id: user._id
	}, {
		$set: update
	});
});