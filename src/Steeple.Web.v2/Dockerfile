# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

COPY src/Steeple.Web.v2/package.json src/Steeple.Web.v2/package-lock.json ./
RUN npm ci --omit=dev

COPY src/Steeple.Web.v2/ ./
RUN npm run build

FROM nginx:alpine AS final
COPY src/Steeple.Web.v2/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist/ /usr/share/nginx/html/

RUN sed -i '/^user /d' /etc/nginx/nginx.conf \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx

EXPOSE 8080
USER nginx
ENTRYPOINT ["nginx", "-g", "daemon off;"]
