# Dependency patch verification, 25 October 2026

The new audit reported Undici and fast-uri advisories after the previous day's
clean run. Existing overrides now pin Undici 7.30.1 and fast-uri 3.1.9. The
lockfile was regenerated with lifecycle scripts disabled; installation reports
zero known findings. Application/integration tests and full CI remain required.

Upstream reports: [Undici excessive content encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c)
and [fast-uri scheme decoding](https://github.com/advisories/GHSA-w74x-v6f9-j3xg).
No approval, signed historical evidence, native authentication, or provider budget
was changed by this dependency patch.
