/**
 * Tests for Qantas Roster Parser
 */

const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const fs = require('fs');
const path = require('path');

describe('QantasRosterParser', () => {
  let parser;
  let sampleRosterText;

  beforeAll(() => {
    parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-roster.txt');
    sampleRosterText = fs.readFileSync(samplePath, 'utf-8');
  });

  test('should parse employee information', () => {
    const roster = parser.parse(sampleRosterText);

    expect(roster.employee.name).toBe('MULLAN LR');
    expect(roster.employee.staffNo).toBe('174423');
    expect(roster.employee.category).toBe('F/O-B737');
    expect(roster.employee.base).toBe('PER');
    expect(roster.employee.line).toBe('PLH');
  });

  test('should parse roster entries', () => {
    const roster = parser.parse(sampleRosterText);

    expect(roster.entries).toBeDefined();
    expect(roster.entries.length).toBeGreaterThan(0);
  });

  test('should identify D/O (Day Off) entries', () => {
    const roster = parser.parse(sampleRosterText);
    const dayOffEntries = roster.entries.filter(e => e.dutyType === 'OFF');

    expect(dayOffEntries.length).toBeGreaterThan(0);
    expect(dayOffEntries[0].dutyCode).toBe('D/O');
  });

  test('should identify flight duty entries', () => {
    const roster = parser.parse(sampleRosterText);
    const flightEntries = roster.entries.filter(e => e.dutyType === 'FLIGHT');

    expect(flightEntries.length).toBeGreaterThan(0);
  });

  test('should parse flight entry with service number', () => {
    const roster = parser.parse(sampleRosterText);
    const flightEntry = roster.entries.find(e => e.service === '940');

    expect(flightEntry).toBeDefined();
    expect(flightEntry.dutyCode).toBe('8026A4');
    expect(flightEntry.signOn).toBe('1650');
    expect(flightEntry.signOff).toBe('0012');
  });

  test('should identify reserve duty entries', () => {
    const roster = parser.parse(sampleRosterText);
    const reserveEntries = roster.entries.filter(e => e.dutyType === 'RESERVE');

    expect(reserveEntries.length).toBeGreaterThan(0);
    const reserveEntry = reserveEntries[0];
    expect(reserveEntry.dutyCode).toMatch(/^R\d+$/);
  });

  test('should identify planning days', () => {
    const roster = parser.parse(sampleRosterText);
    const planningEntries = roster.entries.filter(e => e.dutyType === 'PLANNING');

    expect(planningEntries.length).toBeGreaterThan(0);
    expect(planningEntries[0].dutyCode).toBe('PLN');
  });

  test('should parse passive flights', () => {
    const roster = parser.parse(sampleRosterText);
    const passiveEntries = roster.entries.filter(e => e.passive === true);

    expect(passiveEntries.length).toBeGreaterThan(0);
  });

  test('should extract day and day of week', () => {
    const roster = parser.parse(sampleRosterText);
    const firstEntry = roster.entries[0];

    expect(firstEntry.day).toBeDefined();
    expect(firstEntry.dayOfWeek).toBeDefined();
    expect(typeof firstEntry.day).toBe('number');
  });
});
