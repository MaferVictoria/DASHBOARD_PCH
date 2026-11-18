# PCH Capital · Dashboard de Paid Media & Pipeline Comercial

Dashboard estático (`index.html`) + una función serverless de Vercel (`api/data.js`) que:

- lee los **leads** del Google Sheet «PCH - LEADS», compartido como «Cualquier persona con el enlace puede ver»
  (la lectura ocurre en el servidor; el ID del Sheet no aparece en la página);
- lee la **inversión y los leads reportados por Meta** directo de la Marketing API, con un token de acceso.

La página nunca recibe nombres, empresas, puestos, sitios web ni ciudades; correos y teléfonos
llegan convertidos en un código (hash) que solo sirve para detectar duplicados. El token de Meta
vive solo en las variables de entorno de Vercel.

> ⚠️ Con el Sheet abierto, cualquier persona que tenga su enlace puede ver todos los datos de los
> prospectos. Compartan el enlace lo menos posible y, si pueden, usen una copia sin nombre, correo ni teléfono.

```
index.html        ← el dashboard (estilos, reglas del funnel, gráficas, pestañas)
api/data.js       ← lee Sheets + Meta Ads y limpia datos personales
package.json      ← sin dependencias externas
vercel.json       ← cabeceras (noindex)
.env.example      ← nombres de las variables de entorno (sin valores)
assets/           ← logo
```

## Puesta en marcha (una sola vez)

### 1. Google Sheets (leads)
1. Abre «PCH - LEADS» → **Compartir** → Acceso general → **Cualquier persona con el enlace** → rol **Lector**.
2. Las pestañas se leen por su `gid` (el número de la URL `#gid=...`), ya configurado en `LEAD_GIDS`
   dentro de `api/data.js`. Si crean una pestaña nueva, agrégala ahí con su gid.

### 2. Meta Ads (inversión)
Lo más estable es un **token de usuario del sistema** (no caduca como los tokens personales):

1. Business Manager de PCH Capital → Configuración del negocio → Usuarios → **Usuarios del sistema** → Agregar
   (rol Empleado basta).
2. En ese usuario del sistema: **Asignar activos** → Cuentas publicitarias → `pchcapital` → permiso de **ver rendimiento**.
3. Necesitas una app de Meta (developers.facebook.com → Crear app → tipo *Empresa*) vinculada al mismo Business.
4. En el usuario del sistema: **Generar token** → elige la app → permisos **`ads_read`** (y `read_insights`) →
   caducidad **Nunca**. Copia el token **una sola vez directo a Vercel**; no lo pegues en chats ni en el código.
5. Opcional pero recomendado: copia el **App Secret** de la app (Configuración → Básica) a `META_APP_SECRET`;
   la función firma cada llamada con él.

### 3. GitHub + Vercel
1. Sube esta carpeta a un repositorio (mejor privado).
2. Vercel → Add New → Project → importa el repositorio. Framework: **Other**. Sin build command.
3. Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `LEADS_SHEET_ID` | `1RVHrcvwVKUFqZADVi5RQmXuRCZompALyAgbnkYpayTM` |
| `META_ACCESS_TOKEN` | token del usuario del sistema |
| `META_AD_ACCOUNT_ID` | `1018952286067785` (cuenta pchcapital) |
| `META_CAMPAIGN_ID` | `120247769379040129` (RO_MX_LEA_PRO_PCH_FORMS) |
| `META_APP_SECRET` | *(opcional)* App Secret de la app de Meta |
| `META_API_VERSION` | *(opcional)* por defecto `v23.0` |
| `DASHBOARD_PASSWORD` | *(opcional)* contraseña para abrir el dashboard |

4. Deploy y abre la URL.

## Cómo se actualiza
- Cada vez que se abre la página se leen el Sheet y Meta (caché de 5 min en Vercel).
- Meta entrega inversión y leads por anuncio y día del año en curso; la inversión se asigna a cada servicio
  por el ID del conjunto de anuncios (crédito `120248230311540129`, factoraje `120248229298130129`,
  arrendamiento `120248230038680129`). Otros conjuntos de la campaña quedan fuera de alcance.
- Si lanzan una campaña o conjunto nuevo, hay que agregar su ID (en `META_CAMPAIGN_ID` y en el mapa
  `SVC_ID` dentro de `index.html`).

## Problemas comunes
- **«Meta Ads: Error validating access token»**: el token caducó o se revocó; genera otro y actualízalo en Vercel.
- **«Meta Ads: (#200) … permission»**: al usuario del sistema le falta la cuenta `pchcapital` o el permiso `ads_read`.
- **«Faltan …»**: revisa los nombres exactos de las variables y vuelve a desplegar.
- **«Google Sheets: El Sheet no está abierto»**: el acceso general no está en «Cualquier persona con el enlace».
- **«Google Sheets: No se encontró el Sheet o una pestaña»**: revisa `LEADS_SHEET_ID` o el gid en `LEAD_GIDS`.

## Reglas del funnel (resumen)
- **MQL**: más de 2 años de operación + CIEC vigente + ventas anuales ≥ 10M; o Estatus «Fondeable».
- **SQL**: Estatus «Elegibilidad».
- **Rechazado**: Estatus «Rechazado» o comentario «NO VIABLE…», con el criterio que falló.
- Si Estatus está vacío se usa la columna Comentarios. Si falta un dato y no hay estatus: «Pendiente de calificación».
- Canal único por ahora: Meta Ads (sin Google Ads). Landing sin fuente; documentación sin columna;
  «solicitud ≥ $1M» provisional; umbral de ventas asumido en MXN anuales.
