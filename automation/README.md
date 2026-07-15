# Person 2 Automation Skeleton

This folder is reserved for the automation and customer workflow workstream.
Person 1's backend exposes order and quote APIs; Person 2 should connect phone,
email, Fleetbase automation, PDF generation, and dashboard workflows to those APIs.

## Suggested Modules

- `twilio/`: inbound call webhook handlers and call recording metadata.
- `speech_processing/`: Whisper transcription and request cleanup.
- `email_parser/`: Outlook IMAP parsing and shipment extraction.
- `fleetbase_automation/`: Claude Computer Use driven Fleetbase workflows.
- `pdf_quotes/`: PDFKit quotation templates.
- `email_automation/`: SMTP quote delivery and customer follow-up.
- `dashboard/`: basic monitoring/logging UI or API adapter.
