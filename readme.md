# Marvel Heroes

Vitrine de personagens Marvel: catálogo paginado, busca por nome, detalhe e conteúdos relacionados. O browser conversa somente com a API interna versionada; Laravel integra a Marvel API e protege a cota externa com Redis.

## Arquitetura

```text
Vue 3 SPA -> Laravel REST (/api/v1) -> Redis -> Marvel API
```

O contrato HTTP está em [docs/openapi.yaml](docs/openapi.yaml). As decisões de arquitetura e o guia de desenvolvimento estão em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Integrações antigas estão descritas em [docs/legacy-api.md](docs/legacy-api.md).

## Execução local

1. Copie `.env.example` para `.env` e informe `MARVEL_PUBLIC_KEY`, `MARVEL_PRIVATE_KEY` e uma senha local em `DB_PASSWORD`.
2. Faça o build: `docker compose build`.
3. Em uma instalação nova, gere a chave persistindo o `.env` do host (PowerShell): `docker compose run --rm --no-deps --user root --volume "${PWD}/.env:/var/www/html/.env" app php artisan key:generate --force`.
4. Inicie os serviços: `docker compose up -d`.
5. Em uma instalação nova, prepare o banco: `docker compose exec app php artisan migrate`. Em uma base existente, revise e autorize as migrations antes de executá-las.
6. Abra `http://localhost:8080`. O catálogo é público; cadastro e sessão ficam em `/register`, `/login` e `/account`.

Use `http://localhost:8080/health` para verificar a aplicação. `GET /ready` também valida Redis e a configuração das credenciais Marvel.

## Qualidade

Os testes PHP usam o target Docker `testing`; a imagem `application` não inclui PHPUnit nem Pint. Os comandos de build, teste e lint estão em [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

A API tem testes com respostas simuladas e uma suíte isolada com Redis real. O frontend usa tipos gerados do OpenAPI, testes unitários e E2E em desktop/mobile. Sanctum autentica por sessão, com PostgreSQL apenas para identidade. A suíte HTTP integrada usa Laravel, PostgreSQL e Redis descartáveis; a Marvel permanece simulada. Verificação de e-mail, recuperação de senha e validação com a Marvel real continuam pendentes. Os comandos e limites estão em [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) e [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md).

Leia [AGENTS.md](AGENTS.md), [CONTEXT.md](CONTEXT.md) e [CONTRIBUTING.md](CONTRIBUTING.md) antes de contribuir. O projeto usa Conventional Commits e não permite staging ou commits sem autorização explícita.
