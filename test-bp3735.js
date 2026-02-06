const fs = require('fs');
const QantasRosterParser = require('./src/parsers/qantas-roster-parser.js');

const parser = new QantasRosterParser();
const text = fs.readFileSync('./examples/roster-174423-bp-3735.txt', 'utf8');
const result = parser.parse(text);

console.log('=== BP-3735 VALIDATION ===\n');

console.log('=== ENTRIES ===');
result.entries.forEach((e, i) => {
  const credit = e.creditHours ? ` Credit: ${e.creditHours}` : '';
  const duty = e.dutyHours ? ` Duty: ${e.dutyHours}` : '';
  const times = e.signOn && e.signOff ? ` (${e.signOn}-${e.signOff})` : '';
  const monthYear = e.month !== undefined && e.year !== undefined ? ` [${e.month + 1}/${e.year}]` : '';
  console.log(`${i}: Day ${e.day} ${e.dayOfWeek}${monthYear} - ${e.dutyCode || 'NO CODE'} - ${e.dutyType}${times}${duty}${credit}`);
});

console.log('\n=== SPECIFIC ISSUE VALIDATION ===');

// Check EP1 (day 13)
const ep1Entry = result.entries.find(e => e.day === 13);
console.log('\nDay 13 (EP1):');
console.log('  ✓ Duty Code:', ep1Entry?.dutyCode);
console.log('  ✓ Duty Type:', ep1Entry?.dutyType);
console.log('  ✓ Description:', ep1Entry?.description);
console.log('  ✓ Sign-On:', ep1Entry?.signOn);
console.log('  ✓ Sign-Off:', ep1Entry?.signOff);
console.log('  ✓ Duty Hours:', ep1Entry?.dutyHours);
console.log('  ✓ Credit Hours:', ep1Entry?.creditHours);
console.log('  ✓ Code:', ep1Entry?.code);

// Check R5 (day 15)
const r5Entry = result.entries.find(e => e.day === 15);
console.log('\nDay 15 (R5):');
console.log('  ✓ Duty Code:', r5Entry?.dutyCode);
console.log('  ✓ Duty Type:', r5Entry?.dutyType);
console.log('  ✓ Sign-On:', r5Entry?.signOn);
console.log('  ✓ Sign-Off:', r5Entry?.signOff);
console.log('  ✓ Duty Hours:', r5Entry?.dutyHours);
console.log('  ✓ Credit Hours:', r5Entry?.creditHours, '(should be 4:00)');
console.log('  ✓ Code:', r5Entry?.code);

// Check R4 (day 18)
const r4Entry = result.entries.find(e => e.day === 18);
console.log('\nDay 18 (R4):');
console.log('  ✓ Duty Code:', r4Entry?.dutyCode);
console.log('  ✓ Duty Type:', r4Entry?.dutyType);
console.log('  ✓ Sign-On:', r4Entry?.signOn);
console.log('  ✓ Sign-Off:', r4Entry?.signOff);
console.log('  ✓ Duty Hours:', r4Entry?.dutyHours);
console.log('  ✓ Credit Hours:', r4Entry?.creditHours, '(should be 4:00)');
console.log('  ✓ Code:', r4Entry?.code);

console.log('\n=== DUTY PATTERNS ===');
console.log('Count:', result.dutyPatterns.length);
result.dutyPatterns.forEach((p, i) => {
  console.log(`${i}: ${p.dutyCode} dated ${p.dated.day}/${p.dated.month + 1}/${p.dated.year} - ${p.legs.length} legs`);
});

console.log('\n=== SUMMARY ===');
const epEntries = result.entries.filter(e => e.dutyType === 'EMERGENCY_PROCEDURES');
const reserveEntries = result.entries.filter(e => e.dutyType === 'RESERVE');
const blankDayEntries = result.entries.filter(e => e.dutyType === 'BLANK_DAY');
const day23Entries = result.entries.filter(e => e.day === 23);
console.log('Emergency Procedures entries:', epEntries.length);
console.log('Reserve duty entries:', reserveEntries.length);
console.log('Blank Day entries:', blankDayEntries.length);
console.log('Day 23 entries (should be 2 - Feb and Mar):', day23Entries.length);
console.log('All reserve duties have 4:00 credit:', reserveEntries.every(e => e.creditHours === '4:00'));

if (day23Entries.length === 2) {
  console.log('\n✓ Successfully parsing both Feb 23 and Mar 23:');
  day23Entries.forEach(e => {
    const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][e.month];
    console.log(`  - ${e.day} ${monthName} ${e.year}: ${e.dutyCode} (${e.dutyType})`);
  });
}
