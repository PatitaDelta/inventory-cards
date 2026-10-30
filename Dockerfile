FROM node:20-alpine

WORKDIR /app

# Instalar pnpm globalmente de forma segura
RUN npm install -g pnpm

# Copiar primero los archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar las dependencias usando pnpm
RUN pnpm install --frozen-lockfile

# Copiar el resto del código fuente (incluyendo la carpeta public y server.js)
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]