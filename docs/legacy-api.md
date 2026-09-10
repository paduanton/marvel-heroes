# Legacy API Compatibility

The routes below remain temporarily available for existing consumers. They return `Deprecation: true` and use the same normalized, cached Marvel gateway as `/api/v1`; no new client may depend on them.

| Deprecated route | Replacement |
| --- | --- |
| `GET /api/character/{name}` | `GET /api/v1/characters?query={name}` |
| `GET /api/character/id/{idCharacter}` | `GET /api/v1/characters/{characterId}` |
| `GET /api/character/stories/{idCharacter}` | `GET /api/v1/characters/{characterId}/stories` |
| `GET /api/character/comics/{storyId}` | `GET /api/v1/stories/{storyId}/comics` |

The v1 contract in [openapi.yaml](openapi.yaml) is the only supported API contract. Remove these routes only through an approved breaking-change plan and a `feat(api)!:` commit.
