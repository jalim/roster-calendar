# Pay Rate & Roster Value Calculation

This feature allows you to track hourly pay rates for pilots and automatically calculate the monetary value of duties based on credit hours.

## Features

### 1. Pilot Pay Rate Management

Store and manage hourly pay rates for pilots in the pilot directory service:

```javascript
const pilotDirectory = require('./src/services/pilot-directory');

// Set a pay rate for a pilot
pilotDirectory.setPayRateForStaffNo('174423', 150.00);

// Get a pilot's pay rate
const payRate = pilotDirectory.getPayRateForStaffNo('174423');
// Returns: 150.00

// List all pilot pay rates
const allRates = pilotDirectory.listPilotPayRates();
// Returns: [{ staffNo: '174423', payRate: 150.00 }, ...]

// Delete a pay rate
pilotDirectory.deletePayRateForStaffNo('174423');
```

### 2. Roster Value Calculation

Calculate the monetary value of roster duties based on credit hours:

```javascript
const QantasRosterParser = require('./src/parsers/qantas-roster-parser');
const fs = require('fs');

// Parse a roster
const parser = new QantasRosterParser();
const rosterText = fs.readFileSync('examples/roster-174423-bp-3715.txt', 'utf-8');
const roster = parser.parse(rosterText);

// Enrich the roster with duty values at $150/hour
const enrichedRoster = QantasRosterParser.enrichRosterWithDutyValues(roster, 150.00);

// Access duty values
enrichedRoster.entries.forEach(entry => {
  if (entry.dutyValue) {
    console.log(`${entry.dutyCode}: ${entry.creditHours} = $${entry.dutyValue}`);
  }
});

// Access total roster value
console.log(`Total Roster Value: $${enrichedRoster.summary.totalDutyValue}`);
```

### 3. Utility Functions

Convert credit hours to decimal format:

```javascript
const decimalHours = QantasRosterParser.creditHoursToDecimal('7:30');
// Returns: 7.5

const value = QantasRosterParser.calculateDutyValue('7:30', 150);
// Returns: 1125 (7.5 hours * $150/hour)
```

## Demo Script

A demonstration script is provided that shows the complete workflow:

```bash
# Calculate roster value with default pay rate ($150/hour)
node examples/calculate-roster-value.js

# Calculate with a specific roster file and pay rate
node examples/calculate-roster-value.js examples/roster-174423-bp-3715.txt 175.50
```

The script will:
1. Parse the roster file
2. Set the pay rate for the pilot
3. Calculate duty values for all entries with credit hours
4. Display a detailed breakdown of each duty and its value
5. Show a summary including total credit hours and total roster value

## Example Output

```
Roster Value Calculator
======================

Pilot Information:
  Name: MULLAN LR
  Staff No: 174423
  Category: F/O-B737
  Base: PER

Duties with Pay Calculations:
────────────────────────────────────────────────────────────────────────────────
Date    Duty         Service       Sign-On  Sign-Off  Credit   Value
────────────────────────────────────────────────────────────────────────────────
 3 Mon  8288A1       QF936/QF941   0950     2145      7:30     $1125.00
 6 Thu  RCW938B3     QF938/P943    1205     0024      7:23     $1107.50
 7 Fri  PSIM02B4     QF780         1525     2241      2:34     $385.00
────────────────────────────────────────────────────────────────────────────────

Roster Summary:
  Total Entries: 28
  Paid Duties: 13
  Total Credit Hours: 80.87
  Hourly Pay Rate: $150.00
  Total Roster Value: $12130.00
```

## Data Storage

Pay rates are stored separately from email addresses:

- **Email addresses**: `data/pilot-email-map.json`
- **Pay rates**: `data/pilot-pay-rate-map.json`

Both can be configured via environment variables:

```bash
# Email database
export ROSTER_PILOT_EMAIL_DB_PATH=/path/to/pilot-email-map.json
export ROSTER_PILOT_EMAIL_DB_READONLY=false

# Pay rate database
export ROSTER_PILOT_PAY_RATE_DB_PATH=/path/to/pilot-pay-rate-map.json
export ROSTER_PILOT_PAY_RATE_DB_READONLY=false
```

## API Reference

### pilotDirectory.setPayRateForStaffNo(staffNo, payRate, env?)

Set the hourly pay rate for a pilot.

- **staffNo**: String - The pilot's staff number
- **payRate**: Number - The hourly pay rate (must be non-negative)
- **env**: Object (optional) - Environment configuration
- **Returns**: `{ staffNo, payRate }`
- **Throws**: Error if staffNo is invalid or payRate is negative

### pilotDirectory.getPayRateForStaffNo(staffNo, env?)

Get the hourly pay rate for a pilot.

- **staffNo**: String - The pilot's staff number
- **env**: Object (optional) - Environment configuration
- **Returns**: Number or null if not found

### QantasRosterParser.enrichRosterWithDutyValues(roster, payRate)

Enrich a parsed roster with duty value calculations.

- **roster**: Object - Parsed roster object
- **payRate**: Number - Hourly pay rate
- **Returns**: Object - Roster with `dutyValue` added to entries and `totalDutyValue` in summary

### QantasRosterParser.creditHoursToDecimal(creditHours)

Convert credit hours from HH:MM format to decimal hours.

- **creditHours**: String - Time in "HH:MM" format (e.g., "7:30")
- **Returns**: Number or null if invalid

### QantasRosterParser.calculateDutyValue(creditHours, payRate)

Calculate the monetary value of a duty.

- **creditHours**: String - Time in "HH:MM" format
- **payRate**: Number - Hourly pay rate
- **Returns**: Number or null if calculation not possible

## Tests

All functionality is fully tested:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- pilot-directory.test.js
npm test -- qantas-roster-parser.test.js
```

Test coverage includes:
- Pay rate CRUD operations
- Invalid input validation
- Credit hours to decimal conversion
- Duty value calculation
- Roster enrichment with values
- Total roster value summation
