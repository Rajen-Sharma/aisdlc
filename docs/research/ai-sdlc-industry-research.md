# AI-assisted SDLC industry research

Research date: 8 October 2026, Australia/Sydney. Status: initial research supporting the architecture plan; no tools have been installed or benchmarked in this repository.

## Findings and evidence quality

AI assistance is widely adopted, with coding agents gaining adoption. Available evidence supports investment in structured delivery and verification; it does not establish a universal productivity gain or prove that autonomous end-to-end delivery produces production-ready software. Survey findings measure reported use; product documentation establishes implementation options; controlled experiments measure outcomes in specific settings. Keep those categories separate.

| ID | Evidence | Interpretation and limitation |
| --- | --- | --- |
| RES-01 | Stack Overflow 2025 reports 84% using or planning to use AI, and 51% of professional developers using it daily. Accuracy distrust is 46%, versus 33% trust. [Survey](https://survey.stackoverflow.co/2025/ai) | Assistance is common, but the 84% figure includes intended adoption. These are respondent answers, not a census or a quality assessment. |
| RES-02 | JetBrains reports a survey of over 15,000 professional developers: May–July 2026 weekly coding-agent use of 90%, daily use of 68%; tool adoption includes Claude Code 39%, GitHub Copilot 21%, and Codex 16%. [August 2026 research](https://blog.jetbrains.com/research/2026/08/ai-coding-agent-adoption-2026/) | Recent vendor-run evidence of agent uptake. Tool-use percentages are not exclusive market shares. Do not directly compare them with Stack Overflow's older, differently defined questions. |
| RES-03 | DORA 2025 describes AI as amplifying existing organisational strengths and weaknesses. [Report overview](https://dora.dev/research/2025/dora-report/) | Supports improving delivery foundations alongside adoption. It is not evidence that buying a tool alone improves this project's outcomes. |
| RES-04 | METR's early-2025 trial used 16 experienced developers and 246 tasks on familiar mature repositories; AI increased completion time by 19%. [Paper](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf) | A controlled result in a narrow setting using early-2025 tools; do not generalize it to greenfield CMS development or current tools. |
| RES-05 | METR's February 2026 follow-up warns that selection effects and time measurement problems make its newer productivity signal unreliable. [Update](https://metr.org/blog/2026-02-24-uplift-update/) | Neither the old slowdown nor an apparent newer speedup supports a guaranteed forecast. Measure local outcomes. |

These sources are a dated evidence sample, not an exhaustive ranking of all tools or organisations. No universal sprint-approval or audit framework can be inferred from their adoption figures.

## How AI-assisted delivery is implemented

| Pattern | Primary implementation evidence | Application to this project |
| --- | --- | --- |
| Structured specifications before implementation | GitHub Spec Kit provides processes, reusable templates, and documented outcomes for specification, planning, implementation, and convergence. [Repository](https://github.com/github/spec-kit) | Adopt versioned requirements, design, tasks, and acceptance evidence. Evaluate Spec Kit templates during discovery; retain our explicit sprint/security gates. Tool availability establishes a pattern, not universal adoption. |
| Repository work delegated into reviewable changes | GitHub documents cloud agents that research repositories, edit files, run tests/linters in ephemeral environments, and produce reviewable branch/PR changes; session logs complement review and testing. [Documentation](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github) | Give an agent an approved story, bounded scope, and isolated environment; return a diff and reproducible check results. Human decisions remain external to agent execution. |
| Persistent progress across long-running work | Anthropic describes an initializer, durable feature/progress records, incremental feature implementation, Git history, and browser verification. [Engineering account](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Persist task/checkpoint status and evidence between sessions. Require editor/API demonstrations and tests before completion. This is vendor engineering experience, not a controlled cross-industry result. |
| AI-assisted pull-request review | GitHub supports requesting Copilot code review and configuring review guidance. [Documentation](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review) | Use AI review as additional feedback before accountable code/security review. Findings require reproduction and triage; an AI review alone cannot satisfy approval. |

Inference from this evidence: a practical starting architecture combines an existing coding agent with repository specifications, a small persistent task runner, deterministic CI, and human review gates. The evidence reviewed does not justify building a large agent orchestration platform as the first milestone.

## Recommended operating workflow

The following is our project recommendation, combining the evidence above with the user's governance requirements:

1. AI drafts requirements, source inventories, and stories; the product owner confirms scope and acceptance criteria.
2. AI drafts architecture and threat analysis; the designated reviewer accepts the design security gate.
3. AI prepares a capacity-aware sprint plan and review pack; the human approves the sprint plan.
4. An isolated agent implements one bounded story at a time, updating documentation and traceability. Keep source imports and transformations deterministic.
5. CI runs builds, relevant tests, security scans, and evidence capture. Failures return for correction within a bounded retry budget.
6. AI may propose review findings; engineering and security reviewers assess the actual diff, configuration, and test evidence. Code security acceptance attaches to the reviewed commit.
7. Present sprint outcomes and MVP staging demonstrations for explicit human acceptance. Retain the reviewed versions and decisions.
8. Release only the verified artifact after production-readiness checks and human release authorization. Monitor outcomes and feed defects into the backlog.

Role separation describes responsibilities; it does not require multiple simultaneously running agents. Start sequentially and introduce parallel execution only after dependency ownership and integration checks are proven.

## Tool evaluation and adoption decisions

Evaluate Claude Code and GitHub Copilot as candidates supported by the adoption evidence, alongside the available coding environment. Keep the runner contract provider-neutral. Prefer GitHub Issues/Projects, pull requests, and Actions if GitHub is selected as the repository platform; otherwise use equivalent existing organisational tools. Do not select a product solely from survey popularity.

Before purchasing or connecting tooling, compare privacy/retention terms, credential isolation, permission controls, structured task/result support, exportable logs, repository integration, local reproducibility, model/version recording, and total cost. Any product lacking enforceable human gates or exportable evidence is unsuitable for this delivery plan without compensating infrastructure.

Pilot candidates on the same synthetic stories: a content schema and draft/publication rule, a negative API authorization test, a rich-text transformation with rejected-input reporting, and an idempotent migration slice. Fix acceptance criteria and environment before each run; retain failed attempts. Review test changes so a candidate cannot appear successful by weakening the criteria.

Score demonstrated correctness and security first, then documentation/evidence completeness, total elapsed time, reviewer effort, rework, and cost per accepted story. Run repetitions where practical and record the small-sample limitations. Choose an initial tool through an architecture decision record with evidence, rather than claiming a statistically proven winner from a few tasks.

## Measurement and research maintenance

Capture a baseline from comparable tasks where feasible. Distinguish agent execution time, human effort, approval wait, and total lead time. Report accepted stories, first-pass acceptance, rework, escaped defects, security findings, deployment failures/recovery, migration correctness, and cost per accepted outcome. Explain task mix and sample size. Do not claim AI caused improvements from uncontrolled before/after observations.

Maintain this source register with access date, source type, relevant claim, limitation, and the linked project decision. Refresh before initial tool selection, material model/tool changes, and later AEM implementation. Release and sprint evidence must come from our actual runs; industry research cannot substitute for production acceptance evidence.
