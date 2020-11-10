# .NET Conf to Google Calendar

Small and simple Node.JS script that will iterate over the items in the .NET Conf 2020 agenda and add them to a given calendar.

To use, generate a `credentials.json` file for google's APIs and update the calendar ID in `index.js` to match the calendar you wish to add the events too. Once this is done simply install the required dependencies with `npm install` and run the script with `npm start`.