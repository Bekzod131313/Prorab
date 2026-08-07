import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../utils/haptics.dart';

class PdfPreviewScreen extends StatefulWidget {
  final pw.Document pdf;
  final String fileName;
  final String title;

  const PdfPreviewScreen({
    super.key,
    required this.pdf,
    required this.fileName,
    required this.title,
  });

  @override
  State<PdfPreviewScreen> createState() => _PdfPreviewScreenState();
}

class _PdfPreviewScreenState extends State<PdfPreviewScreen> {
  Uint8List? _pdfBytes;
  bool _isDownloading = false;

  @override
  void initState() {
    super.initState();
    _preparePdf();
  }

  Future<void> _preparePdf() async {
    final bytes = await widget.pdf.save();
    if (mounted) {
      setState(() {
        _pdfBytes = bytes;
      });
    }
  }

  Future<void> _downloadPdf() async {
    if (_pdfBytes == null || _isDownloading) return;
    setState(() => _isDownloading = true);
    AppHaptics.medium();
    try {
      await Printing.sharePdf(
        bytes: _pdfBytes!,
        filename: widget.fileName,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isDownloading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.title,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              tr('report_title'),
              style: TextStyle(
                fontSize: 12,
                color: isDark ? Colors.grey[400] : Colors.grey[600],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.print_rounded),
            tooltip: tr('report_title'),
            onPressed: () async {
              if (_pdfBytes != null) {
                AppHaptics.medium();
                await Printing.layoutPdf(
                  onLayout: (_) => _pdfBytes!,
                  name: widget.fileName,
                );
              }
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Full screen PDF Preview area
          Expanded(
            child: _pdfBytes == null
                ? const Center(
                    child: CircularProgressIndicator(),
                  )
                : PdfPreview(
                    build: (_) => _pdfBytes!,
                    canChangeOrientation: false,
                    canChangePageFormat: false,
                    canDebug: false,
                    useActions: false,
                    pdfFileName: widget.fileName,
                    loadingWidget:
                        const Center(child: CircularProgressIndicator()),
                  ),
          ),

          // Download button bar at bottom
          Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 10,
                  offset: const Offset(0, -4),
                ),
              ],
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed:
                        _pdfBytes == null || _isDownloading ? null : _downloadPdf,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    icon: _isDownloading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.file_download_rounded, size: 24),
                    label: Text(
                      tr('download_pdf_report'),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
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
