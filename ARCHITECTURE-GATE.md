# ARCHITECTURE GATE

**Generated:** 2025-10-16 21:46

## Trigger
- Any PR touching: `/src/app/(api|db|core)/**`, `/infrastructure/**`, `/packages/core/**`

## Required Steps
1. System design updated by **system-architect** (ADR or diagram)
2. Review by **architect-reviewer**
3. Security & performance sign-off for high-risk changes

## Artifacts
- `/reviews/architecture/ARR-<yyyy-mm-dd>.md`
- `/docs/adr/ADR-<id>.md`

## Checklist (Pass/Fail)
- [ ] Scalability patterns appropriate
- [ ] Security posture acceptable (authn/z, secrets, data)
- [ ] Performance targets feasible (budgets set)
- [ ] Coupling/cohesion reasonable; boundaries clear
- [ ] Migration/rollback strategy captured