import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions;
import '../main.dart';

class ProjectFile {
  final String name;
  final String path;
  final String publicUrl;
  final int? sizeBytes;
  final DateTime? updatedAt;

  ProjectFile({
    required this.name,
    required this.path,
    required this.publicUrl,
    this.sizeBytes,
    this.updatedAt,
  });

  String get extension => name.contains('.') ? name.split('.').last.toLowerCase() : '';

  bool get isImage => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].contains(extension);
  bool get isPdf => extension == 'pdf';
  bool get isExcel => ['xls', 'xlsx', 'csv'].contains(extension);
}

class ProjectFilesRepository {
  static const _bucket = 'project-files';

  Future<List<ProjectFile>> listFiles(String projectId) async {
    try {
      final items = await supabase.storage.from(_bucket).list(path: projectId);
      return items
          .where((f) => f.name != '.emptyFolderPlaceholder')
          .map((f) {
            final path = '$projectId/${f.name}';
            final url = supabase.storage.from(_bucket).getPublicUrl(path);
            return ProjectFile(
              name: f.name,
              path: path,
              publicUrl: url,
              sizeBytes: f.metadata?['size'] as int?,
              updatedAt: f.updatedAt != null ? DateTime.tryParse(f.updatedAt!) : null,
            );
          })
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<String> uploadFile(String projectId, String fileName, Uint8List bytes, String mimeType) async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    final ext = fileName.contains('.') ? '.${fileName.split('.').last}' : '';
    final safeName = '${ts}$ext';
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
