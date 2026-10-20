import 'package:flutter/material.dart';

/// Logo-inspired accents, lifted for legibility on Dock's dark surfaces.
/// Monochrome brands retain neutral accents; their names remain visible.
class AgentIdentity {
  final String name;
  final Color color;
  const AgentIdentity(this.name, this.color);

  // Only assets with reviewed public brand guidance are bundled.
  // Other providers retain their readable name/color, without an invented logo.
  static String? logo(String provider) => switch (provider.toLowerCase()) {
    'codex' || 'openai' => 'assets/providers/openai.png',
    'cursor' => 'assets/providers/cursor.png',
    'opencode' => 'assets/providers/opencode.png',
    'cline' => 'assets/providers/cline.png',
    _ => null,
  };

  static AgentIdentity of(String provider) => switch (provider.toLowerCase()) {
    'claude' || 'anthropic' => const AgentIdentity('Claude', Color(0xffe6a187)),
    'codex' => const AgentIdentity('Codex', Color(0xfff2f2ed)),
    'openai' => const AgentIdentity('OpenAI', Color(0xff9cbfff)),
    'gemini' => const AgentIdentity('Gemini', Color(0xff8aafff)),
    'antigravity' => const AgentIdentity('Antigravity', Color(0xff90bdff)),
    'copilot' => const AgentIdentity('Copilot', Color(0xffbb9aff)),
    'opencode' => const AgentIdentity('OpenCode', Color(0xffc9c8c5)),
    'cursor' => const AgentIdentity('Cursor', Color(0xffe4e4e4)),
    'grok' => const AgentIdentity('Grok', Color(0xffdedee5)),
    'kiro' => const AgentIdentity('Kiro', Color(0xffc398ff)),
    'qwen' || 'alibaba' => const AgentIdentity('Qwen', Color(0xffa59aff)),
    'kimi' || 'moonshot' => const AgentIdentity('Kimi', Color(0xff91a7ff)),
    'cline' => const AgentIdentity('Cline', Color(0xffc8c8d0)),
    'droid' => const AgentIdentity('Droid', Color(0xffffa684)),
    'pi' => const AgentIdentity('Pi', Color(0xffffb08b)),
    'zai' || 'z.ai' => const AgentIdentity('Z.AI', Color(0xffb9c1ff)),
    'ollama' => const AgentIdentity('Ollama', Color(0xffe4e4e4)),
    'deepseek' => const AgentIdentity('DeepSeek', Color(0xff8aafff)),
    'shell' => const AgentIdentity('Shell', Color(0xff9cbfff)),
    'custom' => const AgentIdentity('Custom', Color(0xffc4b2da)),
    _ => AgentIdentity(provider, const Color(0xffb5bbd0)),
  };
}

class AgentMark extends StatelessWidget {
  final String provider;
  final double size;
  const AgentMark(this.provider, {super.key, this.size = 28});

  @override
  Widget build(BuildContext context) {
    final identity = AgentIdentity.of(provider);
    final asset = AgentIdentity.logo(provider);
    if (provider.toLowerCase() == 'shell') {
      return SizedBox.square(
        dimension: size,
        child: Icon(
          Icons.desktop_windows,
          size: size * .78,
          color: identity.color,
          semanticLabel: 'Computer terminal',
        ),
      );
    }
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: asset != null
            ? Image.asset(asset, fit: BoxFit.contain)
            : DecoratedBox(
                decoration: BoxDecoration(
                  color: identity.color.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Center(
                  child: Text(
                    identity.name.isEmpty ? '?' : identity.name.substring(0, 1),
                    style: TextStyle(
                      color: identity.color,
                      fontSize: size * .55,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
      ),
    );
  }
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
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AgentMark(provider, size: 20),
          const SizedBox(width: 6),
          Flexible(
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
          ),
        ],
      ),
    );
  }
}
