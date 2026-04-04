/**
 * Integration tests for semi-public calendar route
 */

const request = require('supertest');
const express = require('express');
const rosterRoutes = require('../src/routes/roster-routes');
const rosterStore = require('../src/services/roster-store');
const fs = require('fs');
const path = require('path');

describe('Semi-Public Calendar Route', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/roster', rosterRoutes);

    const sampleText = fs.readFileSync(
      path.join(__dirname, '../examples/sample-roster.txt'),
      'utf-8'
    );
    rosterStore.ingestRosterText(sampleText);
  });

  describe('GET /api/roster/:staffNo/semipublic/calendar.ics', () => {
    test('should return 200 for existing roster', async () => {
      const response = await request(app)
        .get('/api/roster/000000/semipublic/calendar.ics');

      expect(response.status).toBe(200);
    });

    test('should return ICS calendar content type', async () => {
      const response = await request(app)
        .get('/api/roster/000000/semipublic/calendar.ics');

      expect(response.headers['content-type']).toContain('text/calendar');
    });

    test('should return valid ICS format', async () => {
      const response = await request(app)
        .get('/api/roster/000000/semipublic/calendar.ics');

      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
      expect(response.text).toContain('BEGIN:VEVENT');
      expect(response.text).toContain('END:VEVENT');
    });

    test('should work without authentication', async () => {
      const response = await request(app)
        .get('/api/roster/000000/semipublic/calendar.ics');

      expect(response.status).toBe(200);
    });

    test('should return 404 for non-existent roster', async () => {
      const response = await request(app)
        .get('/api/roster/999999/semipublic/calendar.ics');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Roster not found');
    });

    test('should set appropriate filename in Content-Disposition', async () => {
      const response = await request(app)
        .get('/api/roster/000000/semipublic/calendar.ics');

      expect(response.headers['content-disposition']).toContain('roster-000000-semipublic.ics');
    });

    test('should contain full duty details (not just Busy/Free)', async () => {
      const response = await request(app)
        .get('/api/roster/000000/semipublic/calendar.ics');

      const icsContent = response.text;
      // Should have real event titles, not just "Busy"/"Free"
      expect(icsContent).toMatch(/SUMMARY:Duty:|SUMMARY:Day Off|SUMMARY:Reserve Duty:|SUMMARY:Available Day/);
    });

    test('should not contain any pay information', async () => {
      const response = await request(app)
        .get('/api/roster/000000/semipublic/calendar.ics');

      const icsContent = response.text;
      expect(icsContent).not.toContain('Pay:');
      expect(icsContent).not.toContain('DPC60');
      expect(icsContent).not.toContain('Duty Value');
      expect(icsContent).not.toContain('/hr)');
    });
  });
});
