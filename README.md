# Sublima Fácil

Herramientas para un negocio de sublimación e impresión 3D, todo en el navegador y sin instalar nada:

| Parte | Dirección | Para qué |
|---|---|---|
| **Editor** | https://josesegura12.github.io/software-tazas/ | Diseñar, revisar e imprimir tazas, termos, playeras, etc. y convertir imágenes a 3D |
| **Mi negocio (ERP)** | https://josesegura12.github.io/software-tazas/erp/ | Pedidos, clientes, inventario, ventas, gastos, precios y reportes |
| **Tienda** | https://josesegura12.github.io/software-tazas/tienda/ | Catálogo público con carrito y pedido por WhatsApp |

El editor se puede **instalar como app** (botón "⬇ Instalar app") y funciona **sin internet** después de abrirlo una vez.

## Editor de diseño

1. Elige el producto (34 plantillas en 5 categorías, buscador, o crea la tuya con tu medida).
2. Sube tu imagen: se acomoda sola a la plantilla sin recortar (modo Automático).
3. Agrega textos, figuras, QR o usa un **diseño rápido** (cumpleaños, Día de las Madres, boda…).
4. Revisa la tarjeta **Revisión antes de imprimir** y abre el **Editor de impresión**.

**Diseño**
- Guías de sangrado, corte, zona segura y zona del asa; lo que queda sin imagen se marca en rojo.
- Rellenar, Estirar, Completa, Completa + difuminado; agarraderas para estirar a mano.
- Texto curvo (arco o sonrisa), 16 letras, espaciado, alineación, contorno, sombra y botón **Color que resalte**.
- Collage de 2, 3 o 4 fotos, figuras y marcos, fondo liso o en degradado.
- Imagen: color, filtros, nitidez, recortar, borrador, quitar fondo, formas y bordes, **vectorizar a SVG**.
- Código QR (WhatsApp, página o texto), duplicar (Ctrl+D), **Ambos lados** de la taza.
- Deshacer/rehacer, guardado automático y **Mis diseños** para guardar cada pedido.

**Impresión**
- Hoja A4 por defecto (también carta, oficio, A3, tabloide), espejo, varias piezas por hoja, marcas de corte.
- **Nombres en lote**: una pieza por nombre, en las hojas que hagan falta.
- **Hoja combinada**: varios diseños distintos (de cualquier producto) en la misma hoja para ahorrar papel.
- Ajuste de color al imprimir para compensar que la sublimación sale más apagada.
- PNG a 300 DPI con la medida real. Al imprimir elige **Escala 100 % / Tamaño real**.

**Para el cliente**
- Vista previa en el producto (taza y termo giran) y **Kit para el cliente**: el diseño en 4 productos en una sola imagen.

**Impresión 3D (Creality Hi)**
- Litofanía plana o curva, relieve de un color, y **Multicolor por zonas** para el CFS.
- Multicolor en un solo archivo **.3mf** con el filamento ya asignado a cada color, o ZIP con un STL por color, o un STL de una pieza.
- Argolla para llavero, vista 3D para girar la pieza antes de descargar.

## Mi negocio (ERP)

Panel, venta rápida, cotizaciones y pedidos (con tablero por estado, notas imprimibles y envío por WhatsApp), clientes, productos con receta de insumos, inventario que se descuenta solo, gastos y compras, calculadora de precios (sublimación e impresión 3D), calendario de entregas, reportes con CSV y configuración del negocio.

**Cobros con tarjeta (Clip):** en Configuración guarda tus claves de Clip; en cada pedido, **💳 Cobrar con Clip** crea un link de pago y un QR para mandar por WhatsApp o mostrar en el mostrador. El ERP revisa solo si ya se pagó y registra el pago.

**Envíos (Skydropx):** en cada pedido, **📦 Enviar** cotiza con todas las paqueterías, compra la guía (con confirmación), da la etiqueta en PDF y el rastreo para mandar por WhatsApp. Requiere instalar una vez el [conector gratis en Cloudflare](conector/README.md).

Las claves de Clip y del conector se guardan **solo en el navegador** (no van en respaldos, en la tienda ni en GitHub).

Los datos se guardan **solo en el navegador de esa computadora**. Descarga un **respaldo** seguido (Configuración → Descargar respaldo) y úsalo para pasar tus datos a otra computadora.

## Tienda

La tienda lee `tienda/catalogo.json`. Para actualizarla:
1. En el ERP: Configuración → **Exportar catálogo para la tienda** (descarga `catalogo.json`).
2. En GitHub abre la carpeta `tienda` → **Add file → Upload files**, suelta el archivo y presiona **Commit changes**.
3. La tienda se actualiza en 1–2 minutos.

El catálogo de ejemplo trae un WhatsApp de prueba (5512345678): exporta el tuyo desde el ERP para recibir pedidos.
