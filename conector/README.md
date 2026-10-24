# Conector (pagos con tarjeta y envíos)

El **conector** es un pequeño servidor **gratis** en Cloudflare que hace lo que una página web sola no puede hacer de forma segura:

- **Pagos en la tienda:** el cliente paga con tarjeta (Clip) con los precios reales de tu catálogo y el costo de envío real.
- **Guías automáticas:** cada 5 minutos confirma los pagos con Clip y **compra la guía** de cada pedido pagado. En **Mi negocio** solo imprimes la etiqueta.
- **Envíos desde Mi negocio:** cotizar y comprar guías para tus pedidos de WhatsApp o mostrador.

Tus claves **nunca** quedan en el código ni en GitHub: solo en los secretos de Cloudflare.

Se configura **una sola vez** y toma unos 15 minutos.

## 1. Crear la cuenta y el Worker

1. Entra a https://dash.cloudflare.com/sign-up y crea tu cuenta gratis (o inicia sesión).
2. En el menú de la izquierda: **Compute (Workers) → Workers & Pages → Create → Create Worker**.
3. Ponle de nombre `sublima-conector` y presiona **Deploy**.
4. Presiona **Edit code**, borra todo lo que trae y pega el contenido de [`worker.js`](worker.js) (ábrelo en GitHub, botón **Copy raw file**).
5. Presiona **Deploy**.

Copia la dirección que te da Cloudflare, algo como `https://sublima-conector.tu-usuario.workers.dev`.

## 2. Crear el almacén de pedidos

1. En el menú: **Storage & Databases → KV → Create** y ponle de nombre `sublima-pedidos`.
2. Regresa a tu Worker: **Settings → Bindings → Add → KV namespace**.
3. En **Variable name** escribe exactamente `PEDIDOS` y elige `sublima-pedidos`. Guarda (**Deploy**).

## 3. Guardar tus claves como secretos

En el Worker: **Settings → Variables and Secrets → Add**, tipo **Secret**:

| Nombre | Valor |
|---|---|
| `SKYDROPX_ID` | Tu *client_id* de Skydropx (el "usuario" de la API) |
| `SKYDROPX_SECRET` | Tu *client_secret* de Skydropx (la "contraseña" de la API) |
| `CLIP_KEY` | Tu API key de Clip (la "usuario"; las de prueba empiezan con `test_`) |
| `CLIP_SECRET` | Tu clave secreta de Clip (la "contraseña") |
| `CLAVE` | Una clave que **tú inventas** (por ejemplo, 20 letras y números al azar). La vas a escribir en Mi negocio. |

Presiona **Deploy** para que se apliquen.

## 4. Activar el proceso automático

En el Worker: **Settings → Triggers → Cron Triggers → Add** y escribe `*/5 * * * *` (cada 5 minutos). Guarda.

Este proceso es el **único** que compra guías automáticas, de uno en uno, para que **nunca** se compren dos guías del mismo pedido.

## 5. Conectarlo en Mi negocio

1. Abre **Mi negocio → Configuración → Envíos (Skydropx)**.
2. Pega la **dirección del conector** y la **clave del conector** (la que inventaste).
3. Presiona **Traer datos de mi último envío** para llenar tu dirección de origen y la clave SAT del contenido (o escríbelas a mano). Revisa el **peso por pieza**.
4. Presiona **Guardar**: tus datos de envío se mandan al conector. Luego, **Probar conexión**.
5. En **Configuración → Tienda en línea**, presiona **Exportar catálogo** y súbelo a GitHub (carpeta `tienda`). Así la tienda sabe la dirección del conector y muestra **Pagar con tarjeta**.

## Cómo queda funcionando

1. El cliente arma su carrito en la tienda, pone su dirección, elige paquetería y paga con tarjeta en Clip.
2. En máximo 5 minutos el conector confirma el pago y compra la guía.
3. Mi negocio trae el pedido solo (al abrirlo y cada 5 minutos, o con **🌐 Pedidos de la tienda**). En el panel aparece en **🏷️ Guías para imprimir**: imprimes la etiqueta, empacas y entregas a la paquetería.
4. Si una guía falla (por ejemplo, datos de dirección incompletos), el pedido lo muestra y puedes **Reintentar guía automática**.

## Seguridad

- Los precios se toman siempre del catálogo publicado y el costo del envío de la cotización de Skydropx: aunque alguien manipule la página, no puede pagar menos.
- Lo de Mi negocio solo responde con la **clave del conector**. Si crees que alguien la conoce, cámbiala en Cloudflare (paso 3) y en Mi negocio.
- Las guías **cuestan dinero** de tu cuenta de Skydropx; el cliente ya pagó ese envío en su total.
- Cuando pases a cobrar de verdad, cambia `CLIP_KEY` y `CLIP_SECRET` por tus claves reales de Clip.
