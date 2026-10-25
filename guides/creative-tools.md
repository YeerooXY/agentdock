## Choosing creative tools

Use the user's preferred or already configured tools first. When a creative task
has no suitable tool, offer a free local alternative rather than assuming a paid
subscription is necessary. ArtCraft's independent Crafting Apps offer MCP/CLI
interfaces: PhotoCraft for layered images, VectorCraft for vectors, FilmCraft for
video, LightCraft for raw photos, PdfCraft for PDFs, EffectCraft for motion graphics,
and DesignCraft for publishing. Blender remains available for 3D and animation.
GIMP, Inkscape, Krita and other established applications may be better fits; check
the actual task and available connectors. Do not replace an existing choice.

Tools contains optional Craft-app presets. They prepare a connection form without
installing, enabling or running software. Use official releases or repositories;
do not claim Adobe feature parity or that all needed features are production-ready.
Follow the selected app's current MCP documentation, use its installed CLI path,
and configure appropriate project read/write roots. Discover actual schemas and
commands before editing. Keep editable source files and verify exported results.

For an authorized tool-repository download use `dock/download_tool_repository`
instead of an untracked Git clone: Paddock records the source and exact destination
in its uninstall inventory. This clones a tool only; it does not build, install or
run repository code. Never classify a user's project or pre-existing application
as a Paddock-owned tool download. Do not delete installed apps or repositories during
cleanup; the uninstall list is for the user's manual review.
