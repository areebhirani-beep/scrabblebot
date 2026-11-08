# Explicit live profiles and tournament handoff

Recorded November8,2026 UTC. The production research checkout's defaults are not the final tournament selection. The sole live coordinator will select the tournament profile after reviewing forward results. No final submission or repository visibility change is represented here.

| Source SHA256 | Activation | Exact policy | Purpose |
| --- | --- | --- | --- |
| 1563a4e3423e6d49cccc6cac0fc5b7add538fd9f9194b29880bc76bd208acb9c | After45294,01:12:32UTC | WIN30, gain1.1, neutralSixHorizon true, winBonus30, facePremium2, rare premium absent | Client dispatch/cache fixes and structured execution tracing; unchanged strategy |
| 4ea6d92111daa01810057fc7760c2fcbcbc5e3f2223ed80ef12aaf277c39abe9 | After45338,01:19:37UTC | Same profile plus rareFacePremium2 | Controlled live trial; review after10 completed games; not established superiority |

Full immutable source, dictionary and parameter manifests are in `experiments/live-releases/<SHA256>/`. Each RELEASE.json lists the complete profile and hashes. These snapshots contain no token and do not run automatically. Preserve the prior profile as rollback. The main research defaults were deliberately not silently changed to an experimental live profile.

The final tournament export must copy the coordinator-selected immutable source and its dictionary, verify every manifest hash, install dependencies from the lockfile, and document the exact launch policy. Credentials must be supplied separately and never committed. Final readiness must state which source/profile was selected, its actual forward live sample and remaining uncertainty. The user specified9:30PMCentral readiness; public visibility is pending that final review.

The standalone funded-restart candidate under `offline-lucent-lab/candidates/funded-restart` is a default-off experiment. It passed16 focused tests and TypeScript compilation; it has no simulation or live outcome at this checkpoint. Root owns the shared evaluation queue. The failed guarded-completion and cash9/minimum4 screens remain archived and disabled.
