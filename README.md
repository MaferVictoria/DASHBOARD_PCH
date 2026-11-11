# PCH Capital · Dashboard de Paid Media & Pipeline Comercial

Dashboard estático (un solo `index.html`) + una función serverless de Vercel (`api/data.js`)
que lee los Google Sheets **privados** con una cuenta de servicio. La página nunca recibe
nombres, empresas, puestos, sitios web ni ciudades; correos y teléfonos llegan convertidos
en un código (hash) que solo sirve para detectar duplicados.

```
index.html        ← el dashboard completo (estilos, reglas, gráficas, pestañas)
api/data.js       ← lee los Sheets con la cuenta de servicio y limpia datos personales
package.json      ← dependencia google-auth-library
vercel.json       ← cabeceras (noindex)
.env.example      ← nombres de las variables de entorno (sin valores)
assets/           ← logo
```

## Puesta en marcha (una sola vez)

### 1. Cuenta de servicio de Google
1. En Google Cloud Console crea (o usa) un proyecto y habilita **Google Sheets API**.
2. IAM y administración → Cuentas de servicio → **Crear cuenta de servicio** (sin roles).
3. En la cuenta creada → Claves → Agregar clave → **JSON**. Se descarga un archivo.
   Guárdalo fuera del repositorio; **nunca lo subas a GitHub**.
4. Comparte las dos hojas con el correo de la cuenta de servicio (`...@...iam.gserviceaccount.com`)
   como **Lector**:
   - «PCH - LEADS»
   - «PCH | Dash KPI's Paid»

### 2. GitHub
Sube esta carpeta a un repositorio (puede ser privado).

### 3. Vercel
1. Vercel → Add New → Project → importa el repositorio. Framework: **Other**. Sin build command.
2. Settings → Environment Variables, agrega:

| Variable | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` del JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` del JSON, completo, incluyendo `-----BEGIN PRIVATE KEY-----` |
| `LEADS_SHEET_ID` | `1RVHrcvwVKUFqZADVi5RQmXuRCZompALyAgbnkYpayTM` |
| `SPEND_SHEET_ID` | `1CHoqHd9MOTqrV35brkkiW5_NoXk7Ba18oWw9kTYeZQw` |
| `DASHBOARD_PASSWORD` | *(opcional)* si la defines, la página pide esta contraseña |

3. Deploy. Abre la URL de Vercel.

## Cómo se actualiza
- Cada vez que alguien abre la página se leen los Sheets (con caché de 5 min en Vercel).
- Los leads entran solos a «PCH - LEADS»; la inversión depende de cuándo refresca Dataslayer.

## Problemas comunes
- **«Faltan variables de entorno»**: revisa los nombres exactos en Vercel y vuelve a desplegar.
- **«The caller does not have permission»**: falta compartir una hoja con la cuenta de servicio.
- **«Unable to parse range»**: cambió el nombre de una pestaña; ajústalo en `api/data.js` (`LEAD_TABS`).
- **Error con la clave privada**: pega la clave completa; si Vercel la guardó con `\n` literales,
  el código ya los convierte.

## Privacidad
- El dashboard muestra datos agregados y un detalle de leads sin datos personales.
- Si el repositorio es público, el código queda visible pero **no contiene credenciales**.
- Para restringir quién ve la página: usa `DASHBOARD_PASSWORD` o la protección de despliegues de Vercel.

## Pendientes conocidos
Canal único por ahora: Meta Ads (sin Google Ads). Landing sin fuente; columna de documentación inexistente; definición de
«solicitud ≥ $1M» provisional; umbral de ventas asumido en MXN anuales. Ver «Calidad de datos»
y el diccionario dentro del dashboard.
