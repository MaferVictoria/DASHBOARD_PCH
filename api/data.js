// Vercel Serverless Function: lee los Sheets privados con una cuenta de servicio de Google
// y devuelve los valores con los datos personales eliminados o convertidos en hash.
const crypto = require('crypto');
const { JWT } = require('google-auth-library');

const LEAD_TABS = {
  leads_ce1: 'CREDITO EMPRESARIAL 1',
  leads_ce2: 'CREDITO EMPRESARIAL 2',
  leads_fa1: 'FACTORAJE 1',
  leads_fa2: 'FACTORAJE 2',
  leads_ar1: 'ARRENDAMIENTO 1',
  leads_ar2: 'ARRENDAMIENTO 2'
};
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

async function batchGet(client, id, ranges) {
  const qs = ranges.map((r) => 'ranges=' + encodeURIComponent(r)).join('&');
  const res = await client.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${qs}&majorDimension=ROWS` });
  return res.data.valueRanges || [];
}

module.exports = async (req, res) => {
  try {
    const pass = process.env.DASHBOARD_PASSWORD;
    if (pass && req.headers['x-dashboard-key'] !== pass) return res.status(401).json({ error: 'unauthorized' });

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const leadsId = process.env.LEADS_SHEET_ID;
    const spendId = process.env.SPEND_SHEET_ID;
    if (!email || !key || !leadsId || !spendId) return res.status(500).json({ error: 'config', detail: 'Faltan variables de entorno en Vercel.' });

    const client = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const ids = Object.keys(LEAD_TABS);
    const [leads, spend] = await Promise.all([
      batchGet(client, leadsId, ids.map((k) => `'${LEAD_TABS[k]}'!A1:AD5000`)),
      batchGet(client, spendId, ['Query_MetaAds_2026!A1:W5000', 'DataslayerQueries!A1:O20'])
    ]);
    const out = {};
    ids.forEach((k, i) => { out[k] = { values: scrub((leads[i] || {}).values) }; });
    out.meta_spend = { values: (spend[0] || {}).values || [] };
    out.ds_status = { values: (spend[1] || {}).values || [] };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(out);
  } catch (err) {
    const detail = err && err.response && err.response.data && err.response.data.error ? err.response.data.error.message : String(err && err.message || err);
    return res.status(502).json({ error: 'sheets', detail });
  }
};
