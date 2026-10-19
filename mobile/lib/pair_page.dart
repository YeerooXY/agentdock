import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'dock_client.dart';
import 'help_link.dart';
import 'update_panel.dart';
import 'main.dart' show DockMark, pink;

class PairPage extends StatefulWidget {
  final DockClient client;
  const PairPage({super.key, required this.client});
  @override
  State<PairPage> createState() => _PairPageState();
}

class _PairPageState extends State<PairPage> {
  final code = TextEditingController();
  bool busy = false, cancelling = false;
  String error = '';
  @override
  void dispose() {
    if (busy && widget.client.pairing == null) {
      unawaited(widget.client.cancelPairing());
    }
    code.dispose();
    super.dispose();
  }

  Future<void> pair(String value) async {
    if (busy) return;
    setState(() {
      busy = true;
      cancelling = false;
      error = '';
    });
    try {
      await widget.client.pair(value);
    } catch (e) {
      if (mounted) {
        setState(
          () => error = e is FormatException ? e.message : 'Could not reach your PC. Check the network, PC address and Windows Firewall.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> scan() async {
    final found = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const ScanPage()),
    );
    if (found != null) {
      code.text = found;
      await pair(found);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Agent Dock'),
      actions: [
        TextButton.icon(
          onPressed: () => openUpdates(context),
          icon: const Icon(Icons.system_update_outlined),
          label: const Text('Updates'),
        ),
      ],
    ),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 44, child: DockMark()),
                const SizedBox(height: 24),
                const Text(
                  'Connect your PC',
                  style: TextStyle(
                    fontSize: 35,
                    height: 1.15,
                    color: pink,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'On your PC, open Agent Dock → Settings → Connect a phone. Scan its QR code, compare the code on both screens, then allow your phone on the PC.',
                  style: TextStyle(height: 1.6, color: Color(0xffc8cbe0)),
                ),
                const SizedBox(height: 28),
                FilledButton.icon(
                  onPressed: busy ? null : scan,
                  icon: const Icon(Icons.qr_code_scanner),
                  label: const Text('Scan QR code'),
                ),
                const SizedBox(height: 20),
                if (!busy)
                  TextField(
                    controller: code,
                    maxLines: 3,
                    minLines: 1,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: const InputDecoration(
                      labelText: 'Or paste a pairing code',
                    ),
                  ),
                const SizedBox(height: 12),
                if (busy && widget.client.pairingCode.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.symmetric(vertical: 16),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xff112139), Color(0xff29172f)],
                      ),
                      border: Border.all(color: const Color(0xffbd92dd)),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      children: [
                        const Text(
                          'Approve on your PC',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Semantics(
                          label:
                              'Verification code ${widget.client.pairingCode}',
                          child: ExcludeSemantics(
                            child: Text(
                              '${widget.client.pairingCode.substring(0, 3)} ${widget.client.pairingCode.substring(3)}',
                              style: const TextStyle(
                                fontSize: 30,
                                letterSpacing: 3,
                                color: Color(0xffe5eaff),
                                fontFamily: 'monospace',
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Only allow the request if both codes match. Until then, this phone has no access.',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                OutlinedButton(
                  onPressed: busy ? null : () => pair(code.text),
                  child: Text(
                    busy
                        ? widget.client.pairingCode.isEmpty
                              ? 'Connecting…'
                              : 'Waiting for approval…'
                        : 'Connect',
                  ),
                ),
                if (busy)
                  TextButton(
                    onPressed: cancelling
                        ? null
                        : () async {
                            setState(() => cancelling = true);
                            await widget.client.cancelPairing();
                          },
                    child: Text(cancelling ? 'Canceling…' : 'Cancel pairing'),
                  ),
                if (error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(error, style: const TextStyle(color: pink)),
                  ),
                const SizedBox(height: 24),
                const Text(
                  'API keys stay on your PC. Optional background alerts use your own Firebase project.',
                  style: TextStyle(
                    color: Color(0xffafb7cd),
                    height: 1.6,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'QR scanning uses Google ML Kit on this phone. Google receives usage and performance metrics, not the scanned image.',
                  style: TextStyle(
                    color: Color(0xffafb7cd),
                    height: 1.6,
                    fontSize: 12,
                  ),
                ),
                const HelpLink(),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class ScanPage extends StatefulWidget {
  const ScanPage({super.key});
  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  bool found = false;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Scan your PC’s code')),
    body: MobileScanner(
      onDetect: (capture) {
        final value = capture.barcodes.firstOrNull?.rawValue;
        if (!found && value != null && value.startsWith('agentdock:')) {
          found = true;
          Navigator.pop(context, value);
        }
      },
      errorBuilder: (context, error) => const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Camera unavailable. Go back and paste the pairing code instead.',
          ),
        ),
      ),
    ),
  );
}
