# Linux hosts over SSH

Available in Windows and Android preview 15. Dock connects from your PC to a Linux VM or machine. Your paired phone uses the existing PC connection; it does not need a separate route or pairing to the VM.

## Prepare the VM

1. Create your Linux VM and give it an address reachable from the PC. For a VM using NAT, its SSH port needs a local host forwarding rule. Do not expose the VM's SSH port to the internet just for phone access.
2. Install its SSH server and tmux. For Ubuntu/Debian:

   ```sh
   sudo apt update
   sudo apt install openssh-server tmux
   sudo systemctl enable --now ssh
   ```

3. Use a normal Linux user and configure SSH-key login from the PC. Keep the private key on the PC; place only its public key in the VM user's `~/.ssh/authorized_keys`. A passphrase-protected key can use your local SSH agent. Dock does not forward that agent to the VM.
4. Install and sign in to the desired coding CLI inside Linux. Its command must be available in the remote login shell. Your Windows CLI installation or subscription login is not copied into Linux.
5. Create the Linux working folder, or clone the project there. SSH does not synchronize files between PC and VM.

On Windows, the OpenSSH Client optional feature provides `ssh`. Current Git for Windows also supplies a maintained host-key scanner; Dock uses it when available because some older Windows scanners fail against newer SSH servers.

## Add the connection

1. Open **Settings → Linux hosts → Add SSH host**.
2. Enter a name, hostname/IP, SSH port, Linux username and folder. Use an absolute Linux path, or `.` for the user's home. Optionally select an existing private-key file on the PC.
3. Click **Scan host identity**. In the VM's own console, run the displayed `ssh-keygen -lf ...` command. Compare the SHA256 fingerprint, tick the confirmation, then **Save trusted host**. The network scan alone is not proof of identity.
4. Click **Check connection**. It verifies Linux, tmux and available agent commands using SSH-key login.
5. Right-click a desktop **+**, choose **Computer**, then the saved host and agent. On Android, tap the chat name → **New console → Computer**. The phone uses the saved host folder.

Every SSH connection checks the saved host key. A changed key is refused. If you intentionally rebuilt the VM, edit the host, scan again and verify the new fingerprint at its console.

## Reconnect and close

Each console has a stable tmux session name. Losing the phone connection leaves it running. Quitting Dock disconnects SSH while the remote job continues; reopening with **Restore previous consoles** enabled reattaches it. A disconnected tile can use the ordinary restore/retry control.

**Close console** explicitly ends that tmux session and its running work. It uses SSH-key authentication. Password login remains possible inside an interactive SSH console, but automated checks, unattended reconnects and the separate Close request need working key authentication. If the remote task already exited, Close removes its tile.

tmux preserves a process while Linux is running; it does not preserve it through a VM reboot or power loss. CLI conversation recovery after a VM reboot depends on that CLI.

## Scope and data

- Host names, addresses, usernames, folders, public fingerprints and selected key **paths** are stored in Dock's local `ssh/hosts.json`. Private keys and passwords are not copied into it or sent to the phone.
- No SSH agent, X11, local port or tool bridge is forwarded. Personal SSH config hooks and proxies are not executed by these saved profiles.
- The phone streams the same remote terminal through the PC. It can use the agent's live commands and models.
- Remote file browsing, image uploads, automatic Results capture, usage hooks and agent-completion tracking are not connected to the VM in this first version. The console remains **open**, rather than guessing whether a remote agent has finished. Configure tools and project instructions inside Linux.
- The PC must stay on and reachable for phone access. The VM must also remain on. A reachable private VPN route is compatible; a privacy VPN alone does not create that route.

References checked 20 October 2026: [Ubuntu SSH installation](https://ubuntu.com/server/docs/how-to/security/openssh-server/), [OpenSSH configuration](https://man.openbsd.org/ssh_config), [host-key scanning](https://man.openbsd.org/ssh-keyscan), [tmux sessions](https://github.com/tmux/tmux/wiki/Getting-Started).
