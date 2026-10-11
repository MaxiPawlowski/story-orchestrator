import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('production JSON module interop ships 40 valid original skeletons', async () => {
    const output = path.join(root, '.build', 'pose-json-probe');
    const compiler = webpack({ mode: 'production', target: 'node', context: root, entry: './src/sprites/poses/library.ts',
        output: { path: output, filename: 'library.cjs', library: { type: 'commonjs2' } },
        resolve: { extensions: ['.ts', '.js', '.json'], alias: { '@engine': path.join(root, 'src/engine'), '@utils': path.join(root, 'src/utils') } },
        module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: { loader: 'babel-loader', options: {
            presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: false }], '@babel/preset-typescript'] } } }] },
        optimization: { minimize: true } });
    try {
        const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => error ? reject(error) : resolve(stats)));
        assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
        const library = createRequire(import.meta.url)(path.join(output, 'library.cjs'));
        const poses = library.shippedPoses();
        assert.equal(poses.length, 40);
        assert.equal(new Set(poses.map((pose) => pose.id)).size, 40);
        assert.equal(poses.every((pose) => pose.keypoints.points.length === 18), true);
    } finally { await new Promise((resolve, reject) => compiler.close((error) => error ? reject(error) : resolve())); }
});
