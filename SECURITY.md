# Security Considerations

## Password Protection Implementation

This application implements HTTP Basic Authentication for CalDAV calendar access with the following security measures:

### Implemented Security Features

✅ **Password Hashing**: All passwords are hashed using bcrypt with 12 salt rounds before storage
✅ **Minimum Password Length**: Enforced 6-character minimum password length
✅ **Access Control**: Users can only access their own rosters (staff number verification)
✅ **Secure Storage**: Credentials stored in `data/credentials.json` (excluded from git via `.gitignore`)
✅ **No Plaintext Passwords**: Passwords are never stored in plaintext

### Security Recommendations

#### Production Deployment

🔒 **Use HTTPS**: Always deploy behind HTTPS (e.g., using Cloudflare Tunnel, reverse proxy, or load balancer). HTTP Basic Auth transmits credentials in base64 encoding, which is NOT secure over plain HTTP.

⏱️ **Rate Limiting**: Consider implementing rate limiting on authentication endpoints to prevent brute force attacks:
```javascript
// Example using express-rate-limit
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5 // limit each IP to 5 requests per windowMs
});
app.use('/api/roster/:rosterId/calendar.ics', authLimiter);
```

🔐 **Strong Passwords**: Encourage users to set strong passwords (consider increasing minimum length to 8+ characters)

🔄 **Password Rotation**: Implement password expiry and rotation policies if required by your security policy

📊 **Audit Logging**: Consider logging authentication attempts (success/failure) for security monitoring

#### Data Protection

- Credentials file (`data/credentials.json`) should be backed up securely
- Ensure file system permissions restrict access to the credentials file
- Consider encrypting the credentials file at rest if deploying on shared infrastructure

## Known Security Considerations

### Rate Limiting (CodeQL Alert)

**Status**: Not implemented in this PR (minimal changes scope)

**Recommendation**: Add rate limiting middleware to prevent brute force attacks on authentication endpoints. This is particularly important for production deployments.

**Risk Level**: Medium - Authentication endpoints without rate limiting can be targeted by brute force attacks

### HTTP vs HTTPS

**Status**: Application does not enforce HTTPS

**Recommendation**: Deploy behind a reverse proxy (nginx, Apache) or use a service like Cloudflare Tunnel to provide HTTPS termination. Do not expose HTTP Basic Auth over unencrypted connections in production.

**Risk Level**: High if deployed over HTTP - credentials can be intercepted

## Reporting Security Issues

If you discover a security vulnerability, please email security@example.com (update with actual contact) instead of opening a public issue.
