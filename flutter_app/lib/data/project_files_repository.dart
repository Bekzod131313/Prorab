import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions;
import '../main.dart';

class ProjectFile {
  final String name;
  final String originalName;
  final String path;
  final String publicUrl;
  final bool isTransactionFile;
  final int? sizeBytes;
  final DateTime? updatedAt;

  ProjectFile({
    required this.name,
    required this.originalName,
    required this.path,
    required this.publicUrl,
    this.isTransactionFile = false,
    this.sizeBytes,
    this.updatedAt,
  });

  String get extension {
    final fileToUse = originalName.isNotEmpty ? originalName : name;
    return fileToUse.contains('.') ? fileToUse.split('.').last.toLowerCase() : '';
  }

  bool get isImage => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].contains(extension);
  bool get isPdf => extension == 'pdf';
  bool get isExcel => ['xls', 'xlsx', 'csv'].contains(extension);

  factory ProjectFile.fromPath(String path) {
    final url = supabase.storage.from('project-files').getPublicUrl(path);
    final filename = path.contains('/') ? path.split('/').last : path;

    String customName = filename;
    String originalName = filename;
    bool isTxFile = false;

    final parts = filename.split('::');
    if (parts.length >= 4 && parts[1] == 'tx') {
      isTxFile = true;
      try {
        customName = Uri.decodeComponent(parts[2]);
        originalName = Uri.decodeComponent(parts[3]);
      } catch (_) {}
    } else if (parts.length >= 3) {
      try {
        customName = Uri.decodeComponent(parts[1]);
        originalName = Uri.decodeComponent(parts[2]);
      } catch (_) {}
    }

    return ProjectFile(
      name: customName,
      originalName: originalName,
      path: path,
      publicUrl: url,
      isTransactionFile: isTxFile,
    );
  }
}

class ProjectFilesRepository {
  static const _bucket = 'project-files';

  Future<List<ProjectFile>> listFiles(
    String projectId, {
    bool includeTransactionFiles = false,
  }) async {
    try {
      final items = await supabase.storage.from(_bucket).list(path: projectId);
      final allFiles = items
          .where((f) => f.name != '.emptyFolderPlaceholder')
          .map((f) {
            final path = '$projectId/${f.name}';
            final url = supabase.storage.from(_bucket).getPublicUrl(path);

            String customName = f.name;
            String originalName = f.name;
            bool isTxFile = false;

            final parts = f.name.split('::');
            if (parts.length >= 4 && parts[1] == 'tx') {
              isTxFile = true;
              try {
                customName = Uri.decodeComponent(parts[2]);
                originalName = Uri.decodeComponent(parts[3]);
              } catch (_) {}
            } else if (parts.length >= 3) {
              try {
                customName = Uri.decodeComponent(parts[1]);
                originalName = Uri.decodeComponent(parts[2]);
              } catch (_) {}
            }

            return ProjectFile(
              name: customName,
              originalName: originalName,
              path: path,
              publicUrl: url,
              isTransactionFile: isTxFile,
              sizeBytes: f.metadata?['size'] as int?,
              updatedAt: f.updatedAt != null ? DateTime.tryParse(f.updatedAt!) : null,
            );
          })
          .toList();

      if (!includeTransactionFiles) {
        return allFiles.where((f) => !f.isTransactionFile).toList();
      }
      return allFiles;
    } catch (_) {
      return [];
    }
  }

  Future<String> uploadFile(
    String projectId,
    String customName,
    Uint8List bytes,
    String mimeType, {
    String? originalName,
    bool isTransactionFile = false,
  }) async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    final orig = originalName ?? customName;
    final safeCustom = Uri.encodeComponent(customName);
    final safeOriginal = Uri.encodeComponent(orig);
    final txTag = isTransactionFile ? 'tx::' : '';
    final safeName = '$ts::$txTag$safeCustom::$safeOriginal';
    final path = '$projectId/$safeName';
    await supabase.storage.from(_bucket).uploadBinary(
      path,
      bytes,
      fileOptions: FileOptions(contentType: mimeType, upsert: true),
    );
    return supabase.storage.from(_bucket).getPublicUrl(path);
  }

  Future<void> deleteFile(String path) async {
    await supabase.storage.from(_bucket).remove([path]);
  }
}
