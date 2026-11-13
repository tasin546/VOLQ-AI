FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json

RUN npm install --workspace=apps/web --include-workspace-root=false

COPY apps/web ./apps/web

RUN npm run build --workspace=apps/web

FROM nginx:1.27-alpine AS runner

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
