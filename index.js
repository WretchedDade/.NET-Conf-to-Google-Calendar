const fs = require('fs');
const fetch = require('node-fetch');
const readline = require('readline');
const { DateTime } = require('luxon');
const { google } = require('googleapis');
const { timeStamp } = require('console');
const { match } = require('assert');
const { EventEmitter } = require('events');

const TOKEN_PATH = 'token.json';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CALENDAR_ID = 'c_15gqt8la1pph32lhjkbo6fh8sk@group.calendar.google.com';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
	if (err) return console.log('Error loading client secret file:', err);
	// Authorize a client with credentials, then call the Google Calendar API.
	authorize(JSON.parse(content), main);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
	const { client_secret, client_id, redirect_uris } = credentials.installed;
	const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

	// Check if we have previously stored a token.
	fs.readFile(TOKEN_PATH, (err, token) => {
		if (err) return getAccessToken(oAuth2Client, callback);
		oAuth2Client.setCredentials(JSON.parse(token));
		callback(oAuth2Client);
	});
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
	});
	console.log('Authorize this app by visiting this url:', authUrl);
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	rl.question('Enter the code from that page here: ', code => {
		rl.close();
		oAuth2Client.getToken(code, (err, token) => {
			if (err) return console.error('Error retrieving access token', err);
			oAuth2Client.setCredentials(token);
			// Store the token to disk for later program executions
			fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
				if (err) return console.error(err);
				console.log('Token stored to', TOKEN_PATH);
			});
			callback(oAuth2Client);
		});
	});
}

/**
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function main(auth) {
	const calendar = google.calendar({ version: 'v3', auth });

	calendar.events.list(
		{
			calendarId: CALENDAR_ID,
			timeMin: DateTime.fromObject({ month: 11, day: 10, year: 2020 }).startOf('day').toISO(),
			timeMax: DateTime.fromObject({ month: 11, day: 12, year: 2020 }).endOf('day').toISO(),
			singleEvents: true,
			orderBy: 'startTime',
		},
		(error, response) => {
			if (error) return console.log('The API returned an error: ' + error);

			const events = response.data.items;

			if (events.length) {
				let event;
				let interval = setInterval(() => {
					if (!events.length) clearInterval(interval);

					event = events.shift();

					if (event) {
						calendar.events.delete({
							auth,
							calendarId: CALENDAR_ID,
							eventId: event.id,
							sendUpdates: 'none',
						});
					}
				}, 1_000);
			}
		}
	);

	const agenda = fs.readFileSync('agenda.html');

	const regex = /<tr>[^]*?<strong>([^]*?)<\/strong>[^]*?<p class="time" data-time="([^]*?)">[^]*?<p>([^]*?)<\/p>[^]*?<\/tr>/gm;

	let result, title, time, description;
	let sessions = [];

	while ((result = regex.exec(agenda)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (result.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		[_, title, time, description] = result;

		sessions.push({
			title: title.trim().replace(/&nbsp;/, ''),
			time: DateTime.fromISO(time).toUTC(),
			localTime: DateTime.fromISO(time).toLocal(),
			description: description
				.trim()
				.replace(/([\r\n\t])/g, ' ')
				.replace(/       /g, ' '),
		});
	}

	fs.writeFileSync('temp.json', JSON.stringify(sessions, null, 4));

	let interval = setInterval(() => {
		if (!sessions.length) clearInterval(interval);

		const session = sessions.shift();
		const nextSession = sessions[0];

		let endDateTime =
			nextSession && nextSession.localTime.day === session.localTime.day
				? nextSession.localTime.toISO()
				: session.localTime.plus({ minutes: 30 }).toISO();

		if (session) {
			calendar.events.insert({
				auth,
				calendarId: CALENDAR_ID,
				requestBody: {
					anyoneCanAddSelf: true,
					end: {
						dateTime: endDateTime,
						timeZone: session.localTime.zone,
					},
					start: {
						dateTime: session.localTime.toISO(),
						timeZone: session.localTime.zone,
					},
					summary: session.title,
					description: session.description,
					transparency: 'transparent',
					location: 'https://www.dotnetconf.net/',
				},
			});
		}
	}, 1_000);
}
