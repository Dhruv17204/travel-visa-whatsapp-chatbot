# Travel Visa WhatsApp Chatbot

A state-driven WhatsApp chatbot for handling travel visa enquiries, document uploads, and staff appointment bookings.
Built with NestJS and integrates with Meta WhatsApp API, Google Drive, Google Sheets, Slack, and Google Calendar.

## Architecture
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL (Prisma ORM)
- **State Machine**: Persistent finite state machine stored in `ConversationSession`.
- **Integrations**: Meta Graph API, Google APIs, Slack Webhooks.

## Prerequisites
- Node.js v18+
- PostgreSQL
- Local Redis (optional if enabled later)
- Meta WhatsApp Cloud API credentials
- Google Cloud Service Account (Drive, Sheets, Calendar)
- Slack Webhook

## Environment variables (WITHOUT values)
```env
DATABASE_URL=
META_ACCESS_TOKEN=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=
META_GRAPH_API_VERSION=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_SHEET_ID=
GOOGLE_CALENDAR_ID=
SLACK_WEBHOOK_URL=
REDIS_HOST=
REDIS_PORT=
REVIEWER_TOKEN=
```

## Setup & Integrations
- **Meta Setup**: Create a Meta App, select WhatsApp Cloud API, and subscribe to `messages` webhook.
- **Google Setup**: Obtain OAuth2 credentials, share target folder/sheet/calendar with the service account email.
- **Drive Setup**: Must point `GOOGLE_DRIVE_FOLDER_ID` to a shared Drive.
- **Sheets Setup**: Must point `GOOGLE_SHEET_ID` to an initialized sheet with `Documents` and `Appointments` tabs.
- **Calendar Setup**: Must point `GOOGLE_CALENDAR_ID` to an active calendar.
- **Slack Setup**: Set `SLACK_WEBHOOK_URL` from an incoming webhook app.
- **Database Setup**: `npx prisma db push` to initialize tables.
- **Webhook Setup**: Use ngrok to expose your local port 3000 to Meta API.
- **Reviewer Setup**: The reviewer portal is available at `/reviewer/documents?token={REVIEWER_TOKEN}`. Staff can approve or reject (requires a reason) documents, maintaining versioning.

## Local Development & Testing
1. `npm install`
2. Configure `.env`
3. `npm run start:dev`
4. Testing: `npm test`

## Workflows
- **Document Workflow**: User selects doc -> Uploads -> Stored in Drive/DB -> Notified in Slack. Reviewer rejects/approves. Rejections allow replacement uploads (v2).
- **Appointment Workflow**: User requests call -> Checks Calendar -> Confirmed -> Slack/Sheets updated. Stale buttons safely rejected.

## Known Limitations & Production Readiness
- Token-based MVP authentication for Reviewer Portal. SSO recommended for prod.
- Needs clustering and rate-limiting.
- Must deploy with HTTPS and secure secrets manager.
