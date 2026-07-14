# 🚛 AI-Powered Multi-Agent Logistics Automation System

## Overview

This project is an AI-powered logistics automation system designed to streamline transportation order processing. It automates the complete workflow from receiving transportation requests through phone calls or emails to generating optimized quotations and updating Fleetbase.

The system leverages multiple AI agents to extract shipment details, validate requests, identify suitable vehicles, calculate pricing, optimize vehicle capacity, and generate quotations while minimizing manual intervention.

---

## Problem Statement

Logistics companies often receive transportation requests through unstructured phone calls and emails, making order extraction, validation, route checking, capacity analysis, pricing, and quotation generation slow and error-prone.

Additionally, vehicles frequently travel with unused capacity, resulting in reduced operational efficiency and increased transportation costs.

---

## Proposed Solution

The proposed solution is a Multi-Agent AI Logistics System that automates the entire order management workflow using AI and automation technologies.

The system performs:

- Customer request processing
- Shipment information extraction
- Route validation
- Vehicle capacity analysis
- Dynamic pricing
- Load optimization
- Quote generation
- Fleetbase automation
- Email notification

---

# System Architecture

Customer Call / Email
        │
        ▼
Speech-to-Text / Email Parser
        │
        ▼
Triage Agent
        │
        ▼
Route & Capacity Agent
        │
        ▼
Pricing Agent
        │
        ▼
Load Optimization Agent
        │
        ▼
Review Agent
        │
        ▼
Fleetbase
        │
        ▼
PDF Quote
        │
        ▼
Customer Email

---

# AI Agents

## 1. Triage Agent
- Extract shipment details
- Validate customer request
- Detect missing information
- Normalize order data

## 2. Route & Capacity Agent
- Check available vehicles
- Verify route compatibility
- Calculate remaining vehicle capacity

## 3. Pricing Agent
- Calculate transportation cost
- Apply pricing rules
- Generate quotation

## 4. Load Optimization Agent
- Identify partially loaded vehicles
- Recommend compatible shipments
- Apply controlled discounts

## 5. Review Agent
- Validate pricing
- Validate capacity
- Verify business rules
- Approve final quotation

---

# Features

- AI-powered shipment extraction
- Voice call processing
- Email order processing
- Fleetbase integration
- Vehicle capacity optimization
- Dynamic pricing
- Automated quotation generation
- PDF quote generation
- Automated email delivery
- Human review support
- Multi-agent architecture

---

# Tech Stack

## Frontend
- Angular

## Backend
- Node.js
- Express.js

## Database
- PostgreSQL

## AI Framework
- LangChain

## Large Language Model
- OpenAI GPT-5.5

## Automation
- Claude Computer Use

## Voice Processing
- Twilio
- OpenAI Whisper

## Email
- Outlook SMTP/IMAP

## Logistics Platform
- Fleetbase

## PDF Generation
- PDFKit

## APIs
- REST APIs

## Version Control
- Git
- GitHub

---

# Software Used

- Fleetbase
- Visual Studio Code
- Postman
- GitHub

---

# Project Structure

```
AI-Logistics-System/
│
├── backend/
│   ├── api/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   └── database/
│
├── frontend/
│
├── agents/
│   ├── triage_agent/
│   ├── route_agent/
│   ├── pricing_agent/
│   ├── optimization_agent/
│   └── review_agent/
│
├── automation/
│   ├── claude_computer_use/
│   ├── speech_processing/
│   ├── email_parser/
│   └── fleetbase/
│
├── documents/
│
├── README.md
│
└── package.json
```

---

# Workflow

1. Customer submits transportation request via phone or email.
2. Speech-to-Text or Email Parser extracts shipment details.
3. Triage Agent validates and structures the request.
4. Route & Capacity Agent identifies suitable vehicles.
5. Pricing Agent calculates transportation costs.
6. Load Optimization Agent applies discounts when spare capacity exists.
7. Review Agent validates operational and pricing constraints.
8. Fleetbase is updated automatically.
9. PDF quotation is generated.
10. Final quotation is sent to the customer via email.

---

# Expected Outcomes

- Reduced manual order processing
- Faster quotation generation
- Increased vehicle utilization
- Improved operational efficiency
- Reduced transportation costs
- Higher booking conversion rate
- Improved customer experience

---

# Future Enhancements

- Live GPS tracking
- Predictive demand forecasting
- AI route optimization
- Customer portal
- Mobile application
- ERP integration
- Real-time fleet monitoring

---

# Team Members

### Person 1
- Backend Development
- AI Agents
- Fleetbase Integration
- Pricing Engine
- Load Optimization

### Person 2
- Automation
- Claude Computer Use
- Voice Processing
- Email Integration
- PDF Generation
- End-to-End Workflow

---

# License

This project is developed for academic purposes as a demonstration of an AI-powered Multi-Agent Logistics Automation System.
