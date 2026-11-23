import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

// Все файлы из папок global/ и views/ становятся входами сборки автоматически:
// новый файл достаточно положить в папку и подключить в шаблоне через @vite.
const entries = (dir, ext) =>
    existsSync(dir)
        ? readdirSync(dir, { recursive: true })
              .filter((file) => file.endsWith(ext))
              .map((file) => `${dir}/${file.replaceAll('\\', '/')}`)
        : [];

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
                ...entries('resources/css/global', '.css'),
                ...entries('resources/css/views', '.css'),
                ...entries('resources/js/global', '.js'),
                ...entries('resources/js/views', '.js'),
            ],
            refresh: true,
        }),
    ],
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
