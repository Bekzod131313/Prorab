// Localisation. All UI strings go through t(key, params). Initial: uz, ru, en.
// Adding a language = adding a dictionary (missing keys fall back to uz, then to the key itself).

const uz = {
  app_sub: 'Isitish BIM',
  tab_project: 'Loyiha', tab_edit: 'Tahrirlash', tab_view: "Ko'rish", tab_systems: 'Tizimlar', tab_calc: 'Hisoblash', tab_docs: 'Chizmalar', tab_export: 'Import/Export', tab_settings: 'Sozlamalar', tab_help: 'Yordam',
  search: 'Qidirish…', undo: 'Bekor qilish', redo: 'Qaytarish',
  // tools
  t_select: 'Tanlash', t_wall: 'Devor', t_door: 'Eshik', t_window: 'Deraza', t_room: 'Xona', t_room_poly: 'Xona (poligon)', t_level: 'Qavat', t_radiator: 'Radiator', t_pipe_s: "Quvur (ta'minot)", t_pipe_r: 'Quvur (qaytish)', t_riser: "Stoyak", t_collector: 'Kollektor', t_ufh_collector: 'Pol isitish kollektori', t_boiler: 'Qozon', t_pump: 'Nasos', t_thermostat: 'Termostat', t_obstacle: "To'siq (balka/kanal)", t_text: 'Matn', t_dim: "O'lcham", t_measure: "O'lchash", t_move: "Ko'chirish", t_copy: 'Nusxa', t_rotate: 'Burish', t_mirror: 'Oyna', t_delete: "O'chirish", t_array: 'Massiv', t_offset: 'Siljitish (offset)', t_trim: 'Kesish (trim)', t_extend: "Uzaytirish", t_split: "Bo'lish",
  t_auto_rad: 'Avto radiator', t_ufh_auto: 'Avto тёплый пол (zona)', t_ufh_pipe: 'Shlanka olish', t_floor_obstacle: 'To‘siq (pol)', t_auto_ufh: 'Avto issiq pol', t_ufh_room: 'Issiq pol', t_auto_route: 'Avto quvur', t_auto_col: 'Avto kollektor', t_calc: 'Qayta hisoblash', t_validate: 'Tekshirish', t_balance: 'Balanslash',
  t_new: 'Yangi', t_open: 'Ochish', t_save: 'Saqlash', t_save_as: 'Boshqacha saqlash', t_demo: 'Namuna loyiha', t_template: 'Shablon', t_revision: 'Reviziya', t_backup: 'Zaxira',
  t_exp_dxf: 'DXF', t_exp_ifc: 'IFC', t_exp_xls: 'Excel', t_exp_csv: 'CSV', t_exp_svg: 'SVG', t_exp_png: 'PNG', t_exp_pdf: 'PDF (chop etish)', t_imp_dxf: 'DXF import', t_imp_img: 'Rasm/PDF podloshka', t_imp_prod: 'Mahsulot import (CSV)', t_imp_zph: '.zph ochish', t_exp_json: '.zph saqlash',
  t_palette: 'Buyruqlar palitrasi', t_theme: 'Mavzu', t_lang: 'Til', t_ai: 'Yordamchi',
  // views
  v_plan: '2D Reja', v_3d: '3D', v_schema: 'Sxema', v_riser: 'Stoyak sxemasi', v_reports: 'Hisobotlar', v_schedules: 'Spetsifikatsiya', v_sheets: 'Varaqlar', v_dashboard: 'Nazorat paneli', v_install: "O'rnatish rejimi", v_issues: 'Muammolar', v_clash: "To'qnashuvlar", v_library: 'Kutubxona',
  // panels
  p_browser: 'Loyiha brauzeri', p_properties: 'Xususiyatlar', p_calc: 'Hisoblash', p_system: 'Tizim', p_library: 'Kutubxona', p_systems: 'Tizimlar', p_views: "Ko'rinishlar",
  general: "Umumiy ma'lumot", calc_results: 'Hisoblash natijalari', system_params: 'Tizim parametrlari', elements: 'Elementlar',
  name: 'Nomi', number: 'Raqami', level: 'Qavat', type: 'Turi', area: 'Maydon', volume: 'Hajm', t_in: 'Ichki harorat', height: 'Balandlik', mark: 'Belgi', model: 'Model', article: 'Artikul', output: 'Quvvat', required: 'Talab', reserve: 'Zaxira', heating: 'Isitish turi', heated: 'Isitiladi', material: 'Material', diameter: 'Diametr', length: 'Uzunlik', flow: 'Sarf', velocity: 'Tezlik', dp: "Bosim yo'qotish", system: 'Tizim', elevation: 'Balandlik belgisi', thickness: 'Qalinlik', exterior: 'Tashqi', assembly: 'Konstruksiya', width: 'Kengligi', sill: 'Deraza tagi', angle: 'Burchak', outlets: 'Chiqishlar', kind: 'Turi', selection: 'Tanlash', auto: 'Avto', manual: "Qo'lda", product: 'Mahsulot', power: 'Quvvat', supply: "Ta'minot", return: 'Qaytish', ufh: 'Pol isitish', mixed: 'Aralash (pol + radiator)', radiator: 'Radiator', none: "Yo'q", custom: 'Maxsus parametrlar',
  heat_loss: "Issiqlik yo'qotish", transmission: "Uzatish (devor/deraza/pol/tom)", ventilation: 'Ventilyatsiya', infiltration: 'Infiltratsiya', total: 'Jami', design_margin: 'Hisobiy zaxira', selected_rad: 'Tanlangan radiator', total_power: 'Umumiy quvvat', coverage: 'Qoplash',
  supply_t: "Ta'minot harorati", return_t: 'Qaytish harorati', pressure_loss: "Bosim yo'qotish", water_flow: 'Suv sarfi',
  // status
  ok: 'OK', warning: 'OGOHLANTIRISH', error: 'XATO', critical: 'KRITIK', no_selection: 'Element tanlanmagan. Rejada element ustiga bosing.', multi_selection: '{n} ta element tanlandi', snap: 'Snap', grid: "To'r", ortho: 'Orto', osnap: 'Obyekt snap',
  cmd_placeholder: 'Buyruq kiriting (masalan: W, RAD, PS, CO, U, ?)…', saved: 'Saqlandi', autosaved: 'Avto-saqlandi', recovered: 'Tiklash', recovery_q: "Oldingi seansdan saqlanmagan loyiha topildi ({time}). Tiklansinmi?",
  calc_ms: 'Hisob: {ms} ms', elements_n: '{n} element',
  // reports
  r_heatloss: "Issiqlik yo'qotish hisoboti", r_radiators: 'Radiatorlar jadvali', r_pipes: 'Quvurlar jadvali', r_hydraulic: 'Gidravlik hisob', r_balancing: 'Balanslash', r_pump: 'Nasos hisoboti', r_boiler: 'Qozon hisoboti', r_expansion: 'Kengaytirish baki', r_ufh: 'Pol isitish', r_bom: 'Material spetsifikatsiyasi', r_cost: 'Smeta', r_validation: 'Tekshiruv natijalari', r_equipment: 'Uskunalar jadvali', r_collectors: 'Kollektorlar jadvali', r_valves: 'Armatura jadvali',
  room: 'Xona', floor: 'Qavat', breakdown: 'Tafsilot', element: 'Element', orientation: 'Yo‘nalish', U: 'U, W/m²K', dT: 'ΔT, K', beta: 'β', Q: 'Q, W', qty: 'Miqdor', unit: "O'lchov", waste: 'Chiqindi', purchase: 'Xarid', price: 'Narx', sum: 'Summa', group: 'Guruh',
  circuit: 'Kontur', setting: "Sozlama", imbalance: 'Nomutanosiblik', operating_point: 'Ishchi nuqta', head: 'Bosim (H)',
  labor: 'Montaj ishi', transport: 'Transport', material_cost: 'Materiallar',
  // messages (engine codes)
  m_room_not_calculated: 'Xona hisoblanmagan: {room}', m_room_no_heating: "{room}: isitish qurilmasi yo'q (kerak {q} W)", m_room_under_heated: '{room}: isitish yetarli emas ({pct}%)', m_radiator_no_product: 'Radiator uchun mos mahsulot topilmadi', m_rad_no_candidate: "Kerakli {required} W uchun radiator topilmadi — turini/balandligini o'zgartiring", m_radiator_not_in_room: 'Radiator hech qaysi xonada emas',
  m_consumer_supply_disconnected: "Ta'minot quvuriga ulanmagan", m_consumer_return_disconnected: 'Qaytish quvuriga ulanmagan', m_pipe_disconnected: 'Quvur tizimga ulanmagan', m_pipe_open_end: 'Quvurning ochiq uchi ({x}; {y})', m_loop_detected: 'Yopiq halqa aniqlandi (hozircha daraxt tarmoq qo‘llab-quvvatlanadi)', m_connector_system_mismatch: 'Konnektor tizimi mos emas ({system})', m_multiple_sources: 'Bir nechta qozon — birinchisi manba sifatida olindi', m_no_source: 'Qozon (manba) yo‘q', m_pipe_zero_loop: 'Quvur boshi va oxiri bir nuqtada', m_riser_bad_level: "Stoyak qavati noto'g'ri",
  m_pipe_velocity_high: 'Tezlik yuqori: {v} m/s > {max} (DN{dn})', m_pipe_velocity_critical: 'Tezlik kritik: {v} m/s > {max}', m_pipe_r_high: "Solishtirma yo'qotish {R} Pa/m > {max}", m_branch_dp_high: "Kontur yo'qotishi {dp} kPa > {max} kPa", m_size_no_valid: '{material}: shartlarga mos diametr yo‘q', m_velocity_low: 'Tezlik past: {v} m/s < {min}', m_balance_unreachable: 'Balanslab bo‘lmadi: sarf og‘ishi {pct}%',
  m_pump_missing: "Nasos tanlanmadi (Q={q} m³/h, H={h} m)", m_pump_inadequate: '{model} yetarli emas (H={h} m)', m_pump_not_placed: 'Qozonda ichki nasos yo‘q — {model} nasosini joylashtiring', m_boiler_missing: 'Qozon joylashtirilmagan', m_boiler_none: 'Katalogda {kw} kVt qozon yo‘q', m_boiler_undersized: 'Qozon {kw} kVt < talab {req} kVt',
  m_collector_ports: 'Kollektor chiqishlari yetarli emas ({used} > {max})', m_collector_flow: 'Kollektor sarfi {q} > {max} m³/h', m_ufh_insufficient: 'Pol isitish yetmaydi: {q} W/m² > {cap}', m_ufh_surface_high: 'Pol yuzasi {t}°C > {max}°C', m_ufh_loop_long: 'Kontur uzun: {L} m > {max} m', m_ufh_loops_increased: "Bosim uchun konturlar {from} → {to}", m_ufh_no_collector: '{room}: pol isitish kollektoriga biriktirilmagan',
  m_ufh_zone_invalid: '{name}: tyopliy pol zonasi yaroqsiz — {n} ta xato ({first})', m_ufh_zone_stale: '{name}: zona o‘zgardi — REGENERATE qiling', m_ufh_loop_dp: '{name}: kontur bosim yo‘qotishi {dp} kPa > {max} kPa',
  m_equipment_clearance: '{mark}: xizmat ko‘rsatish zonasi (0.6 m) band', m_clash: "To'qnashuv {id}: {kind}", m_integrity: "Ma'lumot yaxlitligi: {code}", m_exp_pressure_invalid: 'Kengaytirish baki: p0={p0} ≥ pe={pe}', m_exp_none: 'Katalogda {v} l bak yo‘q', m_missing_assembly: 'Konstruksiya topilmadi: {assembly}', m_missing_opening_type: 'Deraza/eshik turi topilmadi',
  m_route_no_collector: 'Qavatda kollektor yo‘q', m_route_no_boiler: 'Qozon yo‘q', m_route_collector_full: 'Kollektor to‘ldi (12)',
  // misc
  help_intro: "ZODPRO Heating BIM — faqat isitish tizimlarini loyihalash uchun BIM/CAD platforma. Ish tartibi: devor → xona → deraza → avto radiator → kollektor/qozon → avto quvur → hisob → spetsifikatsiya → eksport.",
  confirm_new: 'Yangi loyiha yaratilsinmi? Saqlanmagan o‘zgarishlar yo‘qoladi.',
  dashboard_title: 'Loyiha holati', all_ok: 'Barcha tekshiruvlar muvaffaqiyatli',
};

const ru = {
  app_sub: 'Отопление BIM',
  tab_project: 'Проект', tab_edit: 'Правка', tab_view: 'Вид', tab_systems: 'Системы', tab_calc: 'Расчёт', tab_docs: 'Чертежи', tab_export: 'Импорт/Экспорт', tab_settings: 'Настройки', tab_help: 'Справка',
  search: 'Поиск…', undo: 'Отменить', redo: 'Повторить',
  t_select: 'Выбор', t_wall: 'Стена', t_door: 'Дверь', t_window: 'Окно', t_room: 'Помещение', t_room_poly: 'Помещение (полигон)', t_level: 'Этаж', t_radiator: 'Радиатор', t_pipe_s: 'Труба (подача)', t_pipe_r: 'Труба (обратка)', t_riser: 'Стояк', t_collector: 'Коллектор', t_ufh_collector: 'Коллектор ТП', t_boiler: 'Котёл', t_pump: 'Насос', t_thermostat: 'Термостат', t_obstacle: 'Препятствие', t_text: 'Текст', t_dim: 'Размер', t_measure: 'Измерить', t_move: 'Переместить', t_copy: 'Копировать', t_rotate: 'Повернуть', t_mirror: 'Зеркало', t_delete: 'Удалить', t_array: 'Массив', t_offset: 'Смещение', t_trim: 'Обрезать', t_extend: 'Удлинить', t_split: 'Разделить',
  t_auto_rad: 'Авто радиаторы', t_ufh_auto: 'Авто тёплый пол (зона)', t_ufh_pipe: 'Отвод шланга', t_floor_obstacle: 'Препятствие (пол)', t_auto_ufh: 'Авто тёплый пол', t_ufh_room: 'Тёплый пол', t_auto_route: 'Авто трассировка', t_auto_col: 'Авто коллектор', t_calc: 'Пересчитать', t_validate: 'Проверка', t_balance: 'Балансировка',
  t_new: 'Новый', t_open: 'Открыть', t_save: 'Сохранить', t_save_as: 'Сохранить как', t_demo: 'Пример', t_template: 'Шаблон', t_revision: 'Ревизия', t_backup: 'Резерв',
  t_imp_dxf: 'Импорт DXF', t_imp_img: 'Подложка (изобр./PDF)', t_imp_prod: 'Импорт продукции (CSV)', t_exp_pdf: 'PDF (печать)',
  t_palette: 'Палитра команд', t_theme: 'Тема', t_lang: 'Язык', t_ai: 'Ассистент',
  v_plan: '2D План', v_3d: '3D', v_schema: 'Схема', v_riser: 'Схема стояков', v_reports: 'Отчёты', v_schedules: 'Спецификация', v_sheets: 'Листы', v_dashboard: 'Панель контроля', v_install: 'Монтаж', v_issues: 'Замечания', v_clash: 'Коллизии', v_library: 'Библиотека',
  p_browser: 'Диспетчер проекта', p_properties: 'Свойства', p_calc: 'Расчёт', p_system: 'Система', general: 'Общие данные', calc_results: 'Результаты расчёта', system_params: 'Параметры системы', elements: 'Элементы',
  name: 'Имя', number: 'Номер', level: 'Этаж', type: 'Тип', area: 'Площадь', volume: 'Объём', t_in: 'Внутр. темп.', height: 'Высота', mark: 'Марка', model: 'Модель', article: 'Артикул', output: 'Мощность', required: 'Требуется', reserve: 'Запас', heating: 'Отопление', heated: 'Отапливаемое', material: 'Материал', diameter: 'Диаметр', length: 'Длина', flow: 'Расход', velocity: 'Скорость', dp: 'Потери давления', system: 'Система', elevation: 'Отметка', thickness: 'Толщина', exterior: 'Наружная', assembly: 'Конструкция', width: 'Ширина', sill: 'Подоконник', angle: 'Угол', outlets: 'Выходы', kind: 'Вид', selection: 'Подбор', auto: 'Авто', manual: 'Вручную', product: 'Изделие', power: 'Мощность', supply: 'Подача', return: 'Обратка', ufh: 'Тёплый пол', mixed: 'Смешанное', radiator: 'Радиатор', none: 'Нет', custom: 'Польз. параметры',
  heat_loss: 'Теплопотери', transmission: 'Трансмиссия', ventilation: 'Вентиляция', infiltration: 'Инфильтрация', total: 'Итого', design_margin: 'Запас', selected_rad: 'Выбранный радиатор', total_power: 'Общая мощность', coverage: 'Покрытие',
  supply_t: 'Темп. подачи', return_t: 'Темп. обратки', pressure_loss: 'Потери давления', water_flow: 'Расход воды',
  ok: 'OK', warning: 'ПРЕДУПР.', error: 'ОШИБКА', critical: 'КРИТИЧНО', no_selection: 'Ничего не выбрано.', multi_selection: 'Выбрано: {n}', cmd_placeholder: 'Команда (W, RAD, PS, CO, U, ?)…',
  r_heatloss: 'Теплопотери', r_radiators: 'Ведомость радиаторов', r_pipes: 'Ведомость труб', r_hydraulic: 'Гидравлический расчёт', r_balancing: 'Балансировка', r_pump: 'Насос', r_boiler: 'Котёл', r_expansion: 'Расширительный бак', r_ufh: 'Тёплый пол', r_bom: 'Спецификация материалов', r_cost: 'Смета', r_validation: 'Проверка', r_equipment: 'Оборудование', r_collectors: 'Коллекторы', r_valves: 'Арматура',
  help_intro: 'ZODPRO Heating BIM — BIM/CAD платформа только для проектирования отопления.', confirm_new: 'Создать новый проект? Несохранённые изменения будут потеряны.', dashboard_title: 'Состояние проекта', all_ok: 'Все проверки пройдены',
  m_room_no_heating: '{room}: нет отопительного прибора ({q} Вт)', m_room_under_heated: '{room}: недостаточно ({pct}%)', m_pipe_velocity_high: 'Скорость {v} м/с > {max} (DN{dn})', m_boiler_missing: 'Котёл не размещён', m_pump_missing: 'Насос не подобран (Q={q}, H={h})',
  m_ufh_zone_invalid: '{name}: зона тёплого пола недействительна — ошибок {n} ({first})', m_ufh_zone_stale: '{name}: зона изменена — выполните REGENERATE', m_ufh_loop_dp: '{name}: потери давления в петле {dp} кПа > {max} кПа',
};

const en = {
  app_sub: 'Heating BIM',
  tab_project: 'Project', tab_edit: 'Edit', tab_view: 'View', tab_systems: 'Systems', tab_calc: 'Calculate', tab_docs: 'Drawings', tab_export: 'Import/Export', tab_settings: 'Settings', tab_help: 'Help',
  search: 'Search…', undo: 'Undo', redo: 'Redo',
  t_select: 'Select', t_wall: 'Wall', t_door: 'Door', t_window: 'Window', t_room: 'Room', t_room_poly: 'Room (polygon)', t_level: 'Level', t_radiator: 'Radiator', t_pipe_s: 'Pipe (supply)', t_pipe_r: 'Pipe (return)', t_riser: 'Riser', t_collector: 'Manifold', t_ufh_collector: 'UFH manifold', t_boiler: 'Boiler', t_pump: 'Pump', t_thermostat: 'Thermostat', t_obstacle: 'Obstacle', t_text: 'Text', t_dim: 'Dimension', t_measure: 'Measure', t_move: 'Move', t_copy: 'Copy', t_rotate: 'Rotate', t_mirror: 'Mirror', t_delete: 'Delete', t_array: 'Array', t_offset: 'Offset', t_trim: 'Trim', t_extend: 'Extend', t_split: 'Split',
  t_auto_rad: 'Auto radiators', t_ufh_auto: 'Auto UFH (zone)', t_ufh_pipe: 'Draw UFH pipe', t_floor_obstacle: 'Floor obstacle', t_auto_ufh: 'Auto UFH', t_ufh_room: 'Underfloor heating', t_auto_route: 'Auto routing', t_auto_col: 'Auto manifold', t_calc: 'Recalculate', t_validate: 'Validate', t_balance: 'Balancing',
  t_new: 'New', t_open: 'Open', t_save: 'Save', t_save_as: 'Save as', t_demo: 'Sample project', t_template: 'Template', t_revision: 'Revision', t_backup: 'Backup',
  t_imp_dxf: 'Import DXF', t_imp_img: 'Underlay (image/PDF)', t_imp_prod: 'Import products (CSV)', t_exp_pdf: 'PDF (print)',
  t_palette: 'Command palette', t_theme: 'Theme', t_lang: 'Language', t_ai: 'Assistant',
  v_plan: '2D Plan', v_3d: '3D', v_schema: 'Schematic', v_riser: 'Riser diagram', v_reports: 'Reports', v_schedules: 'Schedules', v_sheets: 'Sheets', v_dashboard: 'Dashboard', v_install: 'Installation', v_issues: 'Issues', v_clash: 'Clashes', v_library: 'Library',
  p_browser: 'Project browser', p_properties: 'Properties', p_calc: 'Calculation', p_system: 'System', general: 'General', calc_results: 'Calculation results', system_params: 'System parameters', elements: 'Elements',
  name: 'Name', number: 'Number', level: 'Level', type: 'Type', area: 'Area', volume: 'Volume', t_in: 'Indoor temp.', height: 'Height', mark: 'Mark', model: 'Model', article: 'Article', output: 'Output', required: 'Required', reserve: 'Reserve', heating: 'Heating', heated: 'Heated', material: 'Material', diameter: 'Diameter', length: 'Length', flow: 'Flow', velocity: 'Velocity', dp: 'Pressure loss', system: 'System', elevation: 'Elevation', thickness: 'Thickness', exterior: 'Exterior', assembly: 'Assembly', width: 'Width', sill: 'Sill', angle: 'Angle', outlets: 'Outlets', kind: 'Kind', selection: 'Selection', auto: 'Auto', manual: 'Manual', product: 'Product', power: 'Power', supply: 'Supply', return: 'Return', ufh: 'Underfloor', mixed: 'Mixed', radiator: 'Radiator', none: 'None', custom: 'Custom parameters',
  heat_loss: 'Heat loss', transmission: 'Transmission', ventilation: 'Ventilation', infiltration: 'Infiltration', total: 'Total', design_margin: 'Design margin', selected_rad: 'Selected radiator', total_power: 'Total output', coverage: 'Coverage',
  supply_t: 'Supply temperature', return_t: 'Return temperature', pressure_loss: 'Pressure loss', water_flow: 'Water flow',
  ok: 'OK', warning: 'WARNING', error: 'ERROR', critical: 'CRITICAL', no_selection: 'Nothing selected. Click an element in the plan.', multi_selection: '{n} elements selected', cmd_placeholder: 'Type a command (W, RAD, PS, CO, U, ?)…',
  r_heatloss: 'Heat loss report', r_radiators: 'Radiator schedule', r_pipes: 'Pipe schedule', r_hydraulic: 'Hydraulic calculation', r_balancing: 'Balancing', r_pump: 'Pump report', r_boiler: 'Boiler report', r_expansion: 'Expansion vessel', r_ufh: 'Underfloor heating', r_bom: 'Material takeoff', r_cost: 'Cost estimate', r_validation: 'Validation', r_equipment: 'Equipment schedule', r_collectors: 'Manifold schedule', r_valves: 'Valve schedule',
  help_intro: 'ZODPRO Heating BIM — a BIM/CAD platform dedicated to heating design.', confirm_new: 'Create a new project? Unsaved changes will be lost.', dashboard_title: 'Project status', all_ok: 'All checks passed',
  m_room_no_heating: '{room}: no emitter (needs {q} W)', m_room_under_heated: '{room}: under-heated ({pct}%)', m_pipe_velocity_high: 'Velocity {v} m/s > {max} (DN{dn})', m_boiler_missing: 'No boiler placed', m_pump_missing: 'No pump found (Q={q}, H={h})',
  m_ufh_zone_invalid: '{name}: UFH zone invalid — {n} errors ({first})', m_ufh_zone_stale: '{name}: zone changed — REGENERATE', m_ufh_loop_dp: '{name}: loop pressure loss {dp} kPa > {max} kPa',
};

export const LANGS = { uz, ru, en };
export const LANG_NAMES = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
let current = 'uz';
try {
  current = localStorage.getItem('zodpro.lang') || 'uz';
} catch {
  /* no storage */
}

export function setLang(l) {
  if (!LANGS[l]) return;
  current = l;
  try {
    localStorage.setItem('zodpro.lang', l);
  } catch {
    /* no storage */
  }
}
export const getLang = () => current;

export function t(key, params) {
  let s = LANGS[current]?.[key] ?? uz[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Translate an engine message code ({code, params}). */
export function msg(code, params) {
  const k = `m_${code}`;
  const s = t(k, params);
  return s === k ? `${code}${params ? ' ' + JSON.stringify(params) : ''}` : s;
}
