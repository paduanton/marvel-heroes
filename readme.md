# Marvel Heroes

Vitrine de personagens Marvel: catálogo paginado, busca por nome, detalhe e conteúdos relacionados. O browser conversa somente com a API interna versionada; Laravel integra a Marvel API e protege a cota externa com Redis.

## Arquitetura

```text
Vue 3 SPA -> Laravel REST (/api/v1) -> Redis -> Marvel API
```

O contrato HTTP está em [docs/openapi.yaml](docs/openapi.yaml). As decisões de arquitetura e o guia de desenvolvimento estão em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Integrações antigas estão descritas em [docs/legacy-api.md](docs/legacy-api.md).

## Execução local

1. Copie `.env.example` para `.env` e informe `MARVEL_PUBLIC_KEY` e `MARVEL_PRIVATE_KEY`.
2. Faça o build: `docker compose build`.
3. Em uma instalação nova, gere a chave persistindo o `.env` do host (PowerShell): `docker compose run --rm --no-deps --user root --volume "${PWD}/.env:/var/www/html/.env" app php artisan key:generate --force`.
4. Inicie os serviços: `docker compose up -d`.
5. Abra `http://localhost:8080`.

Use `http://localhost:8080/health` para verificar a aplicação. `GET /ready` também valida Redis e a configuração das credenciais Marvel.

## Qualidade

Os testes PHP usam o target Docker `testing`; a imagem `application` não inclui PHPUnit nem Pint. Os comandos de build, teste e lint estão em [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

A API tem testes com respostas simuladas; o frontend tem testes de formatadores. Autenticação Sanctum, geração de tipos OpenAPI e cobertura E2E ainda estão pendentes. As limitações atuais estão em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Leia [AGENTS.md](AGENTS.md), [CONTEXT.md](CONTEXT.md) e [CONTRIBUTING.md](CONTRIBUTING.md) antes de contribuir. O projeto usa Conventional Commits e não permite staging ou commits sem autorização explícita.
