import 'package:flutter/material.dart';

import '../data/project_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import '../widgets/moliya_logo.dart';
import '../widgets/project_card.dart';
import 'project_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _repo = ProjectRepository();
  List<Project> _projects = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final projects = await _repo.loadProjects();
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openAddProject() async {
    final nameCtrl = TextEditingController();
    final daysCtrl = TextEditingController(text: '30');
    DateTime startDate = DateTime.now();

    final created = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Yangi obyekt',
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(hintText: 'Obyekt nomi'),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: startDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setSheetState(() => startDate = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Boshlanish sanasi'),
                  child: Text(
                    '${startDate.year}-${startDate.month.toString().padLeft(2, '0')}-${startDate.day.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: daysCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: 'Muddat (kun)'),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  if (nameCtrl.text.trim().isEmpty) return;
                  Navigator.of(ctx).pop(true);
                },
                child: const Text('Yaratish'),
              ),
            ],
          ),
        ),
      ),
    );

    if (created == true) {
      final days = int.tryParse(daysCtrl.text.trim()) ?? 30;
      await _repo.createProject(
        nomi: nameCtrl.text.trim(),
        boshlanish: startDate,
        muddat: days,
      );
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Row(
          children: const [
            MoliyaLogo(size: 28),
            SizedBox(width: 10),
            Text('Moliya'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddProject,
        child: const Icon(Icons.add_rounded),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Center(
            child: Text('Xatolik: $_error', style: const TextStyle(color: Colors.redAccent)),
          ),
        ],
      );
    }
    if (_projects.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 100),
          const Icon(Icons.folder_open_rounded, size: 56, color: AppColors.muted),
          const SizedBox(height: 12),
          const Center(
            child: Text("Hozircha obyektlar yo'q", style: TextStyle(color: AppColors.text2)),
          ),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: _projects.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12, left: 4),
            child: Text(
              'Faol obyektlar',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          );
        }
        final project = _projects[index - 1];
        return ProjectCard(
          project: project,
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project)),
            );
          },
        );
      },
    );
  }
}
