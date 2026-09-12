# Deployment

The same images support NIQ-hosted, client-cloud and connected on-premises deployments. Deployment-specific values are supplied by environment variables for Phase 1. Production `.env` files must have restricted access and must never enter version control; move secrets to the target platform's secret manager when available.

The browser always calls the same-origin `/api` path. The web proxy routes it to the API container at runtime, so the frontend image is portable and does not embed a deployment-specific API URL during its build.

An on-premises application requires outbound HTTPS for scoring, face scan and MSG91. During an outage, local identity (when configured), patient, assessment, historical result and audit workflows remain available. New scoring is marked unavailable or pending and can be retried. No inbound connection from NIQ is required.

Database backups, object storage, TLS termination, restore exercises, log retention and alert routing are deployment responsibilities that must be captured in the customer runbook.
