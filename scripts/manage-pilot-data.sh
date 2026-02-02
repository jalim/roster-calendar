#!/bin/bash

# Pilot Data Management Script
# Manages pilot email addresses and hourly pay rates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PILOT_DIR="$PROJECT_ROOT/src/services/pilot-directory.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Function to validate staff number
validate_staff_no() {
    local staff_no="$1"
    if [[ -z "$staff_no" ]]; then
        print_error "Staff number is required"
        return 1
    fi
    if ! [[ "$staff_no" =~ ^[0-9]+$ ]]; then
        print_error "Staff number must be numeric"
        return 1
    fi
    return 0
}

# Function to validate email
validate_email() {
    local email="$1"
    if [[ -z "$email" ]]; then
        print_error "Email is required"
        return 1
    fi
    if ! [[ "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        print_error "Invalid email format"
        return 1
    fi
    return 0
}

# Function to validate pay rate
validate_pay_rate() {
    local pay_rate="$1"
    if [[ -z "$pay_rate" ]]; then
        print_error "Pay rate is required"
        return 1
    fi
    if ! [[ "$pay_rate" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
        print_error "Pay rate must be a number"
        return 1
    fi
    if (( $(echo "$pay_rate < 0" | bc -l) )); then
        print_error "Pay rate cannot be negative"
        return 1
    fi
    return 0
}

# Function to set email
set_email() {
    local staff_no="$1"
    local email="$2"
    
    validate_staff_no "$staff_no" || return 1
    validate_email "$email" || return 1
    
    node -e "
        const pd = require('$PILOT_DIR');
        try {
            const result = pd.setEmailForStaffNo('$staff_no', '$email');
            console.log('Email set for Staff No ${staff_no}: ${email}');
        } catch (err) {
            console.error('Error:', err.message);
            process.exit(1);
        }
    " && print_success "Email saved successfully"
}

# Function to get email
get_email() {
    local staff_no="$1"
    
    validate_staff_no "$staff_no" || return 1
    
    node -e "
        const pd = require('$PILOT_DIR');
        const email = pd.getEmailForStaffNo('$staff_no');
        if (email) {
            console.log('Staff No $staff_no: ' + email);
        } else {
            console.log('No email found for Staff No $staff_no');
            process.exit(1);
        }
    "
}

# Function to delete email
delete_email() {
    local staff_no="$1"
    
    validate_staff_no "$staff_no" || return 1
    
    node -e "
        const pd = require('$PILOT_DIR');
        const deleted = pd.deleteEmailForStaffNo('$staff_no');
        if (deleted) {
            console.log('Email deleted for Staff No $staff_no');
        } else {
            console.log('No email found for Staff No $staff_no');
            process.exit(1);
        }
    " && print_success "Email deleted successfully"
}

# Function to list all emails
list_emails() {
    print_info "Listing all pilot emails..."
    node -e "
        const pd = require('$PILOT_DIR');
        const emails = pd.listPilotEmails();
        if (emails.length === 0) {
            console.log('No pilot emails found');
        } else {
            console.log('');
            console.log('Staff No    Email');
            console.log('─'.repeat(60));
            emails.forEach(e => {
                console.log(e.staffNo.padEnd(12) + e.email);
            });
            console.log('─'.repeat(60));
            console.log('Total: ' + emails.length + ' pilot(s)');
        }
    "
}

# Function to set pay rate
set_pay_rate() {
    local staff_no="$1"
    local pay_rate="$2"
    
    validate_staff_no "$staff_no" || return 1
    validate_pay_rate "$pay_rate" || return 1
    
    node -e "
        const pd = require('$PILOT_DIR');
        try {
            const result = pd.setPayRateForStaffNo('$staff_no', $pay_rate);
            console.log('Pay rate set for Staff No ${staff_no}: \$${pay_rate}');
        } catch (err) {
            console.error('Error:', err.message);
            process.exit(1);
        }
    " && print_success "Pay rate saved successfully"
}

# Function to get pay rate
get_pay_rate() {
    local staff_no="$1"
    
    validate_staff_no "$staff_no" || return 1
    
    node -e "
        const pd = require('$PILOT_DIR');
        const payRate = pd.getPayRateForStaffNo('$staff_no');
        if (payRate !== null) {
            console.log('Staff No $staff_no: \$' + payRate.toFixed(2) + '/hour');
        } else {
            console.log('No pay rate found for Staff No $staff_no');
            process.exit(1);
        }
    "
}

# Function to delete pay rate
delete_pay_rate() {
    local staff_no="$1"
    
    validate_staff_no "$staff_no" || return 1
    
    node -e "
        const pd = require('$PILOT_DIR');
        const deleted = pd.deletePayRateForStaffNo('$staff_no');
        if (deleted) {
            console.log('Pay rate deleted for Staff No $staff_no');
        } else {
            console.log('No pay rate found for Staff No $staff_no');
            process.exit(1);
        }
    " && print_success "Pay rate deleted successfully"
}

# Function to list all pay rates
list_pay_rates() {
    print_info "Listing all pilot pay rates..."
    node -e "
        const pd = require('$PILOT_DIR');
        const rates = pd.listPilotPayRates();
        if (rates.length === 0) {
            console.log('No pilot pay rates found');
        } else {
            console.log('');
            console.log('Staff No    Pay Rate');
            console.log('─'.repeat(60));
            rates.forEach(r => {
                console.log(r.staffNo.padEnd(12) + '\$' + r.payRate.toFixed(2) + '/hour');
            });
            console.log('─'.repeat(60));
            console.log('Total: ' + rates.length + ' pilot(s)');
        }
    "
}

# Function to list all pilot data
list_all() {
    print_info "Listing all pilot data..."
    node -e "
        const pd = require('$PILOT_DIR');
        const emails = pd.listPilotEmails();
        const rates = pd.listPilotPayRates();
        
        // Create a map of all staff numbers
        const allStaffNos = new Set([
            ...emails.map(e => e.staffNo),
            ...rates.map(r => r.staffNo)
        ]);
        
        const emailMap = {};
        emails.forEach(e => emailMap[e.staffNo] = e.email);
        
        const rateMap = {};
        rates.forEach(r => rateMap[r.staffNo] = r.payRate);
        
        const sortedStaffNos = Array.from(allStaffNos).sort();
        
        if (sortedStaffNos.length === 0) {
            console.log('No pilot data found');
        } else {
            console.log('');
            console.log('Staff No    Email                              Pay Rate');
            console.log('─'.repeat(80));
            sortedStaffNos.forEach(staffNo => {
                const email = emailMap[staffNo] || '(not set)';
                const rate = rateMap[staffNo] !== undefined ? '\$' + rateMap[staffNo].toFixed(2) + '/hour' : '(not set)';
                console.log(staffNo.padEnd(12) + email.padEnd(35) + rate);
            });
            console.log('─'.repeat(80));
            console.log('Total: ' + sortedStaffNos.length + ' pilot(s)');
        }
    "
}

# Function to set both email and pay rate
set_pilot() {
    local staff_no="$1"
    local email="$2"
    local pay_rate="$3"
    
    validate_staff_no "$staff_no" || return 1
    
    if [[ -n "$email" ]]; then
        validate_email "$email" || return 1
        set_email "$staff_no" "$email"
    fi
    
    if [[ -n "$pay_rate" ]]; then
        validate_pay_rate "$pay_rate" || return 1
        set_pay_rate "$staff_no" "$pay_rate"
    fi
    
    if [[ -z "$email" && -z "$pay_rate" ]]; then
        print_error "At least email or pay rate must be provided"
        return 1
    fi
}

# Function to delete all data for a pilot
delete_pilot() {
    local staff_no="$1"
    
    validate_staff_no "$staff_no" || return 1
    
    local deleted_email=false
    local deleted_rate=false
    
    if delete_email "$staff_no" 2>/dev/null; then
        deleted_email=true
    fi
    
    if delete_pay_rate "$staff_no" 2>/dev/null; then
        deleted_rate=true
    fi
    
    if [[ "$deleted_email" == true || "$deleted_rate" == true ]]; then
        print_success "All data deleted for Staff No $staff_no"
    else
        print_warning "No data found for Staff No $staff_no"
        return 1
    fi
}

# Show usage information
show_usage() {
    cat << EOF
Pilot Data Management Script

Usage: $0 <command> [arguments]

Commands:
  Email Management:
    email set <staff-no> <email>       Set email for a pilot
    email get <staff-no>               Get email for a pilot
    email delete <staff-no>            Delete email for a pilot
    email list                         List all pilot emails

  Pay Rate Management:
    rate set <staff-no> <rate>         Set hourly pay rate for a pilot
    rate get <staff-no>                Get pay rate for a pilot
    rate delete <staff-no>             Delete pay rate for a pilot
    rate list                          List all pilot pay rates

  Combined Management:
    pilot set <staff-no> <email> <rate>  Set both email and pay rate
    pilot delete <staff-no>              Delete all data for a pilot
    pilot list                           List all pilot data

  General:
    list                               List all pilot data (same as 'pilot list')
    help                               Show this help message

Examples:
  # Set email for a pilot
  $0 email set 174423 pilot@example.com

  # Set pay rate for a pilot
  $0 rate set 174423 150.50

  # Set both email and pay rate
  $0 pilot set 174423 pilot@example.com 150.50

  # Get pilot information
  $0 email get 174423
  $0 rate get 174423

  # List all data
  $0 list

  # Delete a pilot's email
  $0 email delete 174423

  # Delete all data for a pilot
  $0 pilot delete 174423

EOF
}

# Main script logic
main() {
    if [[ $# -eq 0 ]]; then
        show_usage
        exit 0
    fi

    local command="$1"
    shift

    case "$command" in
        email)
            if [[ $# -eq 0 ]]; then
                print_error "Email subcommand required"
                show_usage
                exit 1
            fi
            local subcommand="$1"
            shift
            case "$subcommand" in
                set)
                    [[ $# -eq 2 ]] || { print_error "Usage: email set <staff-no> <email>"; exit 1; }
                    set_email "$1" "$2"
                    ;;
                get)
                    [[ $# -eq 1 ]] || { print_error "Usage: email get <staff-no>"; exit 1; }
                    get_email "$1"
                    ;;
                delete)
                    [[ $# -eq 1 ]] || { print_error "Usage: email delete <staff-no>"; exit 1; }
                    delete_email "$1"
                    ;;
                list)
                    list_emails
                    ;;
                *)
                    print_error "Unknown email subcommand: $subcommand"
                    show_usage
                    exit 1
                    ;;
            esac
            ;;
        rate|pay)
            if [[ $# -eq 0 ]]; then
                print_error "Rate subcommand required"
                show_usage
                exit 1
            fi
            local subcommand="$1"
            shift
            case "$subcommand" in
                set)
                    [[ $# -eq 2 ]] || { print_error "Usage: rate set <staff-no> <rate>"; exit 1; }
                    set_pay_rate "$1" "$2"
                    ;;
                get)
                    [[ $# -eq 1 ]] || { print_error "Usage: rate get <staff-no>"; exit 1; }
                    get_pay_rate "$1"
                    ;;
                delete)
                    [[ $# -eq 1 ]] || { print_error "Usage: rate delete <staff-no>"; exit 1; }
                    delete_pay_rate "$1"
                    ;;
                list)
                    list_pay_rates
                    ;;
                *)
                    print_error "Unknown rate subcommand: $subcommand"
                    show_usage
                    exit 1
                    ;;
            esac
            ;;
        pilot)
            if [[ $# -eq 0 ]]; then
                print_error "Pilot subcommand required"
                show_usage
                exit 1
            fi
            local subcommand="$1"
            shift
            case "$subcommand" in
                set)
                    [[ $# -ge 2 ]] || { print_error "Usage: pilot set <staff-no> <email> [rate]"; exit 1; }
                    set_pilot "$1" "$2" "$3"
                    ;;
                delete)
                    [[ $# -eq 1 ]] || { print_error "Usage: pilot delete <staff-no>"; exit 1; }
                    delete_pilot "$1"
                    ;;
                list)
                    list_all
                    ;;
                *)
                    print_error "Unknown pilot subcommand: $subcommand"
                    show_usage
                    exit 1
                    ;;
            esac
            ;;
        list)
            list_all
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
