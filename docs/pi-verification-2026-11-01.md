# Pi connection verification

Verified on 1 November 2026 using the installed Pi 1.4.0 CLI. No user defaults, account settings or Paddock routing were changed.

## Results

- `pi auth check --provider openrouter --model moonshotai/kimi-k2.6 --json --no-refresh` returned `ready`, with OAuth authentication.
- `pi mcp list --json` connected to the configured Paddock server and discovered `dock_context`, `dock_tools` and `dock_call`.
- OpenRouter's authenticated allowance API reported 18 of 50 free-model requests used, 32 remaining, and $0 API usage. Its credits endpoint reported $0 purchased and $0 used. The per-key spending cap was unspecified, which does not mean unlimited credit.
- The configured `moonshotai/kimi-k2.6` route has nonzero pricing: $0.65 per million input tokens and $3.41 per million output tokens at inspection time. It was not exercised against the zero balance.
- A temporary command-line override selected `cohere/north-mini-code:free`, which both OpenRouter and Pi listed as available with tools and zero input/output pricing. The saved default remains Kimi K2.6.

## Live handoff

The free Pi agent discovered the local-assistance schema through Paddock, requested a bounded extraction from local Strata, and wrote a correct `receipt.json` using the returned data:

```json
{
  "implementation": "local",
  "textInArtwork": false,
  "radiatingStrokes": false,
  "localRequestId": "pi-local-1793563754764",
  "localStatus": "completed"
}
```

The CLI reached `agent_settled`, exited successfully and did not freeze. Elapsed time was 8.777 seconds. Six cloud model responses used 8,459 input and 1,009 output tokens, with $0 provider-reported cost. Local Strata used 150 input and 20 output tokens in 646 ms.

There was one codemode script error, three local-call receipts and two file writes. The repeated local calls reused the same request ID, and Paddock returned the cached result; only one local inference was needed. The functional check passed, but this redundant activity is overhead to reduce before calling the route efficient. Provider retry and compaction were disabled for this probe. No paid fallback ran.

OpenRouter still reported 32 free requests remaining immediately after the run. That snapshot did not advance with the six observed model responses, so it is not proof that the requests consumed no daily allowance. Tokens, request allowance and dollar cost are separate measurements.

Evidence: `artifacts/pi-verification/2026-11-01T20-09-14.762Z/verification.json`, the adjacent receipt, and `artifacts/pi-verification/allowance-after.json`. The manual checker is `scripts/pi-live-probe.cjs --live`; it is excluded from automated tests. Credentials were used only in memory for the provider's read-only account endpoints and were not printed or saved.

## Remaining integration

Pi can act as a coordinator and call local assistance through Paddock. It is not yet registered as a Paddock task worker: the running `dock/task_candidates` response contains no Pi candidate, and the new native-worker registry also has no Pi adapter. Automatic delegation into Pi and Pi allowance display in Paddock remain separate implementation work.

The allowance must describe the selected route: OpenRouter's free-account flag does not make the paid Kimi model free. Any worker integration should distinguish free model routes from paid API routes and retain the local-first policy.

Endpoint definitions: [current-key allowance](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), [account credits](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits). Model pricing came from the live OpenRouter model catalog.
