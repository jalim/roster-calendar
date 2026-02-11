/**
 * Integration tests for public calendar route
 */

const request = require('supertest');
const express = require('express');
const rosterRoutes = require('../src/routes/roster-routes');
const rosterStore = require('../src/services/roster-store');
const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const fs = require('fs');
const path = require('path');

describe('Public Calendar Route', () => {
  let app;
  
  beforeAll(() => {
    // Setup express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/roster', rosterRoutes);
    
    // Load a sample roster into the store
    const sampleText = fs.readFileSync(
      path.join(__dirname, '../examples/sample-roster.txt'),
      'utf-8'
    );
    rosterStore.ingestRosterText(sampleText);
  });

  describe('GET /api/roster/:staffNo/public/calendar.ics', () => {
    test('should return 200 for existing roster', async () => {
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      expect(response.status).toBe(200);
    });

    test('should return ICS calendar content type', async () => {
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      expect(response.headers['content-type']).toContain('text/calendar');
    });

    test('should return valid ICS format', async () => {
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
      expect(response.text).toContain('BEGIN:VEVENT');
      expect(response.text).toContain('END:VEVENT');
    });

    test('should contain only redacted information', async () => {
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      const icsContent = response.text;
      
      // Should have "Busy" or "Free" titles
      expect(icsContent).toMatch(/SUMMARY:(Busy|Free)/);
      
      // Should NOT contain sensitive information
      expect(icsContent).not.toContain('Flight');
      expect(icsContent).not.toContain('QF');
      expect(icsContent).not.toMatch(/\d{4}A\d/); // No duty codes
      expect(icsContent).not.toContain('Reserve Duty');
      expect(icsContent).not.toContain('credit');
      expect(icsContent).not.toContain('Credit');
      expect(icsContent).not.toContain('Sign On');
      expect(icsContent).not.toContain('Sign Off');
    });

    test('should return 404 for non-existent roster', async () => {
      const response = await request(app)
        .get('/api/roster/999999/public/calendar.ics');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Roster not found');
    });

    test('should set appropriate filename in Content-Disposition', async () => {
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      expect(response.headers['content-disposition']).toContain('roster-000000-public.ics');
    });

    test('should work without authentication', async () => {
      // Public endpoint should not require auth
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      // Should succeed without authentication
      expect(response.status).toBe(200);
    });

    test('should include both busy and free events', async () => {
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      const icsContent = response.text;
      
      // Should have both types of events
      expect(icsContent).toContain('SUMMARY:Busy');
      expect(icsContent).toContain('SUMMARY:Free');
    });

    test('should set TRANSP property correctly', async () => {
      const response = await request(app)
        .get('/api/roster/000000/public/calendar.ics');
      
      const icsContent = response.text;
      
      // TRANSPARENT for free time, OPAQUE for busy time
      if (icsContent.includes('SUMMARY:Free')) {
        expect(icsContent).toContain('TRANSP:TRANSPARENT');
      }
      if (icsContent.includes('SUMMARY:Busy')) {
        expect(icsContent).toContain('TRANSP:OPAQUE');
      }
    });
  });
});
