import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Global notifier for language
final appLocaleNotifier = ValueNotifier<String>('uz');

// Global notifier to trigger UI updates when project details change
final projectUpdateNotifier = ValueNotifier<int>(0);

Future<void> loadSavedLocale() async {
  final prefs = await SharedPreferences.getInstance();
  final lang = prefs.getString('lang') ?? 'uz';
  // Migrate any old 'en' setting to 'uz'
  final supported = ['uz', 'ru'];
  appLocaleNotifier.value = supported.contains(lang) ? lang : 'uz';
}

Future<void> setLocale(String lang) async {
  appLocaleNotifier.value = lang;
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('lang', lang);
}

// Shorthand translation function
String tr(String key) => _strings[key]?[appLocaleNotifier.value] ?? _strings[key]?['uz'] ?? key;

const _strings = <String, Map<String, String>>{
  // ── Navigation ──────────────────────────────────────────────────────────
  'nav_home':              {'uz': 'Asosiy',             'ru': 'Главная'},
  'nav_projects':          {'uz': 'Obyektlar',           'ru': 'Объекты'},
  'nav_report':            {'uz': 'Hisobot',             'ru': 'Отчёт'},
  'nav_workers':           {'uz': 'Ishchilar',           'ru': 'Люди'},
  'nav_profile':           {'uz': 'Profil',              'ru': 'Профиль'},

  // ── Projects screen ──────────────────────────────────────────────────────
  'all':                   {'uz': 'Barchasi',            'ru': 'Все'},
  'active':                {'uz': 'Faol',                'ru': 'Активные'},
  'paused':                {'uz': "To'xtatilgan",        'ru': 'Приостановлен'},
  'done':                  {'uz': 'Yakunlangan',         'ru': 'Завершено'},
  'projects':              {'uz': 'Loyihalar',           'ru': 'Объекты'},
  'search':                {'uz': 'Qidirish...',         'ru': 'Поиск...'},
  'workers_count':         {'uz': 'ishchi',              'ru': 'раб.'},
  'days_left':             {'uz': 'kun qoldi',           'ru': 'дн. осталось'},
  'days_left_done':        {'uz': 'Tugallangan',         'ru': 'Завершено'},
  'new_project':           {'uz': 'Yangi loyiha',        'ru': 'Новый объект'},
  'project_name':          {'uz': 'Loyiha nomi',         'ru': 'Название'},
  'start_date':            {'uz': 'Boshlanish',          'ru': 'Начало'},
  'duration_days':         {'uz': 'Muddat (kun)',        'ru': 'Срок (дн.)'},
  'location':              {'uz': 'Manzil',              'ru': 'Адрес'},
  'client':                {'uz': 'Mijoz',               'ru': 'Клиент'},
  'create':                {'uz': 'Yaratish',            'ru': 'Создать'},
  'cancel':                {'uz': 'Bekor',               'ru': 'Отмена'},
  'delete':                {'uz': "O'chirish",           'ru': 'Удалить'},
  'save':                  {'uz': 'Saqlash',             'ru': 'Сохранить'},
  'optional':              {'uz': '(ixtiyoriy)',         'ru': '(необяз.)'},
  'edit':                  {'uz': 'Tahrirlash',          'ru': 'Редактировать'},

  // ── Profile ──────────────────────────────────────────────────────────────
  'profile':               {'uz': 'Profil',              'ru': 'Профиль'},
  'edit_profile':          {'uz': 'Profilni tahrirlash', 'ru': 'Редактировать'},
  'full_name':             {'uz': 'Ism Familiya',        'ru': 'Имя Фамилия'},
  'phone':                 {'uz': 'Telefon',             'ru': 'Телефон'},
  'profession':            {'uz': 'Kasb',                'ru': 'Профессия'},
  'experience':            {'uz': 'Tajriba (yil)',       'ru': 'Опыт (лет)'},
  'portfolio':             {'uz': 'Portfolio',           'ru': 'Портфолио'},
  'upload_photo':          {'uz': 'Rasm yuklash',        'ru': 'Загрузить фото'},
  'logout':                {'uz': 'Chiqish',             'ru': 'Выйти'},
  'language':              {'uz': 'Til',                 'ru': 'Язык'},
  'projects_count':        {'uz': 'Loyihalar',           'ru': 'Объекты'},
  'portfolio_add':         {'uz': "Rasm qo'shish",       'ru': 'Добавить фото'},
  'portfolio_empty':       {'uz': "Portfolio bo'sh",     'ru': 'Портфолио пустое'},
  'balance':               {'uz': 'Qoldiq',              'ru': 'Остаток'},
  'workers':               {'uz': 'Ishchilar',           'ru': 'Работники'},

  // ── Auth screen ──────────────────────────────────────────────────────────
  'auth_phone_title':      {'uz': 'Telefon',             'ru': 'Телефон'},
  'auth_verify_title':     {'uz': 'Tasdiqlash',          'ru': 'Подтверждение'},
  'auth_phone_hint':       {'uz': 'Telefon raqamingizni kiriting.', 'ru': 'Введите номер телефона.'},
  'auth_code_sent':        {'uz': 'Kodni +998 {} raqamiga yubordik.', 'ru': 'Код отправлен на +998 {}.'},
  'auth_continue':         {'uz': 'Davom etish',         'ru': 'Продолжить'},
  'auth_verify_btn':       {'uz': 'Tasdiqlash va Kirish →', 'ru': 'Подтвердить и Войти →'},
  'auth_resend':           {'uz': 'Kodni qayta yuborish', 'ru': 'Отправить снова'},
  'auth_resend_timer':     {'uz': 'Kodni qayta yuborish: {}s', 'ru': 'Отправить снова: {}с'},
  'auth_phone_error':      {'uz': "Telefon raqamini to'liq kiriting", 'ru': 'Введите полный номер телефона'},
  'auth_code_error':       {'uz': 'Tasdiqlash kodini kiriting (6 ta raqam)', 'ru': 'Введите код подтверждения (6 цифр)'},
  'auth_code_wrong':       {'uz': 'Tasdiqlash kodi xato', 'ru': 'Неверный код подтверждения'},
  'auth_error_prefix':     {'uz': 'Xatolik: {}',         'ru': 'Ошибка: {}'},

  // ── Profile setup ─────────────────────────────────────────────────────────
  'setup_title':           {'uz': 'Ismingiz',            'ru': 'Ваше имя'},
  'setup_subtitle':        {'uz': 'Iltimos, ism va familiyangizni kiriting.', 'ru': 'Пожалуйста, введите имя и фамилию.'},
  'setup_hint':            {'uz': 'Ism va familiyangiz', 'ru': 'Имя и фамилия'},
  'setup_name_error':      {'uz': 'Ismingizni kiriting', 'ru': 'Введите ваше имя'},
  'setup_save_continue':   {'uz': 'Saqlash va Davom etish', 'ru': 'Сохранить и Продолжить'},
  'session_not_found':     {'uz': 'Sessiya topilmadi',   'ru': 'Сессия не найдена'},

  // ── Notifications screen ─────────────────────────────────────────────────
  'notifications':         {'uz': 'Bildirishnomalar',   'ru': 'Уведомления'},
  'mark_all_read':         {'uz': "O'qilgan qilish",    'ru': 'Отметить все как прочитанные'},
  'notif_empty':           {'uz': "Bildirishnomalar yo'q", 'ru': 'Нет уведомлений'},
  'notif_empty_sub':       {'uz': 'Hozircha sizga hech qanday xabar kelmagan', 'ru': 'Пока вам не пришло ни одного сообщения'},
  'notif_default_title':   {'uz': 'Bildirishnoma',      'ru': 'Уведомление'},
  'error_prefix':          {'uz': 'Xatolik: {}',        'ru': 'Ошибка: {}'},

  // ── Project detail / transactions ─────────────────────────────────────────
  'income':                {'uz': 'Kirim',               'ru': 'Доход'},
  'expense':               {'uz': 'Chiqim',              'ru': 'Расход'},
  'transactions':          {'uz': 'Tranzaksiyalar',      'ru': 'Транзакции'},
  'files':                 {'uz': 'Fayllar',             'ru': 'Файлы'},
  'add_income':            {'uz': "Kirim qo'shish",      'ru': 'Добавить доход'},
  'add_expense':           {'uz': "Chiqim qo'shish",     'ru': 'Добавить расход'},
  'no_transactions':       {'uz': "Tranzaksiyalar yo'q", 'ru': 'Нет транзакций'},
  'no_workers':            {'uz': "Ishchilar yo'q",      'ru': 'Нет работников'},
  'no_files':              {'uz': "Fayllar yo'q",        'ru': 'Нет файлов'},
  'upload_file':           {'uz': 'Fayl yuklash',        'ru': 'Загрузить файл'},
  'add_worker':            {'uz': "Ishchi qo'shish",     'ru': 'Добавить работника'},
  'edit_project':          {'uz': 'Tahrirlash',          'ru': 'Редактировать'},
  'completed':             {'uz': 'Yakunlangan',         'ru': 'Завершено'},
  'progress':              {'uz': 'Bajarilish',          'ru': 'Прогресс'},
  'category':              {'uz': 'Kategoriya',          'ru': 'Категория'},
  'new_category':          {'uz': 'Yangi kategoriya',    'ru': 'Новая категория'},
  'category_name':         {'uz': 'Kategoriya nomi',     'ru': 'Название категории'},
  'delete_category':       {'uz': 'Kategoriyani o\'chirish', 'ru': 'Удалить категорию'},
  'delete_category_q':     {'uz': '"{}" kategoriyasini o\'chirishni xohlaysizmi?', 'ru': 'Удалить категорию "{}"?'},
  'no_workers_in_project': {'uz': 'Bu obyektda ishchilar yo\'q', 'ru': 'В этом объекте нет работников'},
  'select_worker':         {'uz': 'Ishchini tanlang',   'ru': 'Выберите работника'},
  'other':                 {'uz': 'Boshqa',              'ru': 'Другое'},
  'pay':                   {'uz': "To'lash",             'ru': 'Оплатить'},
  'edit_project_title':    {'uz': 'Loyihani tahrirlash', 'ru': 'Редактировать объект'},
  'delete_worker_title':   {'uz': "Ishchini o'chirish",  'ru': 'Удалить работника'},
  'delete_worker_q':       {'uz': '{} jamoadan chiqarilsinmi?', 'ru': 'Удалить {} из команды?'},
  'tx_delete_title':       {'uz': "O'chirilsinmi?",      'ru': 'Удалить?'},
  'tx_delete_body':        {'uz': "Ushbu tranzaksiya o'chiriladi.", 'ru': 'Транзакция будет удалена.'},
  'image_uploaded':        {'uz': 'Rasm yuklandi',       'ru': 'Фото загружено'},
  'worker_added_count':    {'uz': '{} ta ishchi jamoaga qo\'shildi', 'ru': '{} работников добавлено в команду'},
  'select_project_pay':    {'uz': "To'lov uchun loyihani tanlang", 'ru': 'Выберите объект для оплаты'},
  'debt':                  {'uz': 'Qarzdorlik: {} so\'m', 'ru': 'Долг: {} сум'},
  'pay_confirm_title':     {'uz': "{}ga to'lash",        'ru': 'Оплатить {}'},
  'pay_confirm_body':      {'uz': '{} loyihasi uchun {} so\'m berilsinmi?', 'ru': 'Выплатить {} сум по объекту {}?'},
  'pay_yes':               {'uz': 'Ha, berish',          'ru': 'Да, оплатить'},
  'payment_success':       {'uz': "To'lov amalga oshirildi", 'ru': 'Оплата выполнена'},
  'currency_uzs':          {'uz': "so'm (UZS)",          'ru': 'сум (UZS)'},
  'currency_usd':          {'uz': 'Dollar (USD)',         'ru': 'Доллар (USD)'},
  'comment_hint':          {'uz': 'Izoh (ixtiyoriy)',    'ru': 'Комментарий (необяз.)'},
  'note':                  {'uz': 'Izoh',                'ru': 'Комментарий'},
  'amount':                {'uz': 'Summa',               'ru': 'Сумма'},
  'date':                  {'uz': 'Sana',                'ru': 'Дата'},
  'no_comment':            {'uz': 'Izoh yo\'q',          'ru': 'Нет комментария'},
  'tx_info_title':         {'uz': 'Tranzaksiya',         'ru': 'Транзакция'},

  // ── Workers screen ───────────────────────────────────────────────────────
  'all_workers_filter':    {'uz': 'Hammasi',             'ru': 'Все'},
  'debtors_filter':        {'uz': 'Qarzdorlar',          'ru': 'Должники'},
  'no_debt_filter':        {'uz': 'Qarzsizlar',          'ru': 'Без долгов'},
  'add_worker_global':     {'uz': "Ishchi qo'shish",     'ru': 'Добавить работника'},
  'worker_phone':          {'uz': 'Telefon raqami',      'ru': 'Номер телефона'},
  'worker_not_found':      {'uz': 'Ishchi topilmadi',    'ru': 'Работник не найден'},
  'workers_empty':         {'uz': "Ishchilar yo'q",      'ru': 'Нет работников'},
  'workers_empty_sub':     {'uz': "Hali hech qanday ishchi qo'shilmagan", 'ru': 'Работники ещё не добавлены'},
  'total_debt':            {'uz': "Jami qarzdorlik",     'ru': 'Общий долг'},
  'total_paid':            {'uz': "Jami to'langan",      'ru': 'Итого выплачено'},

  // ── Analytics screen ─────────────────────────────────────────────────────
  'analytics':             {'uz': 'Analitika',           'ru': 'Аналитика'},
  'all_projects':          {'uz': 'Barcha loyihalar',    'ru': 'Все объекты'},
  'total_income':          {'uz': 'Jami kirim',          'ru': 'Общий доход'},
  'total_expense':         {'uz': 'Jami chiqim',         'ru': 'Общий расход'},
  'total_balance':         {'uz': 'Umumiy qoldiq',       'ru': 'Общий остаток'},
  'active_projects':       {'uz': 'Faol loyihalar',      'ru': 'Активных объектов'},
  'done_projects':         {'uz': 'Yakunlangan',         'ru': 'Завершено'},
  'expense_by_category':   {'uz': 'Kategoriyalar bo\'yicha chiqim', 'ru': 'Расход по категориям'},
  'no_expenses':           {'uz': "Chiqimlar yo'q",      'ru': 'Нет расходов'},
  'project_stats':         {'uz': 'Loyiha statistikasi', 'ru': 'Статистика объекта'},
  'no_projects_stats':     {'uz': "Loyihalar yo'q",      'ru': 'Нет объектов'},
  'project_income':        {'uz': 'Kirim',               'ru': 'Доход'},
  'project_expense':       {'uz': 'Chiqim',              'ru': 'Расход'},
  'project_balance':       {'uz': 'Qoldiq',              'ru': 'Остаток'},
  'project_transactions':  {'uz': 'Tranzaksiyalar',      'ru': 'Транзакции'},
  'select_project':        {'uz': 'Loyiha tanlang',      'ru': 'Выберите объект'},

  // ── Dashboard screen ─────────────────────────────────────────────────────
  'home':                  {'uz': 'Asosiy',              'ru': 'Главная'},
  'no_active_project':     {'uz': "Faol loyiha yo'q",   'ru': 'Нет активных объектов'},
  'days_remaining':        {'uz': '{} kun qoldi',        'ru': 'Осталось {} дн.'},
  'project_info':          {'uz': "Loyiha ma'lumotlari", 'ru': 'Данные объекта'},
  'no_projects':           {'uz': "Loyiha yo'q",         'ru': 'Нет объектов'},
  'no_projects_sub':       {'uz': "Hali hech qanday loyiha yaratilmagan", 'ru': 'Объекты ещё не созданы'},
  'create_project':        {'uz': 'Yaratish',            'ru': 'Создать'},
  'quick_actions':         {'uz': 'Tezkor amallar',      'ru': 'Быстрые действия'},
  'view_all':              {'uz': 'Barchasi',            'ru': 'Все'},

  // ── Worker detail screen ─────────────────────────────────────────────────
  'worker_detail_title':   {'uz': 'Ishchi ma\'lumotlari', 'ru': 'Данные работника'},
  'worker_projects':       {'uz': 'Loyihalar',           'ru': 'Объекты'},
  'worker_payments':       {'uz': "To'lovlar",           'ru': 'Выплаты'},
  'worker_no_projects':    {'uz': "Hech qanday loyihaga biriktirilmagan", 'ru': 'Не привязан ни к одному объекту'},
  'worker_no_payments':    {'uz': "To'lovlar yo'q",      'ru': 'Нет выплат'},
  'total_earned':          {'uz': 'Jami ishlagan',       'ru': 'Итого заработал'},
  'total_received':        {'uz': 'Jami olgan',          'ru': 'Итого получил'},
  'current_debt':          {'uz': 'Joriy qarzdorlik',    'ru': 'Текущий долг'},
  'worker_kasb':           {'uz': 'Kasb',                'ru': 'Профессия'},
  'salary':                {'uz': 'Ish haqi',             'ru': 'Зарплата'},
  'received':              {'uz': 'Olingan',              'ru': 'Получено'},
  'last_activity':         {'uz': 'Oxirgi faoliyat',     'ru': 'Последняя акт.'},
  'worker_default_role':   {'uz': 'Usta / Ishchi',       'ru': 'Мастер / Рабочий'},
  'xodim_category':        {'uz': 'Xodim',               'ru': 'Рабочий'},

  // ── General / shared ─────────────────────────────────────────────────────
  'confirm_delete':        {'uz': "O'chirilsinmi?",      'ru': 'Удалить?'},
  'no_undo':               {'uz': "Bu amalni qaytarib bo'lmaydi.", 'ru': 'Это действие нельзя отменить.'},
  'yes':                   {'uz': 'Ha',                  'ru': 'Да'},
  'no':                    {'uz': "Yo'q",                'ru': 'Нет'},
  'close':                 {'uz': 'Yopish',              'ru': 'Закрыть'},
  'error':                 {'uz': 'Xato',                'ru': 'Ошибка'},
  'success':               {'uz': 'Muvaffaqiyatli',      'ru': 'Успешно'},
  'loading':               {'uz': 'Yuklanmoqda...',      'ru': 'Загрузка...'},
  'error_short':           {'uz': 'Xato: {}',            'ru': 'Ошибка: {}'},

  // ── Profile dialogs ──────────────────────────────────────────────────────
  'logout_confirm_title':  {'uz': 'Chiqishni tasdiqlang', 'ru': 'Выход'},
  'logout_confirm_body':   {'uz': 'Hisobdan chiqishni xohlaysizmi?', 'ru': 'Вы хотите выйти из аккаунта?'},
  'logout_yes':            {'uz': 'Chiqish',             'ru': 'Выйти'},
  'delete_account':        {'uz': "Hisobni o'chirish",   'ru': 'Удалить аккаунт'},
  'delete_account_title':  {'uz': "Hisobni o'chirishni tasdiqlang", 'ru': 'Подтвердите удаление'},
  'delete_account_body':   {'uz': "Bu amalni qaytarib bo'lmaydi. Barcha ma'lumotlaringiz o'chiriladi.", 'ru': 'Это действие нельзя отменить. Все ваши данные будут удалены.'},
  'delete_account_warn':   {'uz': 'Oxirgi ogohlantirish!', 'ru': 'Последнее предупреждение!'},
  'delete_account_warn2':  {'uz': "Rostdan ham hisobingizni butunlay o'chirmoqchimisiz?", 'ru': 'Вы действительно хотите полностью удалить аккаунт?'},
  'delete_yes':            {'uz': "Ha, o'chirish",       'ru': 'Да, удалить'},
  'no_go_back':            {'uz': "Yo'q, qaytish",       'ru': 'Нет, назад'},
  'admin_panel_sub':       {'uz': "Tizim ma'lumotlarini boshqarish", 'ru': 'Управление данными системы'},

  // ── Security ─────────────────────────────────────────────────────────────
  'forgot_pin':            {'uz': 'PIN-kodni unutdim',   'ru': 'Не помню ПИН-код'},
  'hello_user':            {'uz': 'Salom, {}',           'ru': 'Здравствуйте, {}'},
  'enter_pin':             {'uz': 'PIN-kodni kiriting',  'ru': 'Введите ПИН-код'},
  'create_pin':            {'uz': 'Yangi PIN-kod kiriting', 'ru': 'Введите новый ПИН-код'},
  'confirm_pin':           {'uz': 'PIN-kodni tasdiqlang', 'ru': 'Подтвердите ПИН-код'},
  'pin_no_match':          {'uz': 'PIN-kodlar mos kelmadi', 'ru': 'ПИН-коды не совпадают'},
  'wrong_pin':             {'uz': 'PIN-kod xato',        'ru': 'Неверный ПИН-код'},
  'biometrics_failed':     {'uz': 'Biometriya aniqlanmadi', 'ru': 'Лицо не распознано'},
  'try_again':             {'uz': "Qayta urinib ko'ring", 'ru': 'Повторите'},
  'repeat_biometrics':     {'uz': 'Qayta urinish',       'ru': 'Повторить Face ID'},
  'cancel_btn':            {'uz': 'Bekor qilish',        'ru': 'Отменить'},
  'total_workers':         {'uz': 'Jami ishchi',         'ru': 'Всего рабочих'},
  'update_required':       {'uz': 'Yangilash zarur',     'ru': 'Необходимо обновление'},
  'update_msg':            {'uz': "Ilovani ishlatishni davom ettirish uchun uni eng so'nggi talqinga yangilashingiz lozim. Yangi imkoniyatlar va xavfsizlik yangilanishlaridan foydalaning.", 'ru': 'Чтобы продолжить использование приложения, необходимо обновить его до последней версии. Воспользуйтесь новыми возможностями и обновлениями безопасности.'},
  'current_version':       {'uz': 'Joriy talqin:',       'ru': 'Текущая версия:'},
  'new_version':           {'uz': 'Yangi talqin:',       'ru': 'Новая версия:'},
  'update_btn':            {'uz': 'Yangilash',           'ru': 'Обновить'},
  'pay_advance':           {'uz': 'Avans berish',        'ru': 'Выдать аванс'},
  'advance':               {'uz': 'Avans',               'ru': 'Аванс'},
  'write_salary':          {'uz': 'Ish haqi yozish',     'ru': 'Начислить з/п'},
  'give':                  {'uz': 'Berish',              'ru': 'Выдать'},
  'write':                 {'uz': 'Yozish',              'ru': 'Начислить'},
  'to_whom_give':          {'uz': 'Kimga berilmoqda?',   'ru': 'Кому выдается?'},
  'to_whom_write':         {'uz': 'Kimga yozilmoqda?',   'ru': 'Кому начисляется?'},
  'for_which_project':     {'uz': 'Qaysi obyekt uchun?', 'ru': 'Для какого объекта?'},
  'worker_no_projects_short': {'uz': "Ishchi hech qaysi obyektda yo'q", 'ru': 'Работник не привязан к объектам'},
  'confirm':               {'uz': 'Tasdiqlash',          'ru': 'Подтвердить'},
  'recent_operations':     {'uz': "So'nggi operatsiyalar", 'ru': 'Последние операции'},
  'no_operations':         {'uz': "Operatsiyalar yo'q",  'ru': 'Нет операций'},
  'add_to_team':           {'uz': "Jamoaga qo'shish",    'ru': 'Добавить в команду'},
  'add_new_worker':        {'uz': "Yangi ishchi qo'shish", 'ru': 'Добавить нового рабочего'},
  'profession_hint':       {'uz': 'Kasbi (Masalan: Santexnik, Elektrik)', 'ru': 'Профессия (Напр: Сантехник, Электрик)'},
  'choose_from_existing':  {'uz': 'Mavjud ishchilardan tanlash', 'ru': 'Выбрать из существующих'},
  'add_selected':          {'uz': "Tanlanganlarni qo'shish ({})", 'ru': 'Добавить выбранных ({})'},
  'work_duration':         {'uz': 'Ishlash muddati',     'ru': 'Период работы'},
  'end_date':              {'uz': 'Tugash',              'ru': 'Конец'},
  'select':                {'uz': 'Tanlang',             'ru': 'Выбрать'},
  'back':                  {'uz': 'Orqaga',              'ru': 'Назад'},
  'add':                   {'uz': "Qo'shish",            'ru': 'Добавить'},
  'role_owner':            {'uz': 'Egasi',               'ru': 'Владелец'},
  'role_member':           {'uz': 'Usta',                'ru': 'Мастер'},
  'role_worker':           {'uz': 'Ishchi',              'ru': 'Рабочий'},
  'yakunlandi':            {'uz': 'Yakunlandi',          'ru': 'Завершено'},
  'currency':              {'uz': 'Valyuta',             'ru': 'Валюта'},
  'pin_lock':              {'uz': 'PIN-kod qulflash',    'ru': 'Блокировка ПИН-кодом'},
  'biometrics':            {'uz': 'Face ID / Biometriya', 'ru': 'Face ID / Биометрия'},
  'tagline':               {'uz': 'Qulay boshqaruv. Aniq natija.', 'ru': 'Удобное управление. Точный результат.'},
  'years_suffix':          {'uz': 'yil',                 'ru': 'лет'},
  'experience_label':      {'uz': 'Tajriba',             'ru': 'Опыт'},
  'download_pdf':          {'uz': 'PDF yuklab olish',    'ru': 'Скачать PDF'},
  'report_num':            {'uz': 'MOLIYAVIY HISOBOT №',  'ru': 'ФИНАНСОВЫЙ ОТЧЕТ №'},
  'report_period':         {'uz': 'Hisobot davri',       'ru': 'Период отчета'},
  'owner':                 {'uz': 'Uy egasi',            'ru': 'Владелец'},
  'prorab':                {'uz': 'Prorab',              'ru': 'Прораб'},
  'total_income_desc':     {'uz': "so'm · uy egasidan olingan", 'ru': 'сум · получено от владельца'},
  'total_expense_desc':    {'uz': "so'm · ishchi, material va h.k.", 'ru': 'сум · рабочий, материал и т.д.'},
  'total_balance_desc':    {'uz': "so'm · joriy holat",  'ru': 'сум · текущее состояние'},
  'distribution_by_category': {'uz': "kategoriya bo'yicha", 'ru': 'по категориям'},
  'detailed_operations':   {'uz': 'Batafsil operatsiyalar', 'ru': 'Детальные операции'},
  'records_count':         {'uz': 'ta yozuv',            'ru': 'записей'},
  'date_col':              {'uz': 'SANA',                'ru': 'ДАТА'},
  'desc_col':              {'uz': 'TAVSIF',              'ru': 'ОПИСАНИЕ'},
  'category_col':          {'uz': 'TOIFA',               'ru': 'КАТЕГОРИЯ'},
  'amount_col':            {'uz': 'SUMMA',               'ru': 'СУММА'},
  'balance_col':           {'uz': 'QOLDIQ',              'ru': 'ОСТАТОК'},
  'sum_label':             {'uz': 'Jami',                'ru': 'Итого'},
  'system_note':           {'uz': 'tizim orqali avtomatik shakllantirilgan', 'ru': 'сформировано автоматически через систему'},
  'page_indicator':        {'uz': 'bet',                 'ru': 'стр.'},
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
