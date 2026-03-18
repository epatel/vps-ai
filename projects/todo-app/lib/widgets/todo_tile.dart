import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../models/todo.dart';

class TodoTile extends StatefulWidget {
  final Todo todo;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const TodoTile({
    super.key,
    required this.todo,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  State<TodoTile> createState() => _TodoTileState();
}

class _TodoTileState extends State<TodoTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final hasDescription = widget.todo.description.isNotEmpty;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: Checkbox(
              value: widget.todo.done,
              onChanged: (_) => widget.onToggle(),
            ),
            title: Text(
              widget.todo.title,
              style: TextStyle(
                decoration: widget.todo.done ? TextDecoration.lineThrough : null,
                color: widget.todo.done
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
                IconButton(
                  icon: Icon(Icons.delete_outline, size: 20, color: Colors.red.shade400),
                  tooltip: 'Delete',
                  onPressed: widget.onDelete,
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
                child: MarkdownBody(
                  data: widget.todo.description,
                  selectable: true,
                  styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                    p: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: widget.todo.done
                          ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4)
                          : Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
