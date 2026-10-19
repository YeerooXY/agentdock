# Optional creative tools and uninstall review

**Tools → Free creative tools** offers seven independent ArtCraft applications:
PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft and DesignCraft.
Their upstream projects document local MCP/CLI interfaces. The cards link to the
official repositories and prepare disabled MCP connection forms. They download,
enable and start nothing. Choose the installed CLI path and the app's required
read/write roots, then test its actual available tools before editing files.
Feature coverage, file compatibility and release maturity vary. Existing user
tools remain the first choice; these are suggestions when an alternative is needed.

Dock records tool downloads it performs in `managed-downloads.json` and a readable
`managed-downloads.txt` in its profile. New agent package/installer workspaces,
Blender's managed Python runtime and REA's npm installation are recorded by setup.
An application discovered on the computer is not claimed as a Dock installation.
MiroFish is connected as a separately managed service, so it is not recorded as a
Dock download. Prior downloads made before tracking existed cannot be inferred
reliably and are not reconstructed by scanning user folders.

For an authorized tool-repository download, agents can use
`dock/download_tool_repository`. It shallow-clones a public GitHub repository
into the profile's `downloads` folder, records its source and exact location,
and refuses to overwrite an existing directory. It does not build or run the
download. Incomplete attempts remain visible for review. No arbitrary source URL,
credentials in a URL, or user-project path is accepted. Direct Git commands run
outside this helper are not automatically tracked. `dock/downloaded_tools` reads
the inventory and returns the text-list path.

During a normal interactive Windows uninstall, Dock asks whether to open this
list for manual cleanup. Choosing Yes opens the report with names, source URLs,
locations and installation states. Choosing No continues uninstalling Dock.
Neither choice deletes the downloaded tools, repositories, profile or projects.
Silent uninstalls/upgrades do not display a prompt; the report remains available.
Native agent installers may also place executables outside their recorded
installer workspace; use those applications' own uninstall instructions.

The notice never executes a removal command. Review your edits and shared
dependencies before manually removing a folder. Windows installer behavior still
requires validation on Windows before a release; the source-level retention
guards and inventory behavior are covered by automated tests.
