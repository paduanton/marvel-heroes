<?php

namespace App\Http\Middleware;

use App\Modules\Characters\Domain\CatalogLimits;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class ValidateCatalogIdentifiers
{
    public function handle(Request $request, Closure $next): Response
    {
        foreach (['characterId', 'storyId', 'idCharacter'] as $parameter) {
            $value = $request->route($parameter);
            if ($value !== null && filter_var(ltrim((string) $value, '0'), FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1, 'max_range' => CatalogLimits::MAX_ID],
            ]) === false) {
                throw new NotFoundHttpException;
            }
        }

        return $next($request);
    }
}
