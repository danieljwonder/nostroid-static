# Security

- Nostroid Static never needs, asks for, or stores a private key (nsec). It only reads public, signed events.
- Every event is checked against its signature before it is rendered or stored. Events that fail the check are dropped.
- Any event content that gets rendered into HTML is escaped or sanitised.
- The relay only accepts events signed by allowlisted public keys and verifies every signature.
- The server layer holds one shared secret (`REFRESH_SECRET`) that can only trigger a refresh; it grants no read or write access to content.

Report vulnerabilities privately through GitHub Security Advisories on this repository.
