// Project templates: units, rules, calculation defaults (and default views/sheets via the generator).
export const TEMPLATES = {
  uz_heating: { name: 'Uzbekistan Heating (SP-UZ, 75/65)', settings: { standard: 'SP-UZ', country: 'UZ', regime: { ts: 75, tr: 65, name: '75/65/20' }, currency: 'UZS', pipeMaterial: 'PPR', velMax: 0.8, radiatorReserve: 1.1 } },
  private_house: { name: 'Xususiy uy (70/55, PEX)', settings: { regime: { ts: 70, tr: 55, name: '70/55/20' }, pipeMaterial: 'PEX', velMax: 0.7, boilerReserve: 1.15, dhwKw: 24, dhwSimultaneity: 0 } },
  apartment: { name: 'Kvartira (60/50)', settings: { regime: { ts: 60, tr: 50, name: '60/50/20' }, pipeMaterial: 'PEX', velMax: 0.6, internalGainsWm2: 10 } },
  school: { name: 'Maktab (klasslar, 2 ACH)', settings: { regime: { ts: 75, tr: 65, name: '75/65/20' }, pipeMaterial: 'STEEL', velMax: 1.0, maxRPaM: 300, infiltrationAch: 0.5 } },
  office: { name: 'Ofis', settings: { regime: { ts: 70, tr: 55, name: '70/55/20' }, pipeMaterial: 'CU', velMax: 0.8, internalGainsWm2: 5 } },
  boiler_room: { name: 'Qozonxona', settings: { pipeMaterial: 'STEEL', velMax: 1.2, velCritical: 1.8, maxRPaM: 400, staticHeightM: 12, safetyValveBar: 6 } },
  ufh: { name: 'Pol isitish (45/35)', settings: { ufhRegime: { ts: 45, tr: 35 }, ufhMaxLoopM: 100, ufhMaxLoopKpa: 20 } },
};
