// Vercel serverless function: lee las 6 pestañas de leads del Sheet «PCH - LEADS»
// y las devuelve como JSON (texto crudo, sin inferencia de tipos).
//
// Por qué no gviz directo desde el navegador: gviz infiere el tipo de cada
// columna por mayoría y devuelve null en las celdas del tipo minoritario
// (p. ej. «3 millones» en una columna donde la mayoría son números).
// El export CSV por gid devuelve el texto tal cual, sin perder celdas.
//
// Requisito: el Sheet compartido como «Cualquier persona con el enlace: lector».
// Variables opcionales: SHEET_ID (si algún día cambia el archivo).

const SHEET_ID = process.env.SHEET_ID || '1RVHrcvwVKUFqZADVi5RQmXuRCZompALyAgbnkYpayTM';

// Pestaña → gid. Si renombras o recreas una pestaña, actualiza el gid aquí
// (es el número que aparece en la URL como #gid=...).
const TABS = {
  'ARRENDAMIENTO 1':       { gid: 948318391,  servicio: 'ARRENDAMIENTO' },
  'ARRENDAMIENTO 2':       { gid: 1407297549, servicio: 'ARRENDAMIENTO' },
  'FACTORAJE 1':           { gid: 1964596160, servicio: 'FACTORAJE' },
  'FACTORAJE 2':           { gid: 2014488356, servicio: 'FACTORAJE' },
  'CREDITO EMPRESARIAL 1': { gid: 324722007,  servicio: 'CREDITO' },
  'CREDITO EMPRESARIAL 2': { gid: 1268714172, servicio: 'CREDITO' },
};

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchTab(name, { gid, servicio }) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Pestaña «${name}» (gid ${gid}): HTTP ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`Pestaña «${name}»: el Sheet no es público por enlace`);
  const all = parseCSV(text);
  return { tab: name, servicio, header: all[0] || [], rows: all.slice(1) };
}

export default async function handler(req, res) {
  try {
    const tabs = await Promise.all(Object.entries(TABS).map(([n, cfg]) => fetchTab(n, cfg)));
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ fetchedAt: new Date().toISOString(), tabs });
  } catch (err) {
    res.status(500).json({ error: 'sheet_error', detail: err.message });
  }
}
