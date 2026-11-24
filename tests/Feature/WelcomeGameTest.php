<?php

namespace Tests\Feature;

use Tests\TestCase;

class WelcomeGameTest extends TestCase
{
    public function test_the_welcome_page_contains_the_flea_game(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('data-flea-game', false);
        $response->assertSee('data-flea-canvas', false);
        $response->assertSee('data-flea-start', false);
    }
}
