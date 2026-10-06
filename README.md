# Travel Visa WhatsApp Chatbot

A state-driven WhatsApp chatbot for handling travel visa enquiries, document uploads, and staff appointment bookings.
Built with NestJS and integrates with Meta WhatsApp API, Google Drive, Google Sheets, Slack, and Google Calendar.

## Features
- **Visa Enquiries**: Collects user travel details (destination, dates, applicants) and stores them.
- **Document Portal**: Upload Passport, Photo, and Travel Itinerary via WhatsApp. Files are validated, securely uploaded to Google Drive, and synced to Google Sheets.
- **Appointment Booking**: Books introductory calls synced to Google Calendar with robust conflict checking, or logs official visa appointment requests.
- **Human Handoff**: Connects users to staff via a "Talk to team" action.
- **Robustness**: Safe idempotency for Meta webhooks, exponential backoffs for network stability, and transaction-safe concurrency checks for database operations.

## Local Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure `.env` with API keys and secrets.
4. Run the development server: `npm run start:dev`

## Running Tests
Run unit and integration tests with:
```bash
npm run test
```

## Integrations
- Meta Graph API (WhatsApp Webhooks)
- PostgreSQL / Prisma
- Google Drive (Document Storage)
- Google Calendar (Staff Appointments)
- Google Sheets (Reporting/Logging)
- Slack (Internal Notifications)
