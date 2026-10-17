# Remote access without a separate VPN app

Update, 17 October 2026: direct internet access through the user's own router is implemented in `0.6.0-preview.2`. See [setup](android-setup.md#direct-internet-without-a-relay). A paid relay is not required when the home connection supports incoming traffic. The relay described below remains an optional proposal for networks where direct access is unavailable.

Proposal, 17 October 2026. Remote relay support is not implemented or deployed. The existing direct local-network connection works without Tailscale. No server has been purchased or account configured.

## First version

Use direct HTTPS/WSS on the same network. For internet access, both the PC and Android app would make outgoing connections to a small Agent Dock relay. This avoids asking users to install a VPN or change their router. Keep QR pairing and device removal inside Dock.

The relay should forward an authenticated, bounded tunnel carrying the existing phone-to-PC TLS connection. The phone must still verify the PC certificate pinned during pairing. The relay must never terminate that inner connection or receive model API keys, terminal text or result content in plaintext. Use established TLS implementations; do not create a custom encryption protocol. The relay will still observe connection addresses, timing and traffic volume, which needs to be disclosed with minimal retention.

The first internet version would relay traffic instead of attempting to recreate Tailscale's entire network traversal system. Keep the selected-terminal stream, compressed batches, on-demand Results and no command replay. A later direct internet path could reduce relay bandwidth, but adds connection negotiation and network testing. Some networks require a relay when direct connectivity fails; see [WebRTC's TURN guidance](https://webrtc.org/getting-started/turn-server).

## Work estimate

These are rough engineering estimates, not delivery promises:

- Provision one small server, DNS and HTTPS: a few hours once the hosting account/domain are available.
- A working end-to-end prototype: a few focused development days, reusing Dock's existing session and Results protocol.
- A pilot suitable for friends: roughly another one to two weeks for reconnection, pairing/revocation, abuse controls, rollout and real-network testing.
- A broadly available service: additional work on capacity, monitoring, updates, operating costs and support. Nine consoles on one PC do not imply nine simultaneous terminal streams; the phone currently streams one selected console.

The difficult parts are authenticated device routing, hostile connection handling, bounded queues, disconnected phones, network switches, server restarts and safe upgrades. Test that an unknown device or compromised relay cannot read a session, substitute a PC identity, replay a command or bypass removal.

## Hosting and ownership

A small VM is a plausible pilot starting point, subject to load testing. DigitalOcean currently lists a 1 GiB/1 vCPU VM with 1,000 GiB transfer for **US$6/month**; tax, a domain, optional backups and overages may add costs. This is a hosting example, not a measured capacity claim. [Provider pricing](https://www.digitalocean.com/pricing/droplets), checked 17 October 2026.

One shared relay would make user setup simpler, while its operator pays for and maintains hosting. A self-hosted relay would use the same server package with a configurable endpoint; each operator would manage their own hosting. The hosting choice is still open. Software can be developed and tested locally before paying for a server.

Firebase completion alerts are a separate decision. Replacing the VPN connection alone does not replace Android background push delivery. The current Firebase path remains optional. Any alternative needs its own battery/background-delivery tests.
