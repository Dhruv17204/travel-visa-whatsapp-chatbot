# Acceptance Test Results

This document verifies the exact behavior of the Travel Visa WhatsApp Chatbot against the final PDF specification deliverables. All features marked as PASS have been comprehensively tested against live Google, Slack, and Meta WhatsApp environments.

| Test Case | Description | Result |
| :--- | :--- | :--- |
| **Successful Booking** | User requests "Intro call". System queries Google Calendar for free slots, presents valid buttons in WhatsApp. User selects slot. Event is confirmed and populated in the live Google Calendar. | **PASS** |
| **Unavailable Slot** | If Google Calendar `freeBusy` returns no available slots for the queried timeframes, system degrades gracefully and tells user slots are currently unavailable. | **PASS** |
| **Document Upload** | User uploads an image via WhatsApp. System downloads the bytes securely from the Meta CDN using the API. | **PASS** |
| **Drive Persistence** | Downloaded documents are successfully uploaded to the configured Google Drive folder with the correct naming convention. | **PASS** |
| **Sheets Persistence** | Document metadata (Case ID, Document Type, Version, Review Status) is successfully appended/upserted into the configured Google Sheets tracker. | **PASS** |
| **Slack Notification** | A formatted Slack message containing Case ID, Document Type, Status, and a secure Reviewer Portal link is sent to the staff channel. | **PASS** |
| **Reviewer Rejection** | Staff clicks "Reject" in the Reviewer Portal. UI enforces a mandatory rejection reason. The user is instantly notified in WhatsApp with the explicit reason to upload a replacement. | **PASS** |
| **Replacement Document v2** | User uploads a new image. System identifies it as a replacement, increments the version to `v2`, updates the DB `currentFlag` logic securely, and re-triggers Drive/Sheets/Slack workflows. | **PASS** |
| **Reviewer Approval** | Staff views the dashboard, sees `v2`, and clicks "Approve" via the confirmation modal. System marks the document as Approved. User receives a WhatsApp success notification. | **PASS** |
| **Check Status** | User selects "Check Status" in the main menu. System securely queries PostgreSQL for `currentFlag=true` documents and accurately reports statuses (MISSING, RECEIVED, REJECTED, APPROVED) back in WhatsApp. | **PASS** |
| **Duplicate / Idempotency** | User attempts to upload the exact same file twice. System detects identical SHA-256 hash. Upload is safely aborted to prevent duplicate versions and save Drive storage space. | **PASS** |

### Automated Test Suite
- **Unit & Integration Tests**: 31 tests across 10 suites.
- **Coverage**: Includes critical path testing for Reviewer Controller, Meta Webhooks, Auth Validation, Prisma DB Logic, and Slack formatting.
- **Status**: 100% PASSING (`npm test`).
