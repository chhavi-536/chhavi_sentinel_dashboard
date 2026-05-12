# Post-Mortem Report - May 10, 2026

## Executive Summary
Multiple service outages occurred due to chaos monkey injections. All issues have been resolved and services are currently operational.

## Timeline of Incidents

| Time | Event |
|------|-------|
| 13:25:00 | payment-service config.json corrupted (missing quote in JSON) |
| 13:25:01 | data-service module not found (wrong package name: expreqs) |
| 13:25:02 | auth-service slow response (500ms latency) |
| 13:25:05 | payment-service health check failed |
| 13:25:06 | data-service health check failed |
| 13:33:03 | Chaos monkey deleted express dependency from data-service |
| 13:48:00 | All services restored to HEALTHY |

## Root Causes

### 1. payment-service - Corrupted Config
- **Issue**: config.json had malformed JSON (missing closing quote)
- **Trigger**: Chaos monkey "corrupted-json" bug type
- **Fix**: Replaced with valid JSON `{"broken": false, "status": "ok"}`

### 2. data-service - Multiple Issues
- **Issue 1**: Wrong variable name `expreqs` instead of `express`
- **Issue 2**: Response handler had `(req, req)` instead of `(req, res)`
- **Issue 3**: Express dependency removed from package.json
- **Trigger**: Chaos monkey "wrong-variable" and "missing-dependency" bug types
- **Fix**: Rewrote index.js with correct code, restored express dependency

### 3. auth-service - Missing Files
- **Issue**: src/index.js was completely missing
- **Trigger**: Initial setup incomplete
- **Fix**: Created new index.js with health and login endpoints

## Resolution Steps

1. Fixed payment-service/config.json
2. Rewrote data-service/src/index.js with correct Express code
3. Restored data-service/package.json express dependency
4. Created auth-service/src/index.js
5. Installed all dependencies via npm install
6. Started services on new ports (4001, 4002, 4003)

## System Health Status

| Service | Status | Port |
|---------|--------|------|
| auth-service | ✅ HEALTHY | 4001 |
| data-service | ✅ HEALTHY | 4002 |
| payment-service | ✅ HEALTHY | 4003 |

**Overall System Status**: ✅ OPERATIONAL

## Lessons Learned

1. Chaos monkey effectively identifies configuration issues
2. Need for automated testing before deployment
3. Services should have separate ports from dashboard
4. Regular dependency audits required

## Action Items

- [ ] Add automated tests for all services
- [ ] Set up monitoring alerts for service failures
- [ ] Create rollback mechanism for quick recovery
- [ ] Schedule regular chaos monkey drills