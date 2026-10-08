# Code security review SEC-CODE-001

Status: human acceptance recorded for local MVP scope on 8 October 2026; see APP-CODE-001. Design: SEC-DES-001 local MVP. Reviewed source: d6f926dfad2f654e43c853990cd831e8c7bc7ba6; evidence commit: 225a598. Production blockers and limitations remain. This acceptance comes from the user's explicit review decision, not the AI's own approval.

| Design risk | Implementation/evidence | Disposition for human review |
| --- | --- | --- |
| DES-001 | Collection read requires public + published; anonymous revisions denied; author/provenance fields private; local public reads respect authorization. Integration/browser negative tests pass. | Controls implemented; human assessment pending |
| DES-002 | Collection/field permissions plus explicit role guard; publish hook and hidden editor publish UI; REST role/publish attempts return 403. | Controls implemented; human assessment pending |
| DES-003 | Plain text only; HTML markup rejected; React text rendering escapes content; injected instruction stays private draft text. | No rich-text conversion claimed; runner sandbox/prompt-injection execution evaluation remains later scope |
| DES-004 | Composite source key, source hash and imported-content hash; repeats skip, source changes update, destination edits conflict. | Offline single-importer/no-editor-write condition required; concurrent atomic conflict control deferred |
| DES-005 | Ignored generated secrets/credentials, synthetic data, separately pending approvals; dependency audit zero findings after pinned overrides. | Automated secret/static-analysis tooling and immutable approval storage remain later production gates; no claim of completed scans |
| DES-006 | MVP does not fetch source assets or archives | Deferred source connectivity design review required |

Observed development issues: initial role-update denial was silent, fixed with before-operation rejection; initial test cleanup double-deleted an author, fixed without weakening acceptance assertions; initial browser request lacked the trusted Origin header and was rejected, corrected in test request context. Final passes are linked alongside preserved attempt evidence. These were implementation/test findings, not human-accepted exceptions.

Production blockers: actual Drupal validation; protected review configuration and immutable evidence storage; full static/secret scans; production database migrations; load/recovery evidence; external identity/MFA, email delivery and operational ownership; migration concurrency/checkpoints/media handling; production security assessment. No production promotion is authorized.

Human decision template: reviewer identity; reviewed implementation commit + manifest digest; design scope/version; findings/questions; accept/reject; conditions with owner/date; decision timestamp/timezone. Material code changes require renewed review.
