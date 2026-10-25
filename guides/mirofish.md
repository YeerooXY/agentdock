## Rehearsing launch scenarios with MiroFish

MiroFish is an optional scenario tool, normally after the agreed build is complete
and before launch or a significant product change. Use it when the user requests
audience simulation, stakeholder reactions or comparison of launch approaches.
Do not run a simulation just because the connection exists. It does not replace
implementation tests, usability testing or real customer research.

Read the current project's brief, target audience and evidence first. Discover
tools with `dock_tools` for connection `mirofish`; invoke their returned names
through `dock_call`. Prepare a specific decision, alternative scenarios, sources,
assumptions and a small initial scope. Seed documents go to the configured
MiroFish service and its own model/Zep providers. Do not upload credentials or
unrelated project content. MiroFish costs are not included in Paddock's model ledger.

Create an external project with chosen text documents and the simulation question,
build its graph, poll the returned graph task, create and prepare a simulation,
poll preparation, then start with an explicit `max_rounds` (1–40). This bounds
rounds, not tokens or money. Honor the user's cost constraints; do not imply a hard
dollar cap exists. Poll `run_status` until terminal, generate the report, poll
`report_status`, then read it. Start/build/report operations can incur charges.
Do not automatically retry a timed-out create or start; inspect existing
projects/task/run status first. Use `stop_simulation` to stop requested work.

Record the external project, task and simulation IDs with the linked Paddock project
so another agent can resume the same investigation. Do not reuse a similarly named
external project without verifying its identity. Save the report and sources in
Results and record proposed follow-up experiments without expanding approved scope.

Describe outputs as simulated hypotheses. Distinguish persona objections from
measured user behavior. Do not turn synthetic votes, sentiment or simulated
purchase intent into conversion rates, revenue forecasts or probabilities of
success. Explain which assumptions could change the result and how to test them
with interviews, usability sessions, a landing-page experiment or a small launch.
