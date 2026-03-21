import * as esbuild from 'esbuild';
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

async function main() {
    // Build Extension Backend
    const ctx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        drop: production ? ['console'] : [],
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [
            esbuildProblemMatcherPlugin
        ],
    });

    // Build React Webview Frontend (Phase 5.1)
    const webviewCtx = await esbuild.context({
        entryPoints: ['src/webview/DashboardApp.tsx'],
        bundle: true,
        format: 'iife',
        minify: production,
        sourcemap: !production,
        outfile: 'dist/webview/DashboardApp.js',
        logLevel: 'silent'
    });

    // Build Injection Scripts
    const injectCtx = await esbuild.context({
        entryPoints: ['src/engine/inject/auto_accept.ts'],
        bundle: true,
        format: 'iife',
        minify: production,
        sourcemap: !production,
        outfile: 'dist/src/engine/inject/auto_accept.js',
        logLevel: 'silent',
        plugins: [
            esbuildProblemMatcherPlugin
        ]
    });

    if (watch) {
        await ctx.watch();
        await webviewCtx.watch();
        await injectCtx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
        await webviewCtx.rebuild();
        await webviewCtx.dispose();
        await injectCtx.rebuild();
        await injectCtx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
