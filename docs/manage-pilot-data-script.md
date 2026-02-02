# Pilot Data Management Script

A command-line tool for managing pilot email addresses and hourly pay rates in the roster calendar system.

## Location

`scripts/manage-pilot-data.sh`

## Features

- ✅ Add, update, and delete pilot email addresses
- ✅ Add, update, and delete pilot hourly pay rates
- ✅ List all pilots with their email and pay rate data
- ✅ Combined operations to set both email and pay rate at once
- ✅ Input validation for emails, staff numbers, and pay rates
- ✅ Color-coded output for better readability
- ✅ Comprehensive error handling

## Quick Start

```bash
# Make the script executable (first time only)
chmod +x scripts/manage-pilot-data.sh

# Set email and pay rate for a pilot
./scripts/manage-pilot-data.sh pilot set 174423 pilot@example.com 150.50

# List all pilot data
./scripts/manage-pilot-data.sh list
```

## Usage

### Email Management

```bash
# Set email for a pilot
./scripts/manage-pilot-data.sh email set 174423 luke.mullan@example.com

# Get email for a pilot
./scripts/manage-pilot-data.sh email get 174423

# Delete email for a pilot
./scripts/manage-pilot-data.sh email delete 174423

# List all pilot emails
./scripts/manage-pilot-data.sh email list
```

### Pay Rate Management

```bash
# Set hourly pay rate for a pilot
./scripts/manage-pilot-data.sh rate set 174423 150.50

# Get pay rate for a pilot
./scripts/manage-pilot-data.sh rate get 174423

# Update pay rate for a pilot
./scripts/manage-pilot-data.sh rate set 174423 175.00

# Delete pay rate for a pilot
./scripts/manage-pilot-data.sh rate delete 174423

# List all pilot pay rates
./scripts/manage-pilot-data.sh rate list
```

### Combined Management

```bash
# Set both email and pay rate at once
./scripts/manage-pilot-data.sh pilot set 174423 pilot@example.com 150.50

# Set only email (leave pay rate as-is)
./scripts/manage-pilot-data.sh pilot set 174423 pilot@example.com

# Delete all data for a pilot (email and pay rate)
./scripts/manage-pilot-data.sh pilot delete 174423

# List all pilot data
./scripts/manage-pilot-data.sh pilot list
```

### General Commands

```bash
# List all pilot data (emails and pay rates)
./scripts/manage-pilot-data.sh list

# Show help
./scripts/manage-pilot-data.sh help
```

## Examples

### Adding a New Pilot

```bash
# Add complete pilot information
./scripts/manage-pilot-data.sh pilot set 174423 luke.mullan@qantas.com 165.75
```

Output:
```
Email set for Staff No 174423: luke.mullan@qantas.com
✓ Email saved successfully
Pay rate set for Staff No 174423: $165.75
✓ Pay rate saved successfully
```

### Updating Pilot Information

```bash
# Update only the pay rate
./scripts/manage-pilot-data.sh rate set 174423 175.50

# Update only the email
./scripts/manage-pilot-data.sh email set 174423 new.email@qantas.com
```

### Viewing Pilot Data

```bash
# View all pilot information
./scripts/manage-pilot-data.sh list
```

Output:
```
ℹ Listing all pilot data...

Staff No    Email                              Pay Rate
────────────────────────────────────────────────────────────────────────────────
174423      luke.mullan@qantas.com             $165.75/hour
999888      jane.smith@qantas.com              $175.00/hour
────────────────────────────────────────────────────────────────────────────────
Total: 2 pilot(s)
```

### Removing Pilot Data

```bash
# Delete just the email
./scripts/manage-pilot-data.sh email delete 174423

# Delete just the pay rate
./scripts/manage-pilot-data.sh rate delete 174423

# Delete everything for a pilot
./scripts/manage-pilot-data.sh pilot delete 174423
```

## Validation

The script performs automatic validation:

- **Staff Number**: Must be numeric
- **Email**: Must be a valid email format (user@domain.tld)
- **Pay Rate**: Must be a non-negative number

Invalid inputs will be rejected with helpful error messages:

```bash
$ ./scripts/manage-pilot-data.sh email set 123 invalid-email
✗ Invalid email format

$ ./scripts/manage-pilot-data.sh rate set 123 -50
✗ Pay rate cannot be negative
```

## Data Storage

The script manages two JSON files:

- **Email addresses**: `data/pilot-email-map.json`
- **Pay rates**: `data/pilot-pay-rate-map.json`

These files are automatically created when you first add data.

## Color-Coded Output

The script uses colors to make output more readable:

- 🟢 **Green (✓)**: Success messages
- 🔴 **Red (✗)**: Error messages
- 🔵 **Blue (ℹ)**: Informational messages
- 🟡 **Yellow (⚠)**: Warning messages

## Tips

1. **Use tab completion**: Bash tab completion works with the script name
2. **Create aliases**: Add shortcuts to your `.bashrc` or `.zshrc`:
   ```bash
   alias pilot-data='./scripts/manage-pilot-data.sh'
   alias pilot-list='./scripts/manage-pilot-data.sh list'
   ```
3. **Batch operations**: Use a loop to add multiple pilots:
   ```bash
   while IFS=, read -r staffno email rate; do
     ./scripts/manage-pilot-data.sh pilot set "$staffno" "$email" "$rate"
   done < pilots.csv
   ```

## Integration

The script uses the existing pilot directory service (`src/services/pilot-directory.js`), ensuring data consistency with the rest of the application.

You can use the script alongside the programmatic API:

```javascript
// Script adds data
$ ./scripts/manage-pilot-data.sh pilot set 174423 pilot@example.com 150.50

// Application reads data
const pilotDirectory = require('./src/services/pilot-directory');
const email = pilotDirectory.getEmailForStaffNo('174423');
const rate = pilotDirectory.getPayRateForStaffNo('174423');
```

## See Also

- [Pay Rate Feature Documentation](../docs/pay-rate-feature.md)
- [Roster Value Calculator](../examples/calculate-roster-value.js)
- [Pilot Directory Service](../src/services/pilot-directory.js)
