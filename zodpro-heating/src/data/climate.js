// Climate database. Values are reference design outdoor temperatures (coldest five-day period,
// probability 0.92) and heating-season parameters. They are editable per project and MUST be
// verified against the active standard (KMK 2.01.01-94 for Uzbekistan, SP 131.13330 for Russia,
// SP RK 2.04-01 for Kazakhstan, etc.). The engine never hard-codes a single value: it always
// reads project.settings.climate, which may be a manual override.

export const CLIMATE_SOURCE_NOTE =
  'Reference values; verify against the project standard (KMK 2.01.01-94 / SP 131.13330 / SP RK 2.04-01) before issuing documents.';

export const CLIMATE = [
  { country: 'UZ', city: 'Toshkent', tOut: -15, heatingDays: 132, tMeanHeating: 2.9 },
  { country: 'UZ', city: 'Samarqand', tOut: -13, heatingDays: 128, tMeanHeating: 3.2 },
  { country: 'UZ', city: 'Buxoro', tOut: -14, heatingDays: 126, tMeanHeating: 3.0 },
  { country: 'UZ', city: 'Andijon', tOut: -17, heatingDays: 128, tMeanHeating: 2.6 },
  { country: 'UZ', city: "Farg'ona", tOut: -15, heatingDays: 127, tMeanHeating: 2.8 },
  { country: 'UZ', city: 'Namangan', tOut: -16, heatingDays: 129, tMeanHeating: 2.5 },
  { country: 'UZ', city: 'Nukus', tOut: -21, heatingDays: 156, tMeanHeating: -0.6 },
  { country: 'UZ', city: 'Urganch', tOut: -18, heatingDays: 148, tMeanHeating: 0.4 },
  { country: 'UZ', city: 'Qarshi', tOut: -12, heatingDays: 116, tMeanHeating: 4.2 },
  { country: 'UZ', city: 'Termiz', tOut: -8, heatingDays: 97, tMeanHeating: 6.0 },
  { country: 'UZ', city: 'Jizzax', tOut: -15, heatingDays: 128, tMeanHeating: 2.9 },
  { country: 'UZ', city: 'Navoiy', tOut: -14, heatingDays: 125, tMeanHeating: 3.1 },
  { country: 'UZ', city: 'Guliston', tOut: -15, heatingDays: 129, tMeanHeating: 2.8 },
  { country: 'UZ', city: 'Nurafshon', tOut: -15, heatingDays: 132, tMeanHeating: 2.9 },
  { country: 'TJ', city: 'Dushanbe', tOut: -12, heatingDays: 116, tMeanHeating: 4.2 },
  { country: 'KZ', city: 'Almaty', tOut: -20, heatingDays: 164, tMeanHeating: -1.3 },
  { country: 'KZ', city: 'Astana', tOut: -31, heatingDays: 209, tMeanHeating: -7.6 },
  { country: 'KG', city: 'Bishkek', tOut: -21, heatingDays: 157, tMeanHeating: -0.9 },
  { country: 'RU', city: 'Moskva', tOut: -25, heatingDays: 205, tMeanHeating: -2.2 },
  { country: 'TR', city: 'Istanbul', tOut: -3, heatingDays: 150, tMeanHeating: 7.5 },
];

// Default indoor design temperatures (°C) and air-change rates (1/h) by room type.
// Values follow common CIS practice (GOST 30494 / SP 60.13330 / KMK 2.04.05) and are editable.
export const ROOM_TYPES = {
  living: { tIn: 20, ach: 1.0, heated: true },
  bedroom: { tIn: 20, ach: 1.0, heated: true },
  kitchen: { tIn: 18, ach: 1.5, heated: true },
  bathroom: { tIn: 25, ach: 1.5, heated: true },
  wc: { tIn: 18, ach: 1.5, heated: true },
  corridor: { tIn: 18, ach: 0.5, heated: true },
  office: { tIn: 20, ach: 1.0, heated: true },
  classroom: { tIn: 18, ach: 2.0, heated: true },
  stair: { tIn: 16, ach: 0.5, heated: true },
  boiler: { tIn: 12, ach: 3.0, heated: false },
  storage: { tIn: 12, ach: 0.3, heated: false },
  garage: { tIn: 5, ach: 0.5, heated: false },
};
