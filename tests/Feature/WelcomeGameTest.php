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

    public function test_the_flea_game_offers_a_character_choice(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('data-flea-characters', false);
        $response->assertSeeInOrder([
            'value="flea" data-flea-character checked',
            'value="ladybug" data-flea-character',
            'value="ant" data-flea-character',
        ], false);
    }
}
