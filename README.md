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

## Quick Start

### 1. Start the Server

```bash
npm start
```

The server will run on port 3000 by default (configurable via `PORT` environment variable).

### 2. Upload Your Roster

```bash
curl -X POST http://localhost:3000/api/roster/text \
  -H "Content-Type: text/plain" \
  --data-binary "@your-roster.txt"
```

### 3. Set Your Password

```bash
curl -X POST http://localhost:3000/api/roster/password \
  -H "Content-Type: application/json" \
  -d '{"staffNo": "YOUR_STAFF_NUMBER", "password": "your-secure-password"}'
```

### 4. Subscribe to Your Calendar

In your calendar application (Apple Calendar, Google Calendar, Outlook):
- Add a new calendar subscription
- URL: `http://localhost:3000/api/roster/calendar.ics`
- When prompted for credentials:
  - **Username**: Your staff number
  - **Password**: The password you set in step 3

**Note**: In production, use HTTPS instead of HTTP for secure credential transmission.

## Usage

### Multiple roster uploads (append)

If you upload multiple rosters for the same staff number (e.g. June, then July, then August), the service keeps them all and serves a single combined calendar at:

`/api/roster/calendar.ics`

The calendar URL is the same for all users - authentication determines which roster is displayed.

Re-uploading the exact same roster text won’t duplicate events (events are de-duplicated by stable UID).

### Start the Server

```bash
npm start
```

The server will run on port 3000 by default (configurable via `PORT` environment variable).

### Upload a Roster

#### Option 1: File Upload

```bash
curl -X POST http://localhost:3000/api/roster/upload \
  -F "roster=@examples/sample-roster.txt"
```


#### Option 2: Text Upload

```bash
curl -X POST http://localhost:3000/api/roster/text \
  -H "Content-Type: text/plain" \
  --data-binary "@examples/sample-roster.txt"
```

Response:

```json
{
  "success": true,
  "rosterId": "000000",
  "employee": {
    "name": "DOE J",
    "staffNo": "000000",
    "category": "F/O-B737",
    "base": "PER"
  },
  "entriesCount": 30,
  "icsUrl": "/api/roster/calendar.ics"
}
```

### Download ICS Calendar

```bash
# Requires authentication with your staff number and password
curl -u 000000:your-password http://localhost:3000/api/roster/calendar.ics -o roster.ics
```

### Subscribe to Calendar

Use the ICS URL in your calendar application:

- Apple Calendar: File → New Calendar Subscription
- Google Calendar: Add calendar → From URL
- Outlook: Open calendar → Add calendar → From internet

**Important:** Calendar subscriptions now require authentication using HTTP Basic Auth. When subscribing, use your staff number as the username and your password.

## Password Protection (CalDAV Authentication)

Calendar access is protected using HTTP Basic Authentication. Each pilot must set a password before they can access their calendar.

### Setting Your Password

**First time (initial password creation):**
```bash
curl -X POST http://localhost:3000/api/roster/password \
  -H "Content-Type: application/json" \
  -d '{"staffNo": "123456", "password": "your-secure-password"}'
```

**Updating your password (requires authentication with current password):**
```bash
curl -X POST http://localhost:3000/api/roster/password \
  -u 123456:current-password \
  -H "Content-Type: application/json" \
  -d '{"staffNo": "123456", "password": "new-secure-password"}'
```

### Accessing Your Calendar

Once your password is set, access your calendar using HTTP Basic Authentication:

```bash
# Download with authentication (same URL for all users - auth determines which roster)
curl -u 123456:your-password http://localhost:3000/api/roster/calendar.ics -o roster.ics
```

When subscribing in calendar applications, you'll be prompted for:
- **Username:** Your staff number (e.g., 123456)
- **Password:** The password you set
- **URL:** `http://localhost:3000/api/roster/calendar.ics` (same for all users)

### Security Notes

- Passwords are stored as bcrypt hashes (salt rounds: 12)
- Minimum password length: 6 characters
- Each pilot can only access their own roster
- **Password updates require authentication**: You must provide your current password to change it
- **Initial password creation is open**: Anyone can set a password for a staff number that doesn't have one yet (consider restricting this in production)
- Use HTTPS in production to protect credentials in transit

## API Endpoints

- `GET /` - Service information
- `GET /health` - Health check
- `POST /api/roster/upload` - Upload roster file (multipart/form-data)
- `POST /api/roster/text` - Upload roster as text (text/plain)
- `POST /api/roster/password` - Set/update password for a staff number
- `GET /api/roster/:rosterId` - Get roster details
- `GET /api/roster/calendar.ics` - Download ICS calendar (**requires authentication**, uses auth to determine which roster to serve)
- `GET /api/roster/:staffNo/public/calendar.ics` - Download redacted public calendar (**no authentication required**, shows only busy/free status)

### Public Calendar

The public calendar endpoint provides a heavily redacted version of a roster suitable for sharing with family and friends. It shows only whether the pilot is "Busy" or "Free" without revealing any sensitive operational details.

**Example:**
```bash
curl http://localhost:3000/api/roster/123456/public/calendar.ics -o public-calendar.ics
```

**Features:**
- No authentication required
- Shows only "Busy" vs "Free" status
- Removes all flight numbers, duty codes, destinations, and pay information
- Preserves timing information for accurate scheduling
- Perfect for sharing with family members who need to know availability for childcare, social plans, etc.

See [Public Calendar Documentation](docs/public-calendar-feature.md) for detailed information.

### Debug endpoints (optional)

Enable with:

```text
ROSTER_DEBUG_ENDPOINTS=true
```

- `GET /api/roster/_debug/rosters` - List rosterIds currently in memory
- `POST /api/roster/_debug/email/poll` - Trigger an inbox poll immediately (runs inside the server)
- `GET /api/roster/_debug/credentials` - List all staff numbers with passwords set
- `DELETE /api/roster/_debug/credentials/:staffNo` - Delete password for a staff number

## Roster Format

The service parses Qantas Airways roster files with the following structure:

```text
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
- **PLN**: Personal leave
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

## Security / privacy

This repo is intended to avoid committing personal roster exports, staff numbers, email addresses, or secrets.

### Pre-commit secret scan (recommended)

1) Install gitleaks:

```bash
brew install gitleaks
```

1) Enable the repo’s git hooks:

```bash
npm run hooks:install
```

Now every `git commit` will run `gitleaks` against staged changes.

To bypass (not recommended): `SKIP_GITLEAKS=1 git commit ...`

Run tests in watch mode:

```bash
npm run test:watch
```

## Deployment

See [docs/deploy-proxmox-lxc-cloudflare-tunnel.md](docs/deploy-proxmox-lxc-cloudflare-tunnel.md) for a step-by-step guide to running this service long-term in a Proxmox LXC container and exposing it via a Cloudflare Tunnel.

## Logging / troubleshooting

Logs go to stdout/stderr and are captured by `systemd`/`journald` when running as a service.

Optional env vars:

```text
# Log verbosity: debug | info | warn | error
ROSTER_LOG_LEVEL=info

# If true, logs one line per HTTP request (can be noisy)
ROSTER_HTTP_LOGGING=false
```

## Email Integration

The service can ingest rosters from email in two ways:

1) **Inbound webhook/email provider integration** (SES/SendGrid/Mailgun/etc.)
2) **IMAP polling** (periodically checks the mailbox and processes unread emails)

### IMAP polling (recommended for simple setups)

Set these environment variables (e.g. in `.env`):

```text
# Enable periodic inbox polling
ROSTER_EMAIL_POLLING_ENABLED=true

# IMAP connection
ROSTER_EMAIL_IMAP_HOST=imap.yourmailhost.com
ROSTER_EMAIL_IMAP_PORT=993
ROSTER_EMAIL_IMAP_SECURE=true
# If using port 143 with TLS, enable STARTTLS (upgrade after connect)
ROSTER_EMAIL_IMAP_STARTTLS=true
ROSTER_EMAIL_IMAP_USER=roster@example.com
ROSTER_EMAIL_IMAP_PASS=your-app-password

# Mailbox/folders
ROSTER_EMAIL_IMAP_MAILBOX=INBOX
ROSTER_EMAIL_PROCESSED_MAILBOX=Processed

# Polling interval
ROSTER_EMAIL_POLL_INTERVAL_MS=60000

# Which messages to scan:
# - unseen (default): only UNSEEN messages
# - all: process all messages (requires ROSTER_EMAIL_PROCESSED_MAILBOX so processed mail is moved out)
ROSTER_EMAIL_IMAP_SEARCH=unseen

# Optional safety filters
ROSTER_EMAIL_FROM_ALLOWLIST=you@example.com,ops@example.com
ROSTER_EMAIL_SUBJECT_CONTAINS=roster
```

Behavior:

- Polls `ROSTER_EMAIL_IMAP_MAILBOX` for **unread (UNSEEN)** messages (or all, if `ROSTER_EMAIL_IMAP_SEARCH=all`)
- Extracts the first `.txt`/`.text` attachment (falls back to plain-text body)
- Parses/ingests the roster into the same in-memory store used by the HTTP API
- Marks the message as **Seen** and (optionally) moves it to `ROSTER_EMAIL_PROCESSED_MAILBOX`

### Outbound notifications (roster change email)

When enabled, the IMAP poller can send an email to the pilot with:

- the received roster text file attached
- a simple per-day change summary versus the previously stored roster for that staff number

Configuration:

```text
# Enable notifications
ROSTER_NOTIFY_ENABLED=true

# StaffNo -> email mapping DB (stored locally; ignored by git via /data/)
ROSTER_PILOT_EMAIL_DB_PATH=./data/pilot-email-map.json

# SMTP settings
ROSTER_SMTP_HOST=smtp.yourmailhost.com
ROSTER_SMTP_PORT=587
ROSTER_SMTP_SECURE=false
ROSTER_SMTP_USER=roster@example.com
ROSTER_SMTP_PASS=your-smtp-password
ROSTER_EMAIL_FROM=roster@example.com

# Safe testing
ROSTER_NOTIFY_DRY_RUN=true
```

To manage the staffNo → email mapping without editing files, you can enable debug endpoints:

```text
ROSTER_DEBUG_ENDPOINTS=true
```

Then:

- `GET /api/roster/_debug/pilot-emails`
- `PUT /api/roster/_debug/pilot-emails/:staffNo` with JSON body `{ "email": "pilot@example.com" }`
- `DELETE /api/roster/_debug/pilot-emails/:staffNo`

## Project Structure

```text
roster-calendar/
├── src/
│   ├── index.js                    # Main Express application
│   ├── parsers/
│   │   └── qantas-roster-parser.js # Roster parser
│   ├── services/
│   │   ├── auth-service.js         # Password hashing and authentication
│   │   ├── ics-calendar-service.js # ICS generation
│   │   ├── inbox-roster-poller.js  # IMAP polling (optional)
│   │   ├── roster-store.js         # Shared in-memory roster store
│   │   ├── timezone-service.js     # Timezone mappings
│   │   └── email-service.js        # Email handling (framework)
│   ├── middleware/
│   │   └── caldav-auth.js          # HTTP Basic Auth middleware
│   └── routes/
│       └── roster-routes.js        # API routes
├── tests/
│   ├── auth-service.test.js        # Authentication tests
│   ├── caldav-auth.test.js         # Auth middleware tests
│   ├── qantas-roster-parser.test.js
│   ├── ics-calendar-service.test.js
│   └── timezone-service.test.js
├── examples/
│   └── sample-roster.txt           # Sample roster file
└── package.json
```

## Environment Variables

Create a `.env` file:

```text
PORT=3000

# Persist ingested rosters to disk (survives restarts)
ROSTER_PERSIST_ENABLED=true
ROSTER_PERSIST_PATH=./data/roster-store.json

# CalDAV Authentication - Password credentials storage
ROSTER_CREDENTIALS_PATH=./data/credentials.json
```

## License

ISC

