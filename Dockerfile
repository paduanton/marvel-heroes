FROM node:22-alpine AS frontend

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY resources ./resources
COPY vite.config.ts tsconfig.json ./
RUN pnpm run build

FROM composer:2 AS dependencies

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --no-progress --prefer-dist --optimize-autoloader

FROM composer:2 AS development-dependencies

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-scripts --no-interaction --no-progress --prefer-dist --optimize-autoloader

FROM php:8.3-fpm-alpine AS application

RUN apk add --no-cache $PHPIZE_DEPS libxml2-dev oniguruma-dev \
    && addgroup -S marvel \
    && adduser -S marvel -G marvel \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && docker-php-ext-install mbstring opcache xml

WORKDIR /var/www/html
COPY --from=dependencies --chown=marvel:marvel /app/vendor ./vendor
COPY --chown=marvel:marvel . .
COPY --from=frontend --chown=marvel:marvel /app/public/build ./public/build

RUN php artisan package:discover --ansi \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R marvel:marvel storage bootstrap/cache

USER marvel
EXPOSE 9000
CMD ["php-fpm"]

FROM application AS testing

USER root
COPY --from=development-dependencies --chown=marvel:marvel /app/vendor ./vendor
USER marvel

FROM nginx:1.27-alpine AS web

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY public /var/www/html/public
COPY --from=frontend /app/public/build /var/www/html/public/build
