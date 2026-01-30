/**
 * Tests for Timezone Service
 */

const TimezoneService = require('../src/services/timezone-service');

describe('TimezoneService', () => {
  let timezoneService;

  beforeAll(() => {
    timezoneService = new TimezoneService();
  });

  test('should return correct timezone for Perth', () => {
    const timezone = timezoneService.getTimezone('PER');
    expect(timezone).toBe('Australia/Perth');
  });

  test('should return correct timezone for Sydney', () => {
    const timezone = timezoneService.getTimezone('SYD');
    expect(timezone).toBe('Australia/Sydney');
  });

  test('should return correct timezone for Melbourne', () => {
    const timezone = timezoneService.getTimezone('MEL');
    expect(timezone).toBe('Australia/Melbourne');
  });

  test('should return correct timezone for Brisbane', () => {
    const timezone = timezoneService.getTimezone('BNE');
    expect(timezone).toBe('Australia/Brisbane');
  });

  test('should return correct timezone for international airports', () => {
    expect(timezoneService.getTimezone('LAX')).toBe('America/Los_Angeles');
    expect(timezoneService.getTimezone('SIN')).toBe('Asia/Singapore');
    expect(timezoneService.getTimezone('HND')).toBe('Asia/Tokyo');
    expect(timezoneService.getTimezone('LHR')).toBe('Europe/London');
  });

  test('should return default timezone for unknown airport', () => {
    const timezone = timezoneService.getTimezone('XXX');
    expect(timezone).toBe('Australia/Sydney');
  });

  test('should return default timezone for null/undefined', () => {
    expect(timezoneService.getTimezone(null)).toBe('Australia/Sydney');
    expect(timezoneService.getTimezone(undefined)).toBe('Australia/Sydney');
  });

  test('should handle lowercase airport codes', () => {
    const timezone = timezoneService.getTimezone('per');
    expect(timezone).toBe('Australia/Perth');
  });

  test('should identify Australian airports', () => {
    expect(timezoneService.isAustralianAirport('PER')).toBe(true);
    expect(timezoneService.isAustralianAirport('SYD')).toBe(true);
    expect(timezoneService.isAustralianAirport('LAX')).toBe(false);
    expect(timezoneService.isAustralianAirport('SIN')).toBe(false);
  });
});
