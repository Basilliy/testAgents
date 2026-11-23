<?php

namespace Tests\Feature;

use Tests\TestCase;

class TestPageTest extends TestCase
{
    public function test_the_test_page_returns_a_successful_response(): void
    {
        $response = $this->get('/test');

        $response->assertStatus(200);
        $response->assertSee('test-page-ok');
    }
}
