# Inventario de cartas Yu-Gi-Oh!

Aplicación web para llevar el inventario de tu colección de cartas. Busca las cartas en la
[API de YGOPRODeck](https://ygoprodeck.com/api-guide/) y las guarda en una base de datos MySQL.

## Qué hace

- Inventario en cuadrícula con la imagen de cada carta y su cantidad; al pulsar se ve la ficha completa.
- Búsqueda automática en YGOPRODeck mientras escribes.
- Barra lateral con todas tus etiquetas y su contador; al pulsar una se filtra el inventario.
- Idioma de la carta (con banderas), rareza, set, estado y etiquetas propias.
- Exportar e importar en **JSON**, **CSV** y **YDK**.
- Lista activa: insignia en la esquina de cada carta con su estado en la lista de prohibidas (TCG, OCG o GOAT) o sus puntos Genesys. Los datos se consultan a YGOPRODeck y se guardan 12 h en el navegador.
- Modo oscuro y login de un solo usuario.

## Arrancar con Docker

```bash
cp .env.example .env      # y edita las dos contraseñas
docker compose up -d --build
```

Abre <http://localhost:3000> y entra con el valor de `APP_PASSWORD`.

## Arrancar sin Docker

Necesitas Node.js 18 o superior y un MySQL 8 en marcha.

```bash
npm install
cp .env.example .env      # pon DB_PASSWORD y APP_PASSWORD
npm start
```

La base de datos y la tabla se crean solas la primera vez.

## Formatos de importación y exportación

| Formato | Para qué sirve |
|---------|----------------|
| JSON | Copia completa del inventario, con todos los campos |
| CSV | Hojas de cálculo (separador `;`, UTF-8). Al importar admite `;` o `,` |
| YDK | Mazos para EDOPro y simuladores. Solo guarda los IDs de las cartas |

## Seguridad

- Las contraseñas van en `.env` (o en variables de entorno), nunca en el código.
- La web solo escucha en tu equipo. Si la expones a internet, ponla detrás de HTTPS.

## Créditos y aviso legal

Datos e imágenes de cartas obtenidos de [YGOPRODeck](https://ygoprodeck.com). Yu-Gi-Oh! es una marca
de Konami. Este proyecto es independiente y no está afiliado ni respaldado por Konami ni por YGOPRODeck.