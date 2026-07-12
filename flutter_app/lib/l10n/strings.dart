import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Global notifier for language
final appLocaleNotifier = ValueNotifier<String>('uz');

Future<void> loadSavedLocale() async {
  final prefs = await SharedPreferences.getInstance();
  final lang = prefs.getString('lang') ?? 'uz';
  appLocaleNotifier.value = lang;
}

Future<void> setLocale(String lang) async {
  appLocaleNotifier.value = lang;
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('lang', lang);
}

// Shorthand translation function
String tr(String key) => _strings[key]?[appLocaleNotifier.value] ?? _strings[key]?['uz'] ?? key;

const _strings = <String, Map<String, String>>{
  // Nav
  'nav_home':        {'uz': 'Asosiy',       'ru': 'Главная',      'en': 'Home'},
  'nav_projects':    {'uz': 'Obyektlar',    'ru': 'Объекты',      'en': 'Projects'},
  'nav_report':      {'uz': 'Hisobot',      'ru': 'Отчёт',        'en': 'Report'},
  'nav_workers':     {'uz': 'Ishchilar',    'ru': 'Люди',         'en': 'People'},
  'nav_profile':     {'uz': 'Profil',       'ru': 'Профиль',      'en': 'Profile'},

  // Projects screen
  'all':             {'uz': 'Barchasi',     'ru': 'Все',          'en': 'All'},
  'active':          {'uz': 'Active',       'ru': 'Активные',     'en': 'Active'},
  'paused':          {'uz': "To'xtatilgan", 'ru': 'Приостановлен','en': 'Paused'},
  'done':            {'uz': 'Tugallangan',  'ru': 'Завершено',    'en': 'Done'},
  'projects':        {'uz': 'Loyihalar',    'ru': 'Объекты',      'en': 'Projects'},
  'search':          {'uz': 'Qidirish...',  'ru': 'Поиск...',     'en': 'Search...'},
  'workers_count':   {'uz': 'ishchi',       'ru': 'раб.',         'en': 'workers'},
  'days_left':       {'uz': 'kun qoldi',    'ru': 'дн. осталось', 'en': 'days left'},
  'days_left_done':  {'uz': 'Tugallangan',  'ru': 'Завершено',    'en': 'Completed'},
  'new_project':     {'uz': 'Yangi loyiha', 'ru': 'Новый объект', 'en': 'New project'},
  'project_name':    {'uz': 'Loyiha nomi',  'ru': 'Название',     'en': 'Project name'},
  'start_date':      {'uz': 'Boshlanish',   'ru': 'Начало',       'en': 'Start date'},
  'duration_days':   {'uz': 'Muddat (kun)', 'ru': 'Срок (дн.)',   'en': 'Duration (days)'},
  'location':        {'uz': 'Manzil',       'ru': 'Адрес',        'en': 'Location'},
  'client':          {'uz': 'Mijoz',        'ru': 'Клиент',       'en': 'Client'},
  'create':          {'uz': 'Yaratish',     'ru': 'Создать',      'en': 'Create'},
  'cancel':          {'uz': 'Bekor',        'ru': 'Отмена',       'en': 'Cancel'},
  'delete':          {'uz': "O'chirish",    'ru': 'Удалить',      'en': 'Delete'},
  'save':            {'uz': 'Saqlash',      'ru': 'Сохранить',    'en': 'Save'},
  'optional':        {'uz': '(ixtiyoriy)',  'ru': '(необяз.)',    'en': '(optional)'},

  // Profile
  'profile':         {'uz': 'Profil',       'ru': 'Профиль',      'en': 'Profile'},
  'edit_profile':    {'uz': 'Profilni tahrirlash', 'ru': 'Редактировать профиль', 'en': 'Edit profile'},
  'full_name':       {'uz': 'Ism Familiya', 'ru': 'Имя Фамилия',  'en': 'Full name'},
  'phone':           {'uz': 'Telefon',      'ru': 'Телефон',      'en': 'Phone'},
  'profession':      {'uz': 'Kasb',         'ru': 'Профессия',    'en': 'Profession'},
  'experience':      {'uz': 'Tajriba (yil)','ru': 'Опыт (лет)',   'en': 'Experience (yrs)'},
  'portfolio':       {'uz': 'Portfolio',    'ru': 'Портфолио',    'en': 'Portfolio'},
  'upload_photo':    {'uz': 'Rasm yuklash', 'ru': 'Загрузить фото','en': 'Upload photo'},
  'logout':          {'uz': 'Chiqish',      'ru': 'Выйти',        'en': 'Log out'},
  'language':        {'uz': 'Til',          'ru': 'Язык',         'en': 'Language'},
  'projects_count':  {'uz': 'Loyihalar',    'ru': 'Объекты',      'en': 'Projects'},
  'portfolio_add':   {'uz': "Rasm qo'shish",'ru': 'Добавить фото','en': 'Add photo'},
  'portfolio_empty': {'uz': "Portfolio bo'sh", 'ru': 'Портфолио пустое', 'en': 'Portfolio empty'},

  // Detail
  'income':          {'uz': 'Kirim',        'ru': 'Доход',        'en': 'Income'},
  'expense':         {'uz': 'Chiqim',       'ru': 'Расход',       'en': 'Expense'},
  'balance':         {'uz': 'Qoldiq',       'ru': 'Остаток',      'en': 'Balance'},
  'transactions':    {'uz': 'Tranzaksiyalar','ru': 'Транзакции',   'en': 'Transactions'},
  'workers':         {'uz': 'Ishchilar',    'ru': 'Работники',    'en': 'Workers'},
  'files':           {'uz': 'Fayllar',      'ru': 'Файлы',        'en': 'Files'},
  'add_income':      {'uz': "Kirim qo'shish",'ru': 'Добавить доход','en': 'Add income'},
  'add_expense':     {'uz': "Chiqim qo'shish",'ru': 'Добавить расход','en': 'Add expense'},
  'no_transactions': {'uz': "Tranzaksiyalar yo'q",'ru': 'Нет транзакций','en': 'No transactions'},
  'no_workers':      {'uz': "Ishchilar yo'q",'ru': 'Нет работников','en': 'No workers'},
  'no_files':        {'uz': "Fayllar yo'q", 'ru': 'Нет файлов',   'en': 'No files'},
  'upload_file':     {'uz': 'Fayl yuklash', 'ru': 'Загрузить файл','en': 'Upload file'},
  'add_worker':      {'uz': "Ishchi qo'shish",'ru': 'Добавить работника','en': 'Add worker'},
  'edit_project':    {'uz': 'Tahrirlash',   'ru': 'Редактировать','en': 'Edit'},
  'completed':       {'uz': 'Yakunlangan',  'ru': 'Завершено',    'en': 'Completed'},
  'progress':        {'uz': 'Bajarilish',   'ru': 'Прогресс',     'en': 'Progress'},

  // General
  'confirm_delete':  {'uz': "O'chirilsinmi?", 'ru': 'Удалить?',   'en': 'Delete?'},
  'no_undo':         {'uz': 'Bu amalni qaytarib bo\'lmaydi.', 'ru': 'Это действие нельзя отменить.', 'en': 'This cannot be undone.'},
};

// Widget that rebuilds when locale changes
class LocaleBuilder extends StatelessWidget {
  final Widget Function(BuildContext) builder;
  const LocaleBuilder({super.key, required this.builder});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (ctx, _, __) => builder(ctx),
    );
  }
}
