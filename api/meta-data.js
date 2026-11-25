// Vercel serverless function: gasto y leads diarios por conjunto de anuncios
// de la campaña de PCH, directo de la Marketing API de Meta.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   META_ACCESS_TOKEN   (obligatoria) token de usuario del sistema con ads_read
//   META_AD_ACCOUNT_ID  (obligatoria) ID de la cuenta publicitaria, con o sin «act_»
//   META_CAMPAIGN_ID    (opcional)    por defecto 120247769379040129 = RO_MX_LEA_PRO_PCH_FORMS
//   META_API_VERSION    (opcional)    por defecto v24.0
//
// Uso: /api/meta-data?since=2026-10-27&until=2026-11-25
// Devuelve una fila por día × conjunto de anuncios. El dashboard filtra por
// periodo en el navegador, así que basta con pedir todo el histórico una vez.

const API_VERSION = process.env.META_API_VERSION || 'v24.0';
const CAMPAIGN_ID = process.env.META_CAMPAIGN_ID || '120247769379040129';

// Leads de formulario instantáneo. Se toma el primero que exista, en este orden,
// para no contar dos veces el mismo lead bajo dos action_type distintos.
const LEAD_ACTION_TYPES = ['onsite_conversion.lead_grouped', 'leadgen_grouped', 'lead'];

function leadsFrom(actions) {
  if (!Array.isArray(actions)) return 0;
  for (const t of LEAD_ACTION_TYPES) {
    const a = actions.find(x => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

const isISODate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN;
  let account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return res.status(500).json({ error: 'config', detail: 'Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID en Vercel' });
  }
  if (!account.startsWith('act_')) account = 'act_' + account;

  const { since, until } = req.query || {};
  if (!isISODate(since) || !isISODate(until)) {
    return res.status(400).json({ error: 'params', detail: 'since y until deben ser YYYY-MM-DD' });
  }

  const params = new URLSearchParams({
    level: 'adset',
    fields: 'date_start,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: CAMPAIGN_ID }]),
    limit: '500',
    access_token: token,
  });

  let url = `https://graph.facebook.com/${API_VERSION}/${account}/insights?${params}`;
  const rows = [];
  try {
    while (url) {
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || j.error) {
        throw new Error(j.error ? `${j.error.type || 'Error'} (${j.error.code}): ${j.error.message}` : `HTTP ${r.status}`);
      }
      for (const d of j.data || []) {
        rows.push({
          date: d.date_start,
          adset_id: d.adset_id,
          adset_name: d.adset_name,
          spend: Number(d.spend) || 0,
          impressions: Number(d.impressions) || 0,
          clicks: Number(d.clicks) || 0,
          leads: leadsFrom(d.actions),
        });
      }
      url = j.paging && j.paging.next ? j.paging.next : null;
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({ since, until, campaign_id: CAMPAIGN_ID, rows });
  } catch (err) {
    res.status(502).json({ error: 'meta_api', detail: err.message });
  }
}
