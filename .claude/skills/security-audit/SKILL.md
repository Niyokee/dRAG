---
name: security-audit
description: Performs comprehensive security audit on TypeScript/JavaScript codebases. Use when asked to review security, find vulnerabilities, audit code, or check for OWASP issues. Covers injection attacks, SSRF, XSS, authentication flaws, and sensitive data exposure.
---

# Security Audit Skill

## Overview
Perform a thorough security review following OWASP guidelines and industry best practices.

## Audit Checklist

### 1. Injection Vulnerabilities
- **Command Injection**: Check for unsanitized input in `exec()`, `spawn()`, `execSync()`
- **SQL Injection**: Look for string concatenation in database queries
- **NoSQL Injection**: Check for unsanitized input in MongoDB/ChromaDB queries
- **Template Injection**: Review template literals with user input

### 2. Server-Side Request Forgery (SSRF)
- Validate all user-provided URLs before fetching
- Block internal networks: `127.0.0.1`, `localhost`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`
- Block cloud metadata: `169.254.169.254`, `metadata.google.internal`
- Restrict allowed protocols (http/https only)

### 3. Cross-Site Scripting (XSS)
- Sanitize HTML output from user input
- Use proper encoding for different contexts (HTML, JS, URL)
- Check Content-Type headers on responses

### 4. Authentication & Authorization
- Review session management
- Check for hardcoded credentials
- Validate authorization on all endpoints
- Check for privilege escalation paths

### 5. Sensitive Data Exposure
- Search for hardcoded secrets, API keys, passwords
- Check logging for sensitive data leakage
- Review error messages for information disclosure
- Verify secrets aren't committed to version control

### 6. Input Validation
- Validate and sanitize all external inputs
- Enforce reasonable bounds on numeric inputs
- Validate URL formats and protocols
- Check for path traversal vulnerabilities

### 7. Denial of Service (DoS)
- Check for unbounded loops or recursion
- Review memory allocation with user-controlled sizes
- Look for regex DoS (ReDoS) patterns
- Check rate limiting on external requests

### 8. Dependency Security
- Check for known vulnerabilities in dependencies
- Review package-lock.json for outdated packages
- Verify dependencies are from trusted sources

## Audit Process

1. **Scope Identification**: Identify all entry points (MCP tools, HTTP endpoints, CLI args)
2. **Data Flow Analysis**: Trace user input from entry to processing
3. **Code Review**: Examine each vulnerability category above
4. **Findings Report**: Document each issue with:
   - Severity: Critical / High / Medium / Low / Info
   - Location: File path and line number
   - Description: What the vulnerability is
   - Impact: What an attacker could do
   - Recommendation: How to fix it
   - Code Example: Before and after

## Severity Classification (CVSS-aligned)

| Severity | Description |
|----------|-------------|
| Critical | Remote code execution, auth bypass, data breach |
| High | SSRF, SQL injection, privilege escalation |
| Medium | XSS, information disclosure, DoS |
| Low | Missing security headers, minor info leak |
| Info | Best practice recommendations |

## Output Format

```markdown
# Security Audit Report

## Executive Summary
- Total findings: X
- Critical: X, High: X, Medium: X, Low: X, Info: X

## Findings

### [SEVERITY] Finding Title
- **File**: path/to/file.ts:123
- **Category**: OWASP category
- **Description**: Detailed explanation
- **Impact**: What could happen if exploited
- **Recommendation**: How to fix
- **Code**:
  ```typescript
  // Before (vulnerable)
  // After (fixed)
  ```
```
