import 'package:flutter/material.dart';

/// Logo-inspired accents, lifted for legibility on Dock's dark surfaces.
/// Monochrome brands retain neutral accents; their names remain visible.
class AgentIdentity {
  final String name;
  final Color color;
  const AgentIdentity(this.name, this.color);

  static AgentIdentity of(String provider) => switch (provider.toLowerCase()) {
    'claude' => const AgentIdentity('Claude', Color(0xffe6a187)),
    'codex' => const AgentIdentity('Codex', Color(0xfff2f2ed)),
    'gemini' => const AgentIdentity('Gemini', Color(0xff8aafff)),
    'antigravity' => const AgentIdentity('Antigravity', Color(0xff90bdff)),
    'copilot' => const AgentIdentity('Copilot', Color(0xffbb9aff)),
    'opencode' => const AgentIdentity('OpenCode', Color(0xffc9c8c5)),
    'cursor' => const AgentIdentity('Cursor', Color(0xffe4e4e4)),
    'grok' => const AgentIdentity('Grok', Color(0xffdedee5)),
    'kiro' => const AgentIdentity('Kiro', Color(0xffc398ff)),
    'qwen' => const AgentIdentity('Qwen', Color(0xffa59aff)),
    'kimi' => const AgentIdentity('Kimi', Color(0xff91a7ff)),
    'cline' => const AgentIdentity('Cline', Color(0xffc8c8d0)),
    'droid' => const AgentIdentity('Droid', Color(0xffffa684)),
    'pi' => const AgentIdentity('Pi', Color(0xffffb08b)),
    'shell' => const AgentIdentity('Shell', Color(0xff9cbfff)),
    'custom' => const AgentIdentity('Custom', Color(0xffc4b2da)),
    _ => AgentIdentity(provider, const Color(0xffb5bbd0)),
  };
}

class AgentBadge extends StatelessWidget {
  final String provider;
  const AgentBadge(this.provider, {super.key});

  @override
  Widget build(BuildContext context) {
    final identity = AgentIdentity.of(provider);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: identity.color.withValues(alpha: .10),
        border: Border.all(color: identity.color.withValues(alpha: .6)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        identity.name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: identity.color,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
