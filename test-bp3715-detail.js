const fs = require('fs');
const QantasRosterParser = require('./src/parsers/qantas-roster-parser.js');

const parser = new QantasRosterParser();
const text = fs.readFileSync('./examples/roster-174423-bp-3715.txt', 'utf8');
const result = parser.parse(text);

console.log('=== ENTRIES FOR DAYS 7-11 ===');
result.entries.filter(e => e.day >= 7 && e.day <= 11).forEach((e) => {
  console.log(`Day ${e.day} ${e.dayOfWeek}:`);
  console.log(`  dutyCode: ${e.dutyCode || 'NONE'}`);
  console.log(`  dutyType: ${e.dutyType}`);
  console.log(`  service: ${e.service || 'NONE'}`);
  console.log(`  description: ${e.description || 'NONE'}`);
  console.log(`  signOn: ${e.signOn || 'NONE'}, signOff: ${e.signOff || 'NONE'}`);
  console.log(`  dutyHours: ${e.dutyHours || 'NONE'}, creditHours: ${e.creditHours || 'NONE'}`);
  console.log();
});
