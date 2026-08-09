# syntax=docker/dockerfile:1

FROM node:24.14.1-alpine3.23 AS build
WORKDIR /app

COPY src/Steeple.Web.v2/package.json src/Steeple.Web.v2/package-lock.json ./
RUN npm ci --omit=dev

COPY src/Steeple.Web.v2/ ./

# Provider/bot-check client ids are baked into the bundle at build time
# (docs/runbooks/sso-and-turnstile.md §6) — empty means that provider is simply
# not offered, and the API side fails closed without its matching env.
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_APPLE_CLIENT_ID=
ARG VITE_APPLE_REDIRECT_URI=
ARG VITE_TURNSTILE_MODE=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_APPLE_CLIENT_ID=$VITE_APPLE_CLIENT_ID \
    VITE_APPLE_REDIRECT_URI=$VITE_APPLE_REDIRECT_URI

RUN --mount=type=secret,id=TURNSTILE_SITE_KEY,env=VITE_TURNSTILE_SITE_KEY \
    test -n "$VITE_APPLE_CLIENT_ID" \
    && test -n "$VITE_APPLE_REDIRECT_URI" \
    && if [ "$VITE_TURNSTILE_MODE" = "disabled" ]; then \
         test -z "$VITE_TURNSTILE_SITE_KEY"; \
       elif [ "$VITE_TURNSTILE_MODE" = "enabled" ]; then \
         test -n "$VITE_TURNSTILE_SITE_KEY"; \
       else \
         false; \
       fi \
    && npm run build

FROM nginx:1.31.3-alpine3.24 AS final
COPY src/Steeple.Web.v2/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist/ /usr/share/nginx/html/

RUN sed -i '/^user /d' /etc/nginx/nginx.conf \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx

EXPOSE 8080
USER nginx
ENTRYPOINT ["nginx", "-g", "daemon off;"]
