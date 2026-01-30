# roster-calendar

Take Roster from Pilot and Convert to ICS subscription.

## Overview

This service allows pilots to send their monthly roster text file from the Qantas crewing system and have it parsed into flights and duties that are then published as an ICS calendar file that can be subscribed to.

## Features

- **Roster Parsing**: Parses Qantas Airways roster text files
- **ICS Calendar Generation**: Converts roster entries to standard ICS format
- **Timezone Support**: Automatically handles timezone information for different airports
  - Australian airports: PER (Perth UTC+8), SYD/MEL (UTC+10/11 with DST), BNE (UTC+10), etc.
  - International destinations: LAX, SIN, HND, LHR, and more
  - Times are stored in local timezone of the port/destination
- **REST API**: Upload rosters and retrieve ICS calendars via HTTP
- **Email Support**: Framework for receiving rosters via email (requires integration)
- **Calendar Subscription**: Generated ICS files can be subscribed to in any calendar application

## Installation

```bash
npm install
```

## Usage

### Start the Server

```bash
npm start
```

The server will run on port 3000 by default (configurable via `PORT` environment variable).

### Upload a Roster

**Option 1: File Upload**

```bash
curl -X POST http://localhost:3000/api/roster/upload \
  -F "roster=@examples/sample-roster.txt"
```

**Option 2: Text Upload**

```bash
curl -X POST http://localhost:3000/api/roster/text \
  -H "Content-Type: text/plain" \
  --data-binary "@examples/sample-roster.txt"
```

Response:
```json
{
  "success": true,
  "rosterId": "174423",
  "employee": {
    "name": "MULLAN LR",
    "staffNo": "174423",
    "category": "F/O-B737",
    "base": "PER"
  },
  "entriesCount": 30,
  "icsUrl": "/api/roster/174423/calendar.ics"
}
```

### Download ICS Calendar

```bash
curl http://localhost:3000/api/roster/174423/calendar.ics -o roster.ics
```

### Subscribe to Calendar

Use the ICS URL in your calendar application:
- Apple Calendar: File → New Calendar Subscription
- Google Calendar: Add calendar → From URL
- Outlook: Open calendar → Add calendar → From internet

## API Endpoints

- `GET /` - Service information
- `GET /health` - Health check
- `POST /api/roster/upload` - Upload roster file (multipart/form-data)
- `POST /api/roster/text` - Upload roster as text (text/plain)
- `GET /api/roster/:rosterId` - Get roster details
- `GET /api/roster/:rosterId/calendar.ics` - Download ICS calendar

## Roster Format

The service parses Qantas Airways roster files with the following structure:

```
QANTAS AIRWAYS LIMITED
SH Flight Crew Roster - Bid Period XXXX

Name    :  LASTNAME FN
Staff No:  XXXXXX
Category:  F/O-BXXX
Base    :  XXX

Date    Duty(Role)  Service                     S-On S-Of Duty  Credit Port Code
--------------------------------------------------------------------------------
14 Mon  D/O                                                                 HPX
15 Tue  8026A4      940                         1650 0012  5:22  4:20  BNE  AW01
...
```

### Duty Types

- **D/O**: Day Off (not included in calendar)
- **Flight Duties**: Regular flight assignments
- **PLN**: Planning day
- **R4/R5**: Reserve duty
- **AV**: Annual leave
- **P[flight]**: Passive/positioning flight

## Timezone Handling

The service automatically manages timezones based on the port (airport) for each duty:

- **Sign-on/Sign-off times** are in the local timezone of the port
- **Supported Australian airports**: PER, SYD, MEL, BNE, ADL, DRW, CNS, HBA, and more
- **International airports**: LAX, SIN, HND, LHR, BKK, and many others
- **DST aware**: Automatically handles Daylight Saving Time for applicable locations

The timezone is embedded in the ICS calendar description for each event, ensuring accurate calendar entries across different time zones.

Example:
- A flight departing Perth (PER) at 1650 will be in Perth time (UTC+8)
- A flight arriving in Sydney (SYD) will be in Sydney time (UTC+10 or UTC+11 during DST)

## Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Email Integration

The service includes a framework for email integration. To enable:

1. Choose an email service provider (AWS SES, SendGrid, Mailgun, etc.)
2. Configure webhook to call the email service endpoint
3. Implement the email sending functionality in `src/services/email-service.js`

## Project Structure

```
roster-calendar/
├── src/
│   ├── index.js                    # Main Express application
│   ├── parsers/
│   │   └── qantas-roster-parser.js # Roster parser
│   ├── services/
│   │   ├── ics-calendar-service.js # ICS generation
│   │   ├── timezone-service.js     # Timezone mappings
│   │   └── email-service.js        # Email handling (framework)
│   └── routes/
│       └── roster-routes.js        # API routes
├── tests/
│   ├── qantas-roster-parser.test.js
│   ├── ics-calendar-service.test.js
│   └── timezone-service.test.js
├── examples/
│   └── sample-roster.txt           # Sample roster file
└── package.json
```

## Environment Variables

Create a `.env` file:

```
PORT=3000
```

## License

ISC

