// Vercel Serverless Function
// - Lee los leads del Google Sheet abierto por enlace (desde el servidor) y quita datos personales.
// - Lee la inversión y los leads de Meta Ads directo de la Marketing API con un token de acceso.
const crypto = require('crypto');

// Columnas que nunca salen del servidor.
const DROP = [/^full_name$/, /^company_name$/, /^job_title$/, /^city$/, /sitio_web/];

const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const hashHex = (s) => crypto.createHash('sha256').update('pch|' + s).digest('hex').slice(0, 24);
const hashDigits = (s) => (BigInt('0x' + crypto.createHash('sha256').update('pch|tel|' + s).digest('hex').slice(0, 15)) % 10000000000n).toString().padStart(10, '0');

function scrub(values) {
  if (!values || !values.length) return values || [];
  const head = values[0].map((h) => norm(h));
  const iEmail = head.indexOf('email');
  const iTel = head.indexOf('phone_number');
  const drop = head.map((h, i) => (DROP.some((re) => re.test(h)) ? i : -1)).filter((i) => i >= 0);
  return values.map((row, n) => {
    if (n === 0) return row;
    const r = row.slice();
    if (iEmail >= 0 && r[iEmail]) { const e = norm(r[iEmail]); r[iEmail] = e === 'test@meta.com' ? e : hashHex(e); }
    if (iTel >= 0 && r[iTel]) { const t = String(r[iTel]); r[iTel] = /test lead/i.test(t) ? t : hashDigits(t.replace(/\D/g, '').slice(-10)); }
    drop.forEach((i) => { if (i < r.length) r[i] = ''; });
    return r;
  });
}

// Pestañas de leads y su gid (el número que aparece en la URL como #gid=...).
// Si crean o renombran una pestaña, agréguenla aquí con su gid.
const LEAD_GIDS = {
  leads_ce1: '324722007',   // CREDITO EMPRESARIAL 1
  leads_ce2: '1268714172',  // CREDITO EMPRESARIAL 2
  leads_fa1: '1964596160',  // FACTORAJE 1
  leads_fa2: '2014488356',  // FACTORAJE 2
  leads_ar1: '948318391',   // ARRENDAMIENTO 1
  leads_ar2: '1407297549'   // ARRENDAMIENTO 2
};

// CSV (RFC 4180): comillas, comas y saltos de línea dentro de comillas.
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Lee el Sheet publicado como «Cualquier persona con el enlace puede ver», desde el servidor.
async function getLeads() {
  const id = process.env.LEADS_SHEET_ID;
  if (!id) throw cfg('Falta LEADS_SHEET_ID.');
  const ids = Object.keys(LEAD_GIDS);
  const tabs = await Promise.all(ids.map(async (k) => {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${LEAD_GIDS[k]}`, { redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.includes('text/csv')) {
      const e = new Error(r.status === 404 ? 'No se encontró el Sheet o una pestaña (revisa LEADS_SHEET_ID y los gid).' : 'El Sheet no está abierto: compártelo como «Cualquier persona con el enlace puede ver».');
      e.source = 'sheets'; throw e;
    }
    return parseCSV(await r.text());
  }));
  const out = {};
  ids.forEach((k, i) => { out[k] = { values: scrub(tabs[i]) }; });
  return out;
}

// Meta Marketing API: insights por anuncio y día del año en curso para la campaña de formularios.
async function getMeta() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw cfg('Falta META_ACCESS_TOKEN.');
  const account = (process.env.META_AD_ACCOUNT_ID || '1018952286067785').replace(/^act_/, '');
  const campaign = process.env.META_CAMPAIGN_ID || '120247769379040129';
  const version = process.env.META_API_VERSION || 'v23.0';
  const params = new URLSearchParams({
    level: 'ad',
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_name,spend,actions',
    time_increment: '1',
    date_preset: 'this_year',
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [campaign] }]),
    limit: '500',
    access_token: token
  });
  if (process.env.META_APP_SECRET) {
    params.set('appsecret_proof', crypto.createHmac('sha256', process.env.META_APP_SECRET).update(token).digest('hex'));
  }
  let url = `https://graph.facebook.com/${version}/act_${account}/insights?${params}`;
  const rows = [];
  for (let page = 0; url && page < 50; page++) {
    const r = await fetch(url);
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) {
      const e = new Error((body.error && body.error.message) || `Meta respondió ${r.status}`);
      e.source = 'meta'; throw e;
    }
    (body.data || []).forEach((d) => {
      const lead = (d.actions || []).find((a) => a.action_type === 'lead');
      rows.push({
        date_start: d.date_start,
        id: d.ad_id, name: d.ad_name,
        adset_id: d.adset_id, adset_name: d.adset_name,
        campaign_name: d.campaign_name,
        amount_spent: { value: d.spend || '0', unit: 'MXN' },
        lead: lead ? lead.value : null
      });
    });
    url = body.paging && body.paging.next ? body.paging.next : null;
  }
  return { ad_entities: JSON.stringify(rows) };
}

function cfg(msg) { const e = new Error(msg); e.source = 'config'; return e; }

module.exports = async (req, res) => {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (pass && req.headers['x-dashboard-key'] !== pass) return res.status(401).json({ error: 'unauthorized' });
  try {
    const [leads, meta] = await Promise.all([getLeads(), getMeta()]);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ ...leads, meta_spend: meta });
  } catch (err) {
    const detail = err.source === 'meta' ? 'Meta Ads: ' + err.message : (err.source === 'sheets' ? 'Google Sheets: ' + err.message : String(err && err.message || err));
    return res.status(err.source === 'config' ? 500 : 502).json({ error: err.source || 'error', detail });
  }
};
