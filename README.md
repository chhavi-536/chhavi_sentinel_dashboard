# Sentinel - Incident Monitoring & Resolution System

A monorepo with Next.js dashboard and Node.js microservices for monitoring and auto-resolving service incidents.

## Project Structure

```
sentinel/
├── app/                    # Next.js 14 dashboard (port 3002)
├── services/               # Microservices
│   ├── auth-service/      # Auth service (port 4001)
│   ├── data-service/      # Data service (port 4002)
│   └── payment-service/  # Payment service (port 4003)
├── db/                    # SQLite database
├── scripts/               # Utility scripts
│   └── chaos-monkey.js   # Random bug injector
├── docs/                  # Documentation
│   ├── incident-history.log
│   └── post-mortem-2026-05-10.md
└── .github/workflows/     # CI/CD pipelines
```

## Quick Start

### Install dependencies
```bash
cd D:\sentinel
npm install
cd app && npm install
cd ../services/auth-service && npm install
cd ../data-service && npm install
cd ../payment-service && npm install
```

### Start services
```bash
# Start all services on ports 4001-4003
cd services/auth-service && PORT=4001 node src/index.js &
cd services/data-service && PORT=4002 node src/index.js &
cd services/payment-service && PORT=4003 node src/index.js &
```

### Start dashboard
```bash
cd app && npm run dev
# Open http://localhost:3000
```

## Features

- **Dark Mode Dashboard** - Tailwind CSS styled
- **Auto-refresh** - Updates every 5 seconds
- **Auto-incident Creation** - Creates incidents for CRITICAL services
- **Auto-Resolve** - Simulate Claude AI fixing issues
- **Chaos Monkey** - Randomly injects 5 types of bugs:
  1. Syntax errors
  2. Wrong variable names
  3. Missing dependencies
  4. Corrupted JSON
  5. Logic errors

## Phase Execution Guide

1. **Phase 1**: Initialize repo, create chaos-monkey, CLAUDE.md
2. **Phase 2**: Build dashboard, connect database
3. **Phase 3**: Run chaos, use Plan mode, fix issues
4. **Phase 4**: Post-mortem, deploy to Vercel
