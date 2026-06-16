import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/note_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';

class NotesScreen extends StatefulWidget {
  final Project project;

  const NotesScreen({super.key, required this.project});

  @override
  State<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends State<NotesScreen> {
  final _repo = NoteRepository();
  final _dateFmt = DateFormat('dd MMM, HH:mm');
  List<ProjectNote> _notes = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final notes = await _repo.load(widget.project.id);
    if (mounted) setState(() { _notes = notes; _loading = false; });
  }

  Future<void> _openEditor({ProjectNote? existing}) async {
    final titleCtrl = TextEditingController(text: existing?.title ?? '');
    final textCtrl = TextEditingController(text: existing?.text ?? '');
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    existing == null ? 'Yangi eslatma' : 'Eslatmani tahrirlash',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: AppColors.muted),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: titleCtrl,
              decoration: const InputDecoration(hintText: 'Sarlavha (ixtiyoriy)'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: textCtrl,
              autofocus: true,
              maxLines: 6,
              decoration: const InputDecoration(
                hintText: 'Eslatma matni...',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                if (textCtrl.text.trim().isNotEmpty) Navigator.pop(ctx, true);
              },
              child: Text(existing == null ? 'Qo\'shish' : 'Saqlash'),
            ),
          ],
        ),
      ),
    );

    if (saved == true && textCtrl.text.trim().isNotEmpty) {
      if (existing == null) {
        await _repo.add(widget.project.id, textCtrl.text.trim(), title: titleCtrl.text);
      } else {
        await _repo.update(widget.project.id, existing.id, textCtrl.text.trim(), title: titleCtrl.text);
      }
      _load();
    }
    titleCtrl.dispose();
    textCtrl.dispose();
  }

  Future<void> _delete(ProjectNote note) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.card,
        title: const Text('O\'chirishni tasdiqlang'),
        content: const Text('Bu eslatma o\'chiriladi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Bekor')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('O\'chirish', style: TextStyle(color: Color(0xFFEF4444)))),
        ],
      ),
    );
    if (ok == true) {
      await _repo.delete(widget.project.id, note.id);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text('Eslatmalar — ${widget.project.nomi}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: _openEditor,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _notes.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.note_alt_outlined, size: 52, color: AppColors.muted),
                      SizedBox(height: 12),
                      Text('Eslatmalar yo\'q', style: TextStyle(color: AppColors.muted, fontSize: 15)),
                      SizedBox(height: 4),
                      Text('Yuqoridagi + tugmasi orqali qo\'shing', style: TextStyle(color: AppColors.muted, fontSize: 12)),
                    ],
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  itemCount: _notes.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final note = _notes[i];
                    return Dismissible(
                      key: Key(note.id),
                      direction: DismissDirection.endToStart,
                      background: Container(
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.only(right: 20),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEF4444).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(Icons.delete_outline_rounded, color: Color(0xFFEF4444)),
                      ),
                      confirmDismiss: (_) async {
                        await _delete(note);
                        return false;
                      },
                      child: GestureDetector(
                        onTap: () => _openEditor(existing: note),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (note.title != null) ...[
                                Text(note.title!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                                const SizedBox(height: 6),
                              ],
                              Text(
                                note.text,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: note.title != null ? AppColors.text2 : AppColors.text,
                                  height: 1.5,
                                ),
                                maxLines: 4,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  const Icon(Icons.access_time_rounded, size: 12, color: AppColors.muted),
                                  const SizedBox(width: 4),
                                  Text(
                                    _dateFmt.format(note.createdAt),
                                    style: const TextStyle(fontSize: 11, color: AppColors.muted),
                                  ),
                                  const Spacer(),
                                  const Icon(Icons.edit_rounded, size: 12, color: AppColors.muted),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
      floatingActionButton: _notes.isNotEmpty
          ? FloatingActionButton(
              onPressed: _openEditor,
              backgroundColor: AppColors.accent,
              child: const Icon(Icons.add_rounded, color: Colors.white),
            )
          : null,
    );
  }
}
