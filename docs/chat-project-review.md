# Chat project and title verification

19 October 2026. Covers the console project picker, automatic chat titles, agent context and saved workspace. Tests used temporary profiles, synthetic projects, mocked CLI launches and an unpaid PowerShell console. No paid model requests or changes to the user's saved projects were made.

## Behavior

A chat's explicit project ID determines its context. The selected project's ID, name, chat title and launch directory appear in `dock_context`, API instructions and each new console's private `PADDOCK.md`. Duplicate names and shared folders do not merge project context. An unlinked chat gets explicit guidance to clarify an uncertain target. Paddock does not infer a project from a message or matching title.

Automatic titles follow the selected project's name, including edits and workspace restoration. Custom titles remain unchanged. **Use project name as chat title** in the console's folder menu selects automatic naming. Editing the title selects custom naming; clearing it restores automatic naming. Relinking preserves the process, buffer, working folder and exact saved provider conversation ID. Historical Results attribution remains unchanged.

Live instruction files refresh on project/link/shared-instruction changes. Identical content is not rewritten. A running agent must call `dock_context` or reread its instruction file to consume updates. The app cannot rewrite information already in the model's conversation. These are Paddock titles; provider-native history titles are unchanged. The recorded directory is the process's launch directory, not subsequent shell `cd` commands. This binding is context routing, not filesystem isolation.

## Verification

| Check | Outcome |
| --- | --- |
| `npm run build` | Passed; existing bundle-size advisory remains |
| `npm test` | 143 passed, one environment-dependent WSL check skipped, zero failures |
| `npm run test:desktop` | All four suites passed: native consoles, layout, vault, tools, Results, restoration and setup |
| `node --test tests/chat-project.test.cjs` | Four passed: titles/process preservation, explicit context isolation, real shared-tool dispatch including API owners, and workspace restoration |
| `node scripts/project-link-smoke.cjs` | Passed in Electron: live project rename, remembered slot title, custom title, picker switch, actual authenticated MCP context, refreshed local file and restart |
| `node scripts/project-link-visual-check.cjs` | All four profiles passed: picker, naming switch, keyboard Space/Escape, focus return, linking, project navigation, opt-out/settings, selected axe rules, no horizontal overflow or page errors |

The four profiles are Windows Chromium, Mac Safari via WebKit, Pixel 7 via Chromium and iPhone 13 via WebKit. Screenshots were inspected for text wrapping, spacing, icon alignment, visible controls and clipping. Mac, Android and iPhone checks are emulated on Windows. Actual macOS/iOS font rendering, physical touch, virtual keyboards and screen readers remain unverified. These checks exercise the desktop HTML renderer at those sizes, not the native Android project editor. Live model understanding and obedience were not tested.

Review found a delayed dialog-close handler could take focus away from the user's next control. It now preserves an already focused visible control, and restores the opener when needed. The final four-profile run passed after that fix. Targeted axe checks cover text contrast, button names, labels and dialog names; this is not a full accessibility certification.

Screenshots and machine-readable records are in `artifacts/project-link/`. Representative screenshots and this report are saved separately in Paddock Results. Existing consoles are left running; the updated backend loads after restarting Paddock.

## Required page review

These outcomes cover the affected console header and project picker. Other pages are outside this change.

| Item | Status | Evidence and applicability |
| --- | --- | --- |
| 1. Privacy policy | Checked | The [project guide](projects-and-updates.md) documents selected-agent context and local instruction files. No new hosted account or telemetry. Existing provider data practices still apply. |
| 2. Terms | Not applicable | No new hosted service, contract or checkout. |
| 3. Refund policy | Not applicable | No payment flow or credits sold here. |
| 4. Cookies/storage | Checked | The existing local workspace stores the naming mode. Per-console instruction copies are documented. No tracking cookies added. |
| 5. Consent banner | Not applicable | No nonessential web tracking introduced. |
| 6. Form consents | Checked | Project and title mode are applied with Save. Cancel preserves the existing selection; no marketing consents. |
| 7. Necessary data | Checked | Records only the explicit project ID and naming choice alongside existing console metadata. No credentials or contact fields added. |
| 8. Third-party SDKs | Checked | No new dependencies or external requests for choosing a title. |
| 9. Dark patterns | Checked | Custom names remain available; no automatic project inference or forced project setup. |
| 10. Hidden fees | Checked | Linking and naming make no model calls. No provider-cost guarantees. |
| 11. Fake reviews | Not applicable | No testimonials; verification projects are synthetic. |
| 12. Unsupported claims | Checked | Deterministic binding is distinguished from model understanding. Live model and physical-device behavior remain unverified. |
| 13. Alt text | Checked | No content images added. Existing folder/close controls have accessible names. |
| 14. Contrast | Checked | Existing pink-blue toggle styling retained. Targeted axe text-contrast checks passed for all four profiles. Checked state also has a native checkbox. |
| 15. Keyboard navigation | Checked | Select, checkbox Space, Save, Escape and focus return exercised. Delayed focus stealing fixed. |
| 16. Business details | Not applicable | No commercial page or business identity collection. |
| 17. Children's data | Not applicable | No child-directed feature or age collection. |
| 18. Email unsubscribe | Not applicable | No email sent by these controls. |
| 19. Asset licenses | Checked | Existing icons/fonts reused; no new visual assets. |
| 20. Deletion | Checked | Unlinking/project deletion clears the live binding and refreshed context; old agent history and historical Results are not erased. The guide documents separate retention. |

Review references: [W3C focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) for meaningful navigation and dialog focus, and [European Commission information for individuals](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en) for disclosure/deletion applicability. This review makes no legal or accessibility certification claim.
