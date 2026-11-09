# Security

- Nostroid Static never needs, asks for, or stores a private key (nsec). It only reads public, signed events.
- Every event is checked against its signature during `sync` before it's saved. Events that fail the check are dropped.
- Any event content that gets rendered into HTML is escaped or sanitised.

Report vulnerabilities privately through GitHub Security Advisories on this repository.
