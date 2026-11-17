
/**
 * Utility for parsing various coordinate formats (GMS, GDM, DD)
 * and ensuring they are correctly formatted for Mato Grosso region (Lat S, Long W).
 */

export const parseGMS = (input: any): number => {
  if (!input) return NaN;
  
  // Handle object format {g, m, s}
  if (typeof input === 'object') {
    if (!input.g && !input.m && !input.s) return NaN;
    const g = parseFloat(input.g || '0');
    const m = parseFloat(input.m || '0');
    const s = parseFloat(String(input.s || '0').replace(',', '.'));
    const decimal = Math.abs(g) + (Math.abs(m) / 60) + (Math.abs(s) / 3600);
    // Always negative for MT (South/West)
    return -Math.abs(decimal);
  }

  const clean = String(input).trim().replace(',', '.');
  
  // Handle colon format (e.g., -15:30:45 or 10:15:05)
  if (clean.includes(':')) {
    const parts = clean.replace('-', '').split(':');
    if (parts.length >= 2) {
      const g = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parts.length >= 3 ? parseFloat(parts[2]) : 0;
      const decimal = g + (m / 60) + (s / 3600);
      return -Math.abs(decimal); // Always negative for MT
    }
  }
  
  // Handle GMS string format (e.g., 10°15'05,30" or 10°15'05,30" S or 10° 15' 05.30" N)
  const regex = /(\d+)°\s*(\d+)[\'\u2019\s]*\s*([\d.]+)"?\s*([NSEWO])?/i;
  const match = clean.match(regex);
  if (match) {
    const g = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const s = parseFloat(match[3]);
    const decimal = g + (m / 60) + (s / 3600);
    // All dams/records in Mato Grosso are in the Southern and Western hemispheres (S / W)
    return -Math.abs(decimal);
  }

  // Handle Decimal Degrees
  const val = parseFloat(clean);
  if (isNaN(val)) return NaN;
  // Always negative for Mato Grosso / Brazil
  return -Math.abs(val);
};

export const toGMS = (decimal: number, isLat: boolean): string => {
  if (isNaN(decimal)) return '-';
  const absolute = Math.abs(decimal);
  let degrees = Math.floor(absolute);
  let minutesNotTruncated = (absolute - degrees) * 60;
  let minutes = Math.floor(minutesNotTruncated);
  let secondsNotTruncated = (minutesNotTruncated - minutes) * 60;
  if (secondsNotTruncated >= 59.995) {
    secondsNotTruncated = 0;
    minutes += 1;
    if (minutes >= 60) {
      minutes = 0;
      degrees += 1;
    }
  }
  const seconds = secondsNotTruncated.toFixed(2).replace('.', ',');
  
  // In Mato Grosso, Brazil, Latitude is always South ('S') and Longitude is always West ('W')
  const direction = isLat ? (decimal > 0 ? 'N' : 'S') : (decimal > 0 ? 'E' : 'W');
  const finalDirection = (direction === 'N' || direction === 'E') 
    ? (isLat ? 'S' : 'W') 
    : direction;
    
  return `${degrees}° ${minutes}' ${seconds}" ${finalDirection}`;
};

export const parseCoordinate = (input: string, isLat: boolean): number => {
  if (!input) return 0;
  // Normalization: replace comma with dot, remove symbols
  let normalized = input.replace(',', '.').replace(/[°\'"\\s]/g, ' ').trim();
  
  // Remove direction characters if present
  normalized = normalized.replace(/[NSEWO]/ig, '').trim();
  
  const parts = normalized.split(/\s+/).filter(p => p.length > 0);
  let decimal = 0;
  
  if (parts.length === 3) {
    // GMS: Degrees Minutes Seconds
    const d = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    decimal = Math.abs(d) + (m / 60) + (s / 3600);
  } else if (parts.length === 2) {
    // Degrees Decimal Minutes
    const d = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    decimal = Math.abs(d) + (m / 60);
  } else if (parts.length === 1) {
    // Decimal Degrees
    decimal = Math.abs(parseFloat(parts[0]));
  }
  
  if (isNaN(decimal) || decimal === 0) return 0;
  
  // All locations in Mato Grosso are South (negative Lat) and West (negative Long)
  return -Math.abs(decimal);
};
