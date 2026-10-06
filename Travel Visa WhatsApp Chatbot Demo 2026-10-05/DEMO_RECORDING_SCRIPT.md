# Demo Recording Script

**Goal**: Record a 5-8 minute MP4 demonstrating all critical PDF requirements.

## Step 1: Main Menu & Setup
1. Send "Hi" to the chatbot to trigger the Main Menu.
2. Show the "Welcome to the Travel Visa Assistant" with 3 buttons.

## Step 2: Document Upload & Storage
1. Click "Submit Documents" -> "Select Document" -> "Passport".
2. Upload a sample Passport image/PDF.
3. Show WhatsApp responding "Upload successful".
4. **Drive Evidence**: Open Google Drive folder to show the newly uploaded Passport file in the correct Case ID folder.
5. **Sheets Evidence**: Open Google Sheets `Documents` tab to show the new row with `RECEIVED` state and Drive File ID.
6. **Slack Evidence**: Open Slack to show the `📄 New Document Received` notification.

## Step 3: Reviewer Rejection
1. Click the secure link in Slack to open the Reviewer Portal.
2. In the Reviewer Portal, locate the pending Passport document.
3. Enter "Blurred image" in the rejection reason box and click **Reject**.
4. Show WhatsApp receiving the rejection message: "Your uploaded document (Passport) was rejected. Reason: Blurred image. Please upload a replacement."

## Step 4: Replacement Upload (Version 2)
1. Send "Hi" again -> "Submit Documents" -> "Select Document" -> "Passport".
2. Upload a new/better Passport image.
3. Show WhatsApp responding "Upload successful".
4. **Drive Evidence**: Show the new file in Google Drive.
5. **Sheets Evidence**: Show the new row appended to the sheet with Version = 2.

## Step 5: Reviewer Approval
1. Refresh the Reviewer Portal.
2. Click **Approve** on the new version 2 of the Passport.
3. Show WhatsApp receiving the message: "Your uploaded document (Passport) has been approved!"
4. **Status Check**: In WhatsApp, go to "Submit Documents" -> "Check Status". Show the status reads `APPROVED` for Passport.

## Step 6: Appointment Booking & Calendar
1. Send "Hi" -> "Book Appointment" -> "Intro call".
2. Wait for Google Calendar slots.
3. Click "Change slot" to demonstrate it filters out the currently offered slot.
4. Click "Confirm booking" on the new slot.
5. **Calendar Evidence**: Open Google Calendar to show the newly created event.
6. **Sheets Evidence**: Show the row appended in the `Appointments` tab.
7. **Slack Evidence**: Show the `📅 New Appointment Booked` notification.

## Step 7: Resilience / Stale Actions
1. Scroll up in WhatsApp to the old "Confirm booking" button from the previous step.
2. Click it again.
3. Show the bot returning: "This action is no longer active. Please use the latest options..."
4. Click an old "Menu Documents" button.
5. Show the bot returning: "This action is no longer active..."

## Step 8: Visa Appointment
1. Send "Hi" -> "Book Appointment" -> "Visa appointment".
2. Follow prompts for destination, name, dates.
3. Show the response: "Visa appointment request received. Our team will coordinate with the embassy."

## Final Step
Stop recording and save as `demo.mp4`.
