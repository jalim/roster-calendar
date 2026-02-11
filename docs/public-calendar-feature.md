# Public Calendar Feature

## Overview

The public calendar feature provides a heavily redacted version of a pilot's roster that can be safely shared with family, friends, or anyone who needs to know availability without accessing sensitive flight information.

## Purpose

This feature is designed for scenarios where someone needs to know if a pilot is available or busy without needing to see:
- Specific duty codes
- Flight numbers
- Routes and destinations
- Credit/duty hours
- Pay information
- Any other sensitive operational details

**Example use case**: A mother-in-law who needs to know if babysitting is required, or a friend planning social activities.

## How It Works

### Busy vs Free Classification

The system automatically classifies roster entries into two categories:

**Free/Available** (shows as "Free"):
- D/O (Day Off)
- AV (Available Day)
- AL/LA (Annual Leave)
- BL (Blank Day)

**Busy/Unavailable** (shows as "Busy"):
- Flight duties
- Reserve duties (R4, R5, etc.)
- Simulator training
- Emergency procedures training
- Personal leave
- Any other duty assignments

### API Endpoint

**No Authentication Required**

```
GET /api/roster/{staff-number}/public/calendar.ics
```

**Example:**
```
GET /api/roster/174423/public/calendar.ics
```

### Response

Returns an ICS calendar file with:
- Events titled only as "Busy" or "Free"
- Generic descriptions ("Unavailable" or "Available")
- Correct timing information (when available)
- Proper free/busy transparency settings for calendar apps

### Calendar Event Properties

**For Busy Periods:**
- Title: "Busy"
- Description: "Unavailable"
- TRANSP: OPAQUE (blocks time in calendar)
- BUSYSTATUS: BUSY

**For Free Periods:**
- Title: "Free"
- Description: "Available"
- TRANSP: TRANSPARENT (shows as available)
- BUSYSTATUS: FREE

## Usage Examples

### Subscribing in Calendar Apps

**Apple Calendar (iOS/macOS):**
1. Copy the public calendar URL
2. Open Calendar app
3. File → New Calendar Subscription (macOS) or Settings → Accounts → Add Account → Other → Add Subscribed Calendar (iOS)
4. Paste the URL
5. Set refresh frequency as desired

**Google Calendar:**
1. Copy the public calendar URL
2. Go to Google Calendar settings
3. Click "Add calendar" → "From URL"
4. Paste the URL
5. Click "Add calendar"

**Outlook:**
1. Copy the public calendar URL
2. In Calendar view, right-click "My Calendars"
3. Select "Add calendar" → "From internet"
4. Paste the URL
5. Click "Add"

### URL Sharing

Simply share the URL with trusted individuals:
```
https://your-domain.com/api/roster/174423/public/calendar.ics
```

They can subscribe to it in their calendar app to see real-time availability updates.

## Privacy & Security

### What is Hidden
- All duty codes (8001A1, etc.)
- Flight numbers (QF123, etc.)
- Destinations and routes
- Sign-on/sign-off times (for disclosure purposes, though timing is preserved for scheduling)
- Duty and credit hours
- Pay rates and values
- Aircraft types
- Crew assignments
- Any operational details

### What is Shown
- Whether a time period is "Busy" or "Free"
- The duration of busy/free periods
- All-day vs timed events

### Security Considerations

- **No authentication required**: Anyone with the URL can view availability
- **Staff number in URL**: The URL contains the staff number, which may be considered semi-sensitive
- **Share carefully**: Only share this calendar with people you trust
- **Not for official use**: This calendar is for personal/family use only, not operational purposes

## Technical Details

### Implementation

The public calendar feature:
1. Uses the same roster data as the full calendar
2. Applies redaction logic at the event generation level
3. Preserves timing information for accurate scheduling
4. Generates standard ICS format compatible with all major calendar applications
5. Updates automatically when rosters are updated

### Testing

Comprehensive test coverage includes:
- Unit tests for busy/free classification logic
- Unit tests for event redaction
- Integration tests for the API endpoint
- Validation that no sensitive information leaks through

Run tests with:
```bash
npm test -- tests/public-calendar.test.js
npm test -- tests/public-calendar-route.test.js
```

## Comparison: Full vs Public Calendar

| Feature | Full Calendar | Public Calendar |
|---------|--------------|-----------------|
| Authentication | Required (HTTP Basic Auth) | None |
| Duty Details | Full details shown | Hidden |
| Flight Numbers | Shown | Hidden |
| Destinations | Shown | Hidden |
| Timing | Accurate | Accurate |
| Event Title | Descriptive (e.g., "Duty: 8001A1") | Generic ("Busy" or "Free") |
| Pay Information | Shown (if configured) | Hidden |
| Free/Busy Status | Accurate | Accurate |
| URL Path | `/api/roster/calendar.ics` | `/api/roster/{staff-no}/public/calendar.ics` |

## Future Enhancements

Potential improvements could include:
- Optional authentication with read-only tokens
- Configurable redaction levels (e.g., show destinations but hide flight numbers)
- Time-limited sharing links
- Multiple subscription levels with different detail levels
- Analytics on calendar access
