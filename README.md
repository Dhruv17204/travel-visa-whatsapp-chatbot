# Travel Visa WhatsApp Chatbot

A production-ready WhatsApp chatbot designed to streamline the travel visa application process. Built with NestJS, Prisma, and the official Meta WhatsApp Cloud API.

## Project Overview

The Travel Visa WhatsApp Chatbot acts as an automated virtual assistant. It handles:
- **Visa Enquiries**: Guides applicants through visa requirements (Tourist, Business, etc.).
- **Document Collection**: Securely collects, hashes (SHA-256 for idempotency), and versions applicant documents (e.g., Passports).
- **Appointment Scheduling**: Books introductory staff calls directly into Google Calendar.
- **Reviewer Portal**: A secure dashboard for staff to approve or reject submitted documents.
- **Integrations**: Automatically uploads documents to Google Drive, tracks metadata in Google Sheets, and sends staff alerts via Slack.

## Architecture

- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL (managed via Prisma ORM)
- **State Machine**: Custom conversation session state machine tracking applicant interactions across WhatsApp.
- **External Integrations**:
  - **Meta Cloud API**: For receiving and sending WhatsApp messages/interactive buttons.
  - **Google Drive API**: For securely persisting user-uploaded documents.
  - **Google Sheets API**: For maintaining a master tracking log.
  - **Google Calendar API**: For checking availability and booking intro calls.
  - **Slack Webhooks**: For notifying staff of new pending documents.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- Meta Developer Account (WhatsApp Cloud API)
- Google Cloud Console Project (Drive, Sheets, Calendar APIs enabled + Service Account)
- Slack Workspace (Incoming Webhook URL)

### 1. Installation
\`\`\`bash
git clone https://github.com/Dhruv17204/travel-visa-whatsapp-chatbot.git
cd travel-visa-whatsapp-chatbot
npm install
\`\`\`

### 2. Required Environment Variables
Create a \`.env\` file in the root directory. **Do not commit this file.**
Required keys (names only):
- \`DATABASE_URL\`
- \`PORT\`
- \`META_VERIFY_TOKEN\`
- \`META_ACCESS_TOKEN\`
- \`META_APP_SECRET\`
- \`GOOGLE_DRIVE_FOLDER_ID\`
- \`GOOGLE_SHEETS_ID\`
- \`GOOGLE_CALENDAR_ID\`
- \`SLACK_WEBHOOK_URL\`
- \`REVIEWER_TOKEN\`
- \`REVIEWER_BASE_URL\`
- \`GOOGLE_SERVICE_ACCOUNT_EMAIL\`
- \`GOOGLE_PRIVATE_KEY\`

### 3. Database Setup
\`\`\`bash
npx prisma generate
npx prisma db push
\`\`\`

## How to Run the Application

**Development Mode:**
\`\`\`bash
npm run start:dev
\`\`\`

**Production Mode:**
\`\`\`bash
npm run build
npm run start:prod
\`\`\`

*Note: For local testing with Meta APIs, use \`ngrok\` to expose your localhost to the public internet.*
\`\`\`bash
ngrok http 3000
\`\`\`

## Integrations Setup

### Meta WhatsApp Webhook Setup
1. In the Meta App Dashboard, navigate to **WhatsApp > API Setup**.
2. Configure your Webhook URL to \`https://<your-ngrok-domain>/webhook\`.
3. Set the verify token to match your \`META_VERIFY_TOKEN\`.
4. Subscribe to the \`messages\` webhook field.

### Google Drive, Sheets, and Calendar Setup
1. Create a Service Account in GCP and download the JSON key.
2. Share your target Google Drive folder, Google Sheet, and Google Calendar with the Service Account email.
3. Ensure the respective API services are enabled in GCP.

### Slack Setup
1. Create a Slack App in your workspace.
2. Enable "Incoming Webhooks".
3. Create a Webhook URL for your chosen channel and add it to \`.env\`.

## Reviewer Portal Usage

1. Start the application.
2. Navigate to \`http://localhost:3000/reviewer/documents?token=<YOUR_REVIEWER_TOKEN>\`.
3. The dashboard will display all pending documents.
4. **Approve**: Staff can click "Approve" to accept the document. The user is instantly notified via WhatsApp.
5. **Reject**: Staff can click "Reject" and provide a mandatory reason. The user is instantly notified via WhatsApp and asked to upload a replacement (v2).
6. **Stale Protection**: If a reviewer attempts to approve an older version (e.g., v1) while a newer version exists (v2), the portal will safely block the action to maintain data integrity.

## GitHub Repository
**Repository:** https://github.com/Dhruv17204/travel-visa-whatsapp-chatbot.git
**Latest Core Commit:** \`f62d8ae\` (Final PDF compliance fixes)
**Latest UI Commit:** \`c878e2d\` (Professional HTML Dashboard UI Upgrade)
