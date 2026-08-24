FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS runtime
WORKDIR /app
ARG GIT_SHA=unknown
ENV NODE_ENV=production
ENV BACKEND_HOST=0.0.0.0
ENV BACKEND_PORT=3001
ENV GIT_SHA=${GIT_SHA}
COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma
COPY backend ./backend
COPY shared ./shared
COPY public ./public
COPY package.json package-lock.json ./
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && npm run backend"]
