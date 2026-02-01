const fs = require('fs');
const QantasRosterParser = require('./src/parsers/qantas-roster-parser.js');

const parser = new QantasRosterParser();
const text = fs.readFileSync('./examples/roster-174423-bp-3715.txt', 'utf8');
const result = parser.parse(text);

console.log('=== ENTRIES ===');
result.entries.forEach((e, i) => {
  console.log(`${i}: Day ${e.day} ${e.dayOfWeek} - ${e.dutyCode || 'NO CODE'} - ${e.dutyType} - ${e.description || ''}`);
});

console.log('\n=== DUTY PATTERNS ===');
console.log('Count:', result.dutyPatterns.length);
result.dutyPatterns.forEach((p, i) => {
  console.log(`${i}: ${p.dutyCode} dated ${p.dated} - ${p.legs.length} legs`);
});

console.log('\n=== FLIGHTS ===');
console.log('Count:', result.flights.length);
result.flights.forEach((f, i) => {
  console.log(`${i}: Day ${f.day} - Flight ${f.flightNumber}`);
});
