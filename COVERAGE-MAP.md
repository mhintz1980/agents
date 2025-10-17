# Coverage Map (Capabilities vs Agents)

**Generated:** 2025-10-16 21:46

## Capabilities
- Architecture (design): system-architect
- Architecture (review): architect-reviewer
- UI (gen): magic-mcp  → UI (arch): frontend-architect  → UI (integrate): context7
- Backend/API: backend-architect
- Quality: quality-engineer
- Security: security-engineer
- Performance: performance-engineer
- Refactoring/Tech Debt: refactoring-expert
- Python/General Lang: python-expert

## Gaps to Consider
- Cloud-architect (infra patterns, networking, IaC)
- Data-architect (modeling, governance, pipelines)
- DevOps/SRE (CI/CD, observability, incident mgmt)
- Product/UX strategist (bridging business → tech priorities)

## Conflicts/Duplicates
- Ensure only **one** canonical file for System Architect (drop the duplicate filename variant).
- Keep Architect Reviewer separate (review gate role) to avoid overlap.

## Governance Hooks
- Architecture Gate: required before merging core changes.
- UI Policy: Magic-first enforced via lint rule or PR checklist.