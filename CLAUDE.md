# Sentinel Project Guidelines

## TypeScript Rules
- **Never use `any` types** — always use explicit interfaces or types
- Define interfaces for all data structures, function parameters, and return values
- Enable `strict: true` in tsconfig.json for all projects

## Naming Conventions
- **Variables, functions, constants**: camelCase (e.g., `userName`, `getData`)
- **Components (React/Next.js)**: PascalCase (e.g., `UserProfile`, `Dashboard`)
- **Files**: kebab-case for non-component files (e.g., `auth-service.ts`)
- **Interfaces**: PascalCase with `I` prefix optional (e.g., `User` or `IUser`)

## Resolution Protocol
1. Before applying any fix, check `/docs/incident-history.log`
2. If this exact fix has failed before, use extended thinking to find an alternative
3. Document new fixes in incident-history.log after successful resolution

## Pre-Commit Checklist
- Always run `npm test` before committing any fix
- Ensure all tests pass before pushing changes