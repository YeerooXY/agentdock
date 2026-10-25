# Bundled npm security fixes

`npm-12.2.1-paddock.1.tgz` contains the official npm 12.2.1 package with two bundled dependencies replaced by their patched upstream releases:

| Package | Original | Replacement |
| --- | --- | --- |
| undici | 6.29.0 | 6.29.1 |
| ip-address | 10.7.2 | 10.7.4 |

On 24 October 2026, npm 12.2.1 and the supported 11.21.1 release still bundled the affected versions. npm overrides do not replace these bundled copies. The repack retains all upstream source and licenses, changes npm's version to `12.2.1-paddock.1`, and adds `PADDOCK-PATCHES.json` with provenance. No npm application code is edited.

Rebuild after installing the project dependencies:

```powershell
node scripts/vendor-npm.cjs
```

The script downloads the three official registry archives, verifies their pinned SHA-512 values before extraction, replaces the two libraries in a temporary directory, and creates a sorted archive with fixed metadata. Two independent builds produced this SHA-512:

```text
sha512-yUa1+368VEOk/6YbE7q2uqMwxp8wzzcZPLhSBzdqftdVgFNEEd7l1boTwII6EUR4k41izSBXeTGaIfYMSXoDiQ==
```

Return the `npm` dependency to an official registry release once its bundled copies include both fixes. Remove this archive and the repack script together, then repeat clean installation, audit and packaged CLI installation checks.

Upstream advisories: [Undici content encodings](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c), [Undici EventSource](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685), [ip-address parsing](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5).
