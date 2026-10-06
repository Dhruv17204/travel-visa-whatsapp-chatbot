import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getLandingPage(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Travel Visa Assistant - Portfolio Project</title>
        <style>
          :root {
            --primary-navy: #0A2853;
            --corporate-blue: #295B9B;
            --background: #F5F7FA;
            --text-dark: #333333;
            --text-muted: #666666;
          }
          body {
            font-family: 'Inter', system-ui, sans-serif;
            margin: 0;
            padding: 0;
            background-color: var(--background);
            color: var(--text-dark);
            line-height: 1.6;
          }
          header {
            background-color: var(--primary-navy);
            color: white;
            padding: 60px 20px;
            text-align: center;
          }
          header h1 {
            margin: 0;
            font-size: 2.5rem;
            letter-spacing: 1px;
          }
          header p {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-top: 15px;
          }
          .disclaimer {
            background-color: #FEF7E0;
            color: #B06000;
            text-align: center;
            padding: 12px;
            font-size: 0.9rem;
            font-weight: 600;
          }
          .container {
            max-width: 1000px;
            margin: 50px auto;
            padding: 0 20px;
          }
          .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 50px;
          }
          .feature-card {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            text-align: center;
            border-top: 4px solid var(--corporate-blue);
          }
          .feature-card h3 {
            color: var(--primary-navy);
            margin-top: 0;
          }
          .workflow {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            text-align: center;
          }
          .workflow h2 {
            color: var(--primary-navy);
            margin-top: 0;
          }
          .flow-step {
            display: inline-block;
            background: #E8EAED;
            padding: 10px 20px;
            border-radius: 20px;
            margin: 10px;
            font-weight: 600;
            color: var(--text-dark);
          }
          .arrow {
            display: block;
            font-size: 1.5rem;
            color: var(--corporate-blue);
            margin: 5px 0;
          }
          footer {
            text-align: center;
            padding: 40px;
            color: var(--text-muted);
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="disclaimer">
          ⚠️ This is a demonstration travel-visa workflow platform and is not an official government immigration service.
        </div>
        
        <header>
          <h1>Travel Visa Assistant</h1>
          <p>WhatsApp-Powered Visa Enquiry & Case Management Platform</p>
          <p style="font-size: 0.95rem; margin-top: 25px; opacity: 0.8;">Built with Meta WhatsApp Cloud API & NestJS</p>
        </header>

        <div class="container">
          <div class="features">
            <div class="feature-card">
              <h3>Visa Enquiries</h3>
              <p>Automated guided chat flows for identifying correct visa types and requirements.</p>
            </div>
            <div class="feature-card">
              <h3>Document Collection</h3>
              <p>Secure upload and validation of applicant documents directly through WhatsApp.</p>
            </div>
            <div class="feature-card">
              <h3>Human Document Review</h3>
              <p>Secure web portal for staff to approve or reject documents with reason-tracking.</p>
            </div>
            <div class="feature-card">
              <h3>Appointment Scheduling</h3>
              <p>Direct calendar integration to book introductory consultation calls seamlessly.</p>
            </div>
            <div class="feature-card">
              <h3>Google Workspace</h3>
              <p>Automated synchronization with Google Drive for files and Google Sheets for logs.</p>
            </div>
            <div class="feature-card">
              <h3>Staff Notifications</h3>
              <p>Real-time Slack webhooks alerting the backend team to new pending reviews.</p>
            </div>
          </div>

          <div class="workflow">
            <h2>System Workflow</h2>
            <div class="flow-step">WhatsApp (User)</div>
            <div class="arrow">↓</div>
            <div class="flow-step">Visa Enquiry / Documents / Appointment</div>
            <div class="arrow">↓</div>
            <div class="flow-step">NestJS + PostgreSQL (Core)</div>
            <div class="arrow">↓</div>
            <div class="flow-step">Google Drive / Sheets / Calendar</div>
            <div class="arrow">↓</div>
            <div class="flow-step">Reviewer Portal (Staff)</div>
            <div class="arrow">↓</div>
            <div class="flow-step">Slack Notifications</div>
          </div>
        </div>

        <footer>
          &copy; 2026 Travel Visa Assistant. A portfolio demonstration project.
        </footer>
      </body>
      </html>
    `;
  }
}
