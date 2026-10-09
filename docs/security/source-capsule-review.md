# SEC-CODE-CAPSULE-001: source handoff checkpoint

Prepared 9 October 2026, Australia/Sydney. AI-prepared review; human code-security
acceptance pending. Partial NB-003/004 work within BUILD-ENG-002. This checkpoint
does not change the approved plan or authorize execution.

The new source capsule exports only explicitly selected lowercase `.mjs` files
under `src/` from an operator-owned, quiescent fixture checkout. It excludes the
platform, trusted checks and unselected files. The consumer must validate against
an expected SHA-256 obtained from a trusted task/artifact record. A digest supplied
solely by an untrusted sender is not authorization or proof of provenance.

Controls include canonical file ordering, duplicate rejection, exact object fields,
canonical base64, byte counts, per-file hashes and envelope hash. Maximums are 32
files, 64 KiB per file and 256 KiB total. Reads are bounded even if a file grows.
Traversal, hidden paths, absolute paths, backslashes, Windows device names and
alternate data streams are rejected. Filesystem checks reject directory links,
symbolic links and hard-linked files; available no-follow open flags and before/
after metadata checks provide additional protection.

Limitations: filesystem checks are not a sandbox against a hostile concurrent
writer. The caller must provide an operator-owned, quiescent checkout. This module
does not inspect source for embedded secrets, validate JavaScript behavior, safely
unpack arbitrary archives, or execute code. A source file can contain a secret;
only synthetic reviewed fixture input is permitted at this stage. A transport
must bound incoming JSON before parsing. Digest checks provide integrity against
a trusted expected digest, not signatures, immutable storage or human approval.

The fixture's filter function intentionally throws. It has not been implemented
by an AI, accepted as a story or shown as a delivered feature. Tests exercise the
export boundary, including outside-directory junction/symlink denial, hard-link
denial, tampering, encoding ambiguity, duplicate paths and size bounds.

Still required before coding: protected independent verifier and malicious-code
qualification (including success spoofing and process-tree termination), provider
credential isolation, explicit spend ceiling, exact task approvals and an actual
AI-generated patch. No executor consumes this format yet; execution stays disabled.
