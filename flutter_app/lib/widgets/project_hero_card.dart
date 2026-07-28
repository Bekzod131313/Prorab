import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../models/member.dart';
import '../models/project.dart';
import 'member_row.dart' show colorForName;

import 'app_cached_image.dart';

class ProjectHeroCard extends StatelessWidget {
  final Project project;
  final List<ObMember> members;
  final int? memberCount;
  final VoidCallback? onTap;
  final VoidCallback? onUploadImage;
  final double height;
  final EdgeInsetsGeometry? margin;

  const ProjectHeroCard({
    super.key,
    required this.project,
    this.members = const [],
    this.memberCount,
    this.onTap,
    this.onUploadImage,
    this.height = 200,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    final hasImage = project.imageUrl != null && project.imageUrl!.isNotEmpty;
    final isDone = project.status == 'done';
    final (_, left, _) = project.schedule;
    final count = members.isNotEmpty ? members.length : (memberCount ?? 0);

    Widget cardContent = ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Background image or default deep indigo gradient
            if (hasImage)
              AppCachedImage(
                imageUrl: project.imageUrl!,
                fit: BoxFit.cover,
                errorWidget: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFF1A237E), Color(0xFF283593)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                ),
              )
            else
              GestureDetector(
                onTap: onUploadImage,
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFF1A237E), Color(0xFF283593)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.add_photo_alternate_outlined,
                      color: Colors.white38,
                      size: 48,
                    ),
                  ),
                ),
              ),

            // Gradient overlay for text readability
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.transparent, Color(0xCC000000)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),

            // Status badge (top-right)
            Positioned(
              top: 12,
              right: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isDone ? Colors.white.withOpacity(0.15) : const Color(0xFF10B981),
                  borderRadius: BorderRadius.circular(20),
                  border: isDone ? Border.all(color: Colors.white.withOpacity(0.2), width: 1) : null,
                ),
                child: Text(
                  isDone ? tr('done') : tr('active'),
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white),
                ),
              ),
            ),

            // Bottom info overlay
            Positioned(
              left: 14,
              right: 14,
              bottom: 12,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    project.nomi,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 18,
                      shadows: [Shadow(blurRadius: 4)],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      // Member avatars stack
                      if (members.isNotEmpty) ...[
                        ...members.take(4).map((m) {
                          final name = m.profile?.displayName ?? '';
                          final color = colorForName(name);
                          final initials = name.trim().isEmpty
                              ? '?'
                              : name.trim()[0].toUpperCase();
                          return Container(
                            width: 24,
                            height: 24,
                            margin: const EdgeInsets.only(right: 4),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: color,
                              border: Border.all(color: Colors.white, width: 1.5),
                            ),
                            child: Center(
                              child: Text(
                                initials,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          );
                        }),
                        if (members.length > 4)
                          Text(
                            '+${members.length - 4}',
                            style: const TextStyle(fontSize: 11, color: Colors.white70),
                          ),
                      ] else if (count > 0) ...[
                        SizedBox(
                          width: count.clamp(1, 3) * 18.0 + 10,
                          height: 22,
                          child: Stack(
                            children: List.generate(
                              count.clamp(1, 3),
                              (i) => Positioned(
                                left: i * 14.0,
                                child: Container(
                                  width: 22,
                                  height: 22,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withOpacity(0.3),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white, width: 1.5),
                                  ),
                                  child: const Icon(Icons.person, size: 11, color: Colors.white),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                      ],
                      if (count > 0)
                        Text(
                          ' $count ${tr('workers_count')}',
                          style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w600),
                        ),
                      const Spacer(),
                      const Icon(Icons.access_time_rounded, size: 12, color: Colors.white70),
                      const SizedBox(width: 4),
                      Text(
                        left == 0
                            ? tr('overdue')
                            : tr('days_remaining').replaceFirst('{}', '$left'),
                        style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );

    if (margin != null) {
      cardContent = Padding(padding: margin!, child: cardContent);
    }

    if (onTap != null) {
      return GestureDetector(onTap: onTap, child: cardContent);
    }

    return cardContent;
  }
}
