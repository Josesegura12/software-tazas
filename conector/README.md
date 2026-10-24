# Conector para envíos (Skydropx)

Skydropx no deja que una página web le hable directamente, así que "Mi negocio" usa este **conector**: un pequeño servidor **gratis** en Cloudflare que guarda tus claves de Skydropx de forma segura y pasa las peticiones.

Tus claves **nunca** quedan en el código ni en GitHub: solo en los secretos de Cloudflare.

Se hace **una sola vez** y toma unos 10 minutos.

## 1. Crear la cuenta y el Worker

1. Entra a https://dash.cloudflare.com/sign-up y crea tu cuenta gratis (o inicia sesión).
2. En el menú de la izquierda: **Compute (Workers) → Workers & Pages → Create → Create Worker**.
3. Ponle de nombre `sublima-conector` y presiona **Deploy**.
4. Presiona **Edit code**, borra todo lo que trae y pega el contenido de [`worker.js`](worker.js) (ábrelo en GitHub, botón **Copy raw file**).
5. Presiona **Deploy**.

Copia la dirección que te da Cloudflare, algo como `https://sublima-conector.tu-usuario.workers.dev`.

## 2. Guardar tus claves como secretos

En el Worker: **Settings → Variables and Secrets → Add**. Agrega estas tres, eligiendo el tipo **Secret**:

| Nombre | Valor |
|---|---|
| `SKYDROPX_ID` | Tu *client_id* de Skydropx (el "usuario" de la API) |
| `SKYDROPX_SECRET` | Tu *client_secret* de Skydropx (la "contraseña" de la API) |
| `CLAVE` | Una clave que **tú inventas** (por ejemplo, 20 letras y números al azar). La vas a escribir en Mi negocio. |

Presiona **Deploy** para que se apliquen.

Opcional: si usarás Mi negocio desde otra dirección que no sea `https://josesegura12.github.io`, agrega una variable `ORIGENES` (tipo *Text*) con esa dirección.

## 3. Conectarlo en Mi negocio

1. Abre **Mi negocio → Configuración → Envíos (Skydropx)**.
2. Pega la **dirección del conector** y la **clave del conector** (la que inventaste).
3. Presiona **Traer datos de mi último envío** para llenar tu dirección de origen y la clave SAT del contenido (o escríbelas a mano).
4. Presiona **Guardar** y luego **Probar conexión**.

Listo: en cada pedido aparece el botón **📦 Enviar**, que cotiza con todas las paqueterías y compra la guía.

## Seguridad

- El conector solo permite **cotizar, crear y consultar guías**; cualquier otra operación se rechaza.
- Sin la **clave del conector** no responde, aunque alguien conozca su dirección.
- Si crees que alguien conoce tu clave, cámbiala en Cloudflare (paso 2) y en Mi negocio.
- Comprar una guía **cuesta dinero** de tu cuenta de Skydropx: Mi negocio siempre te pide confirmación.
