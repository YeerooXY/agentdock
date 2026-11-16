# Upscayl

Upscayl is an optional local image tool in Settings → Tools. **Install and connect** downloads the official Windows portable release into Paddock's profile, checks its pinned SHA-256 and connects a bundled MCP adapter. Existing standard Windows installations are reused without being claimed as Paddock-owned downloads. No API key or image upload is required. A working Vulkan GPU is required.

The Windows integration pins [Upscayl 2.15.0](https://github.com/upscayl/upscayl/releases/tag/v2.15.0). The portable archive is 304,247,780 bytes; SHA-256 `6aa2f137ce45bac3877c5634bb0829f398ed757cbf4a72ccdef12b7473407823`, calculated from the official HTTPS release download on 31 October 2026. Upscayl is a separate AGPL-3.0 application; its application, models and licence remain in the downloaded package. Paddock does not redistribute its engine in the app bundle. Mac/Linux installation and integration are not implemented in this increment.

Installed location: `<Paddock profile>/integrations/upscayl/2.15.0`. The archive and installation are recorded in the managed-download inventory for manual cleanup. Removing the connection disables agent access and leaves the application and user images in place.

Agents discover `upscayl/models` and `upscayl/upscale_image` using `dock_tools`. The latter accepts absolute `input` and new `.png` `output` paths, an installed model name, scale 2/3/4 and an optional Vulkan GPU index. The parent output directory must exist. PNG, JPEG and WebP inputs up to 64 MB are supported. Default: `high-fidelity-4x`, 4× output. Default bundled models use a native 4× scale; 2×/3× output is resized by Upscayl. See the [official guide](https://github.com/upscayl/upscayl/wiki/Guide) for model and GPU selection.

Calls run one image at a time per adapter. The engine receives argument arrays and a restricted system environment, with no shell or inherited provider credentials. Existing files are never overwritten. Processing uses a temporary output and publishes a new PNG only after successful exit and a PNG-header check. GPU errors and the 110-second processing limit are returned to the agent. For unusually slow inputs, use a smaller image or the `upscayl-lite-4x` model. Inspect the processed image before using it.

Verification evidence is kept in `artifacts/upscayl`. Unit tests use fake downloads and child processes. The separately authorized Meshy batch used the actual RTX 5080 and the bundled High Fidelity model. Images remain in the user's Downloads folder; routine test evidence is not added to Results.
