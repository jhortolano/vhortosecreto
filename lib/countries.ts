export type Country = {
  code: string;
  flag: string;
  name: string;
  dial: string;
};

export const countries: Country[] = [
  { code: 'ES', flag: '🇪🇸', name: 'España', dial: '+34' },
  { code: 'MX', flag: '🇲🇽', name: 'México', dial: '+52' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina', dial: '+54' },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia', dial: '+57' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile', dial: '+56' },
  { code: 'PE', flag: '🇵🇪', name: 'Perú', dial: '+51' },
  { code: 'EC', flag: '🇪🇨', name: 'Ecuador', dial: '+593' },
  { code: 'VE', flag: '🇻🇪', name: 'Venezuela', dial: '+58' },
  { code: 'GT', flag: '🇬🇹', name: 'Guatemala', dial: '+502' },
  { code: 'CU', flag: '🇨🇺', name: 'Cuba', dial: '+53' },
  { code: 'BO', flag: '🇧🇴', name: 'Bolivia', dial: '+591' },
  { code: 'DO', flag: '🇩🇴', name: 'República Dominicana', dial: '+1' },
  { code: 'HN', flag: '🇭🇳', name: 'Honduras', dial: '+504' },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguay', dial: '+595' },
  { code: 'SV', flag: '🇸🇻', name: 'El Salvador', dial: '+503' },
  { code: 'NI', flag: '🇳🇮', name: 'Nicaragua', dial: '+505' },
  { code: 'CR', flag: '🇨🇷', name: 'Costa Rica', dial: '+506' },
  { code: 'PA', flag: '🇵🇦', name: 'Panamá', dial: '+507' },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguay', dial: '+598' },
  { code: 'PR', flag: '🇵🇷', name: 'Puerto Rico', dial: '+1' },
  { code: 'US', flag: '🇺🇸', name: 'Estados Unidos', dial: '+1' },
  { code: 'GB', flag: '🇬🇧', name: 'Reino Unido', dial: '+44' },
  { code: 'FR', flag: '🇫🇷', name: 'Francia', dial: '+33' },
  { code: 'DE', flag: '🇩🇪', name: 'Alemania', dial: '+49' },
  { code: 'IT', flag: '🇮🇹', name: 'Italia', dial: '+39' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal', dial: '+351' },
  { code: 'RU', flag: '🇷🇺', name: 'Rusia', dial: '+7' },
  { code: 'CN', flag: '🇨🇳', name: 'China', dial: '+86' },
  { code: 'JP', flag: '🇯🇵', name: 'Japón', dial: '+81' },
  { code: 'IN', flag: '🇮🇳', name: 'India', dial: '+91' },
  { code: 'BR', flag: '🇧🇷', name: 'Brasil', dial: '+55' },
  { code: 'CA', flag: '🇨🇦', name: 'Canadá', dial: '+1' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia', dial: '+61' },
];

export function findCountryByDial(dial: string): Country | undefined {
  return countries.find((c) => dial.startsWith(c.dial));
}
