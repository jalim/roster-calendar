#!/usr/bin/env node

const pilotDirectory = require('./src/services/pilot-directory');

const staffNo = '174423';

console.log('Testing pilot directory data retrieval for staffNo:', staffNo);
console.log('Testing type of staffNo:', typeof staffNo);
console.log('---');

// Test what the middleware does
const currentUser = {
  staffNo: staffNo
};

const email = pilotDirectory.getEmailForStaffNo(staffNo);
console.log('Email result:', email);
console.log('Email truthy?', !!email);

if (email) {
  currentUser.email = email;
  console.log('✓ Email would be set on currentUser');
} else {
  console.log('✗ Email would NOT be set on currentUser');
}

const names = pilotDirectory.getNamesForStaffNo(staffNo);
console.log('Names result:', names);
console.log('Names truthy?', !!names);

if (names) {
  currentUser.firstName = names.firstName;
  currentUser.lastName = names.lastName;
  console.log('✓ Names would be set on currentUser');
} else {
  console.log('✗ Names would NOT be set on currentUser');
}

console.log('---');
console.log('Final currentUser object:');
console.log(JSON.stringify(currentUser, null, 2));
