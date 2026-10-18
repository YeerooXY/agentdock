# Screen previews

Choose **Tools → Screen previews** on the PC. **Preview vague design requests** is on by default: when you ask an agent to “improve this screen”, its shared instructions ask it to inspect the screen and try a preview before making a substantial redesign. Review the image in Results and tell the agent what to keep or change. A precise change request can proceed directly. This is agent guidance, not an automatic approval gate or a guarantee that every agent can generate images.

## Choose a generator

| Choice | Setup | How it runs |
| --- | --- | --- |
| Agent's own generator first | No new Dock key | The agent uses its image tool and saves the image individually in Results. Meshy is the fallback if the tool is unavailable or fails. |
| OpenAI | Saved API key and image model | Direct Images edit request using the reference screenshot. Default model: `gpt-image-2.5-flare`. API billing is separate from CLI subscriptions. |
| Gemini / Nano Banana | Saved Gemini API key and image model | Direct Interactions request with the screenshot; `store:false`. Default model: `gemini-nano-banana-2.1`. |
| Meshy | Meshy CLI sign-in from Website review | Uses the existing image-to-image job flow and Meshy credits. Its CLI sign-in is separate from the Meshy MCP API key. |
| Compatible image API | Model, endpoint, optional saved key | Requires the OpenAI Images **JSON edit** request shape and a base64 image response. HTTPS is required, except loopback HTTP for local services. Multipart-only or URL-only APIs need an adapter. |

Add credentials directly in **Keys**, then select their names here. The model field is editable because availability depends on the provider and account. Saving preferences makes no provider call. An agent can prepare an `image` setup request; **Apply settings** in Tools commits your choice.

Provider contracts checked on 18 October 2026: [OpenAI image edits](https://developers.openai.com/api/reference/resources/images/methods/edit), [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [Interactions API](https://ai.google.dev/api/interactions-api). Provider access and image quality were not tested with paid calls.

## Generate and review

For a website, run **Website review**, open the completed review and choose **Generate preview**. It sends the saved screen and brief to your selected API or Meshy. The finished image is saved as its own Results item, with an Inbox link. **Change generator** returns to settings. **Draft in console** pastes a brief for you to review and send through an idle Codex or Claude console.

Agents can use any saved PNG, JPEG or WebP screenshot from their project, including an application screen:

1. Call `dock_context`, inspect the screen, and save the screenshot with `dock/save_result`.
2. Discover `dock/generate_preview` with `dock_tools`. Pass the screenshot's `referenceId` or a completed `reviewId`, a brief, and a stable `requestId` for that intended preview.
3. Read `dock/concept_status` for the result ID and saved file path. Inspect the returned image and show the user its Results entry.

In default agent mode, `generate_preview` returns guidance to use the agent's own tool. Only pass `nativeStatus: unavailable` or `failed` for a real fallback. A selected API is not silently replaced with another provider. Generated images are design proposals, never screenshots proving an implementation works.

Dock runs one routed image job at a time. It does not automatically retry API requests. Reusing a request ID in the same console/project returns its recorded job, including after restarting or removing the job. For an intentional new generation, use a new ID. After a timeout or interruption, check provider billing before starting again. Meshy jobs with an accepted task ID can be resumed without resubmitting.

## Data and usage

Generation sends the chosen screenshot and design prompt directly from the PC to that provider, with the selected model and credentials. A website-review brief may include its URL and user instructions. Review screenshots for private content before generating. The image, prompt and job metadata are stored locally; providers have their own processing and retention policies. `store:false` is an API setting, not a promise of zero provider retention.

API keys stay encrypted in Dock's vault and are resolved only in the main process. The renderer and agents receive key IDs, never values. Official provider destinations are fixed; custom destinations are user-configured, and requests do not follow redirects. There is no Agent Dock cloud relay or new telemetry.

API references are limited to 8 MB, response bodies to 30 MB and returned images to 20 MB. PNG, JPEG and WebP are supported. API output must contain image bytes; Dock does not fetch arbitrary output URLs. Results retains its existing item/storage limits. If a request fails after the provider accepts it, charges may still apply even though no preview is available.

**Usage → Image generation** lists provider-reported input/output tokens or Meshy credits. Missing values say **Unavailable**; zero stays zero. Image spending is separate from text API cost estimates and is not converted into invented dollar amounts. Native agent image-tool usage is only visible when that agent exposes it independently.

Delete an image from **Results** to recycle its saved copy. **Remove job** in Usage or Website review removes that job's prompt and temporary files; the saved image and usage/request-ID records remain. Those records prevent a repeated tool call from creating another charge. They contain identifiers, timestamps, status, provider/model, project path and reported counters, not image bytes or prompts. To erase that metadata too, quit Dock and remove `concept-usage.json` from its profile; doing so also removes repeat-request protection for deleted jobs. Removing local copies does not delete provider-side records.

These controls are in the desktop app. Existing Android Results can display the saved images; Android does not yet include generator settings or a project-management page.
