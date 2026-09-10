# Security

Marvel private credentials are server-only environment secrets. They are excluded from Git, browser bundles, API resources, application logs, Docker build arguments, and screenshots. The full storage, injection, and rotation procedure is in [AUTHENTICATION.md](AUTHENTICATION.md).

The catalog API validates query inputs, caps pagination, applies an IP-based rate limit, returns safe problem documents, and uses request identifiers in logs and responses. Browser and API share one origin, so no wildcard CORS policy is required.

Before production deployment, set `APP_DEBUG=false`, rotate any exposed credentials, provide secrets through the runtime platform, and terminate TLS at the ingress or load balancer.

The public catalog uses rate limiting rather than user authentication. Future private capabilities use Sanctum session cookies with CSRF protection; the first-party SPA must not store access tokens in local storage.
