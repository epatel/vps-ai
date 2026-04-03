import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:web/web.dart' as web;
import '../models/todo.dart';

/// Regex matching checkbox lines: `- [ ] text` or `- [x] text` (case-insensitive x)
final _checkboxLine = RegExp(r'^- \[([ xX])\] (.*)$');

/// Regex matching shorthand: `[ ] text` or `[x] text` at line start (no leading dash)
final _shorthandCheckbox = RegExp(r'^\[([ xX])\] (.*)$');

/// Pre-process description to normalize shorthand `[ ]`/`[x]` into GFM `- [ ]`/`- [x]`.
String _normalizeCheckboxes(String text) {
  return text.split('\n').map((line) {
    final m = _shorthandCheckbox.firstMatch(line);
    if (m != null) return '- [${m.group(1)}] ${m.group(2)}';
    return line;
  }).join('\n');
}

/// Toggle checkbox at [lineIndex] in [description] and return the updated string.
String _toggleCheckboxAt(String description, int lineIndex) {
  final lines = description.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return description;

  // Work on the normalized form so we match correctly
  final line = lines[lineIndex];
  final m = _checkboxLine.firstMatch(line) ?? _shorthandCheckbox.firstMatch(line);
  if (m == null) return description;

  final checked = m.group(1) != ' ';
  final label = m.group(2)!;
  // Always write back GFM form
  lines[lineIndex] = '- [${checked ? ' ' : 'x'}] $label';
  return lines.join('\n');
}

/// Count checked and total checkboxes in a description.
({int checked, int total}) _countCheckboxes(String description) {
  int checked = 0, total = 0;
  for (final line in description.split('\n')) {
    final m = _checkboxLine.firstMatch(line) ?? _shorthandCheckbox.firstMatch(line);
    if (m != null) {
      total++;
      if (m.group(1) != ' ') checked++;
    }
  }
  return (checked: checked, total: total);
}

class TodoTile extends StatefulWidget {
  final Todo todo;
  final int index;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final ValueChanged<String>? onUpdateDescription;

  const TodoTile({
    super.key,
    required this.todo,
    required this.index,
    required this.onToggle,
    required this.onEdit,
    this.onUpdateDescription,
  });

  @override
  State<TodoTile> createState() => _TodoTileState();
}

class _TodoTileState extends State<TodoTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final hasDescription = widget.todo.description.isNotEmpty;
    final normalized = hasDescription ? _normalizeCheckboxes(widget.todo.description) : '';
    final counts = hasDescription ? _countCheckboxes(widget.todo.description) : (checked: 0, total: 0);
    final hasSubCheckboxes = counts.total > 0;
    final allSubsDone = hasSubCheckboxes && counts.checked == counts.total;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: hasSubCheckboxes
                ? allSubsDone
                    ? Checkbox(
                        value: true,
                        onChanged: null,
                      )
                    : SizedBox(
                        width: 48,
                        height: 48,
                        child: Center(
                          child: Text(
                            '${counts.checked}/${counts.total}',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        ),
                      )
                : Checkbox(
                    value: widget.todo.done,
                    onChanged: (_) => widget.onToggle(),
                  ),
            title: Text(
              widget.todo.title,
              style: TextStyle(
                decoration: (widget.todo.done || allSubsDone) ? TextDecoration.lineThrough : null,
                color: (widget.todo.done || allSubsDone)
                    ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)
                    : null,
              ),
            ),
            subtitle: hasDescription && !_expanded
                ? Text(
                    widget.todo.description,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: widget.todo.done
                          ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4)
                          : Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  )
                : null,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (hasDescription)
                  IconButton(
                    icon: Icon(
                      _expanded ? Icons.expand_less : Icons.expand_more,
                      size: 20,
                    ),
                    tooltip: _expanded ? 'Collapse' : 'Show description',
                    onPressed: () => setState(() => _expanded = !_expanded),
                  ),
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 20),
                  tooltip: 'Edit',
                  onPressed: widget.onEdit,
                ),
                ReorderableDragStartListener(
                  index: widget.index,
                  child: const Icon(Icons.drag_handle, size: 20),
                ),
              ],
            ),
            onTap: hasDescription
                ? () => setState(() => _expanded = !_expanded)
                : null,
          ),
          if (_expanded && hasDescription)
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
              child: SizedBox(
                width: double.infinity,
                child: _buildDescription(context, normalized),
              ),
            ),
        ],
      ),
    );
  }

  /// Build the expanded description, splitting into interactive checkbox rows
  /// and markdown sections.
  Widget _buildDescription(BuildContext context, String normalized) {
    final lines = normalized.split('\n');
    final widgets = <Widget>[];
    final markdownBuffer = StringBuffer();

    void flushMarkdown() {
      final text = markdownBuffer.toString().trimRight();
      if (text.isNotEmpty) {
        widgets.add(MarkdownBody(
          data: text,
          selectable: true,
          extensionSet: md.ExtensionSet.gitHubFlavored,
          styleSheet: _markdownStyle(context),
          onTapLink: (text, href, title) {
            if (href != null) {
              web.window.open(href, '_blank');
            }
          },
        ));
      }
      markdownBuffer.clear();
    }

    for (int i = 0; i < lines.length; i++) {
      final match = _checkboxLine.firstMatch(lines[i]);
      if (match != null) {
        flushMarkdown();
        final checked = match.group(1) != ' ';
        final label = match.group(2)!;
        final lineIndex = i;
        widgets.add(_CheckboxRow(
          checked: checked,
          label: label,
          dimmed: widget.todo.done,
          onChanged: widget.onUpdateDescription != null
              ? (value) {
                  final updated = _toggleCheckboxAt(widget.todo.description, lineIndex);
                  widget.onUpdateDescription!(updated);
                }
              : null,
        ));
      } else {
        if (markdownBuffer.isNotEmpty) markdownBuffer.writeln();
        markdownBuffer.write(lines[i]);
      }
    }
    flushMarkdown();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: widgets,
    );
  }

  MarkdownStyleSheet _markdownStyle(BuildContext context) {
    return MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
      p: Theme.of(context).textTheme.bodyMedium?.copyWith(
        color: widget.todo.done
            ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4)
            : Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    );
  }
}

/// A single interactive checkbox row inside a description.
class _CheckboxRow extends StatelessWidget {
  final bool checked;
  final String label;
  final bool dimmed;
  final ValueChanged<bool>? onChanged;

  const _CheckboxRow({
    required this.checked,
    required this.label,
    required this.dimmed,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onChanged != null ? () => onChanged!(!checked) : null,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: Checkbox(
                value: checked,
                onChanged: onChanged != null ? (v) => onChanged!(v ?? false) : null,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(
                  label,
                  style: TextStyle(
                    decoration: checked ? TextDecoration.lineThrough : null,
                    color: dimmed || checked
                        ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4)
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
