import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../models/todo_image.dart';
import '../services/api_service.dart';

/// Represents a pending image not yet uploaded.
class PendingImage {
  final Uint8List bytes;
  final String filename;

  PendingImage({required this.bytes, required this.filename});
}

/// Attachment section for add/edit dialogs.
/// Shows existing image thumbnails (with delete), pending images, and an add button.
class ImageAttachmentSection extends StatelessWidget {
  final List<TodoImage> existingImages;
  final List<PendingImage> pendingImages;
  final ValueChanged<PendingImage> onAddPending;
  final ValueChanged<int> onRemovePending;
  final ValueChanged<String>? onDeleteExisting;
  final int maxImages;
  final String Function(String path)? imageUrl;

  const ImageAttachmentSection({
    super.key,
    this.existingImages = const [],
    required this.pendingImages,
    required this.onAddPending,
    required this.onRemovePending,
    this.onDeleteExisting,
    this.maxImages = 10,
    this.imageUrl,
  });

  int get _totalCount => existingImages.length + pendingImages.length;
  bool get _canAdd => _totalCount < maxImages;

  Future<void> _pickImage() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result != null && result.files.isNotEmpty) {
      final file = result.files.first;
      if (file.bytes != null) {
        onAddPending(PendingImage(
          bytes: file.bytes!,
          filename: file.name,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_totalCount == 0 && !_canAdd) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 12),
        Row(
          children: [
            Icon(Icons.image_outlined, size: 16,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(width: 6),
            Text(
              'Images ($_totalCount/$maxImages)',
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (int i = 0; i < existingImages.length; i++)
              _ExistingThumb(
                image: existingImages[i],
                imageUrl: imageUrl,
                onDelete: onDeleteExisting != null
                    ? () => onDeleteExisting!(existingImages[i].id)
                    : null,
              ),
            for (int i = 0; i < pendingImages.length; i++)
              _PendingThumb(
                pending: pendingImages[i],
                onRemove: () => onRemovePending(i),
              ),
            if (_canAdd)
              _AddButton(onTap: _pickImage),
          ],
        ),
      ],
    );
  }
}

class _ExistingThumb extends StatelessWidget {
  final TodoImage image;
  final String Function(String path)? imageUrl;
  final VoidCallback? onDelete;

  const _ExistingThumb({required this.image, this.imageUrl, this.onDelete});

  @override
  Widget build(BuildContext context) {
    final url = imageUrl != null
        ? imageUrl!(image.thumbUrl)
        : '${ApiService.baseUrl}${image.thumbUrl}';
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              url,
              width: 72,
              height: 72,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 72,
                height: 72,
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: const Icon(Icons.broken_image, size: 24),
              ),
            ),
          ),
          if (onDelete != null)
            Positioned(
              top: -6,
              right: -6,
              child: GestureDetector(
                onTap: onDelete,
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.error,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.close, size: 14,
                      color: Theme.of(context).colorScheme.onError),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PendingThumb extends StatelessWidget {
  final PendingImage pending;
  final VoidCallback onRemove;

  const _PendingThumb({required this.pending, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(
              pending.bytes,
              width: 72,
              height: 72,
              fit: BoxFit.cover,
            ),
          ),
          Positioned(
            top: -6,
            right: -6,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.error,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.close, size: 14,
                    color: Theme.of(context).colorScheme.onError),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddButton extends StatelessWidget {
  final VoidCallback onTap;

  const _AddButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: Theme.of(context).colorScheme.outline,
            width: 1.5,
            strokeAlign: BorderSide.strokeAlignInside,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add, size: 24,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            Text('Add', style: TextStyle(fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
