<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Temporary compatibility adapter for the pre-v1 API.
 *
 * New clients must use /api/v1. These endpoints are deliberately kept thin
 * so they use the same normalized and cached upstream integration as v1.
 */
final class MarvelController extends Controller
{
    public function __construct(private readonly MarvelCatalogGateway $catalog) {}

    public function getCharacterId(string $name): JsonResponse
    {
        $character = $this->catalog->characters($name, 0, 1)['items'][0] ?? null;
        if ($character === null) {
            throw new NotFoundHttpException('Character not found.');
        }

        return $this->deprecated(['id' => $character['id']]);
    }

    public function getCharacteryById(int $idCharacter): JsonResponse
    {
        $character = $this->catalog->character($idCharacter);
        if ($character === null) {
            throw new NotFoundHttpException('Character not found.');
        }

        return $this->deprecated(['hero' => [
            'name' => $character['name'],
            'description' => $character['description'],
            'modified' => $character['modified_at'],
            'image' => $character['image_url'],
        ]]);
    }

    public function getStoriesByCharacterId(int $idCharacter): JsonResponse
    {
        $result = $this->catalog->stories($idCharacter, 0, 5);
        $stories = array_map(static fn (array $story): array => [
            'id' => $story['id'],
            'title' => $story['title'],
            'type' => $story['type'],
            'modified' => $story['modified_at'],
            'creators' => $story['counts']['creators'],
            'series' => $story['counts']['series'],
            'comics' => $story['counts']['comics'],
            'heroes' => $story['counts']['characters'],
            'events' => $story['counts']['events'],
        ], $result['items']);

        return $this->deprecated(['stories' => $stories]);
    }

    public function getComicsByStoryId(int $storyId): JsonResponse
    {
        $result = $this->catalog->comics($storyId, 0, 20);
        $comics = array_map(static fn (array $comic): array => [
            'id' => $comic['id'],
            'digitalId' => $comic['digital_id'],
            'titulo' => $comic['title'],
            'description' => $comic['description'],
            'modified' => $comic['modified_at'],
            'format' => $comic['format'],
            'saleDate' => $comic['on_sale_at'],
            'digitalPrice' => $comic['digital_price'],
            'image' => $comic['image_url'],
        ], $result['items']);

        return $this->deprecated(['comics' => $comics]);
    }

    /** @param array<string, mixed> $payload */
    private function deprecated(array $payload): JsonResponse
    {
        return response()->json($payload)
            ->header('Deprecation', 'true')
            ->header('Link', '</api/v1/characters>; rel="successor-version"');
    }
}
