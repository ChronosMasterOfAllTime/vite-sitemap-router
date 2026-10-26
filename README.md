# Web Plugins

This directory contains the source code for various web plugins used in our project. Below is a brief overview of the structure and contents of this directory.

## Directory Structure

- `src/`: Contains the source code for the plugins.

## Excluded Directories

- `dist/`: This directory is used for the distribution files and is not included in the source control.
- `node_modules/`: This directory contains the dependencies and is not included in the source control.

## Getting Started

To get started with the development of these plugins, follow the steps below:

1. **Install Dependencies**:
```sh
    npm install
```

2. **Build the Plugins**:
```sh
    npm run build
```

3. **Run Lint**:
```sh
    npm run lint
```

## Usage
    This is intended to be used in the `vite.config.(ts|js)` file. The following is an example of how to use the plugin:

### By direct route definition
```ts
    import { defineConfig } from 'vite';
    import { sitemapPlugin } from './web/plugins';

    export default defineConfig({
        plugins: [
            sitemapPlugin({
                appUrl: 'https://example.com',
                routes: [
                    {
                        path: '/about',
                        name: 'about',
                    }
                    {
                        path: '/contact',
                        name: 'contact',
                        children: [
                            {
                                path: '',
                                name: 'contact.chat'
                            },
                            {
                                path: 'email',
                                name: 'contact.email'
                            }
                        ]
                    },
                ],
            }),
        ]
       // ...other vite config below...
    });
```

### By router file

```ts 
    import { defineConfig } from 'vite';
    import { sitemapPlugin } from './web/plugins';

    export default defineConfig({
        plugins: [
            sitemapPlugin({
                appUrl: 'https://example.com',
                routerFile: 'src/router/index.ts', // this contains your exported router used in your entrypoint in main.ts
            }),
        ]
       // ...other vite config below...
    });
```

### Options

Please see the options below for the sitemap plugin:

```ts
/**
 * Plugin options for the sitemap plugin.
 */
interface PluginOptions {
  /**
   * The path to the router file.
   */
  routerFile?: string
  /**
   * The array of route records. This takes precedence over the router file.
   */
  routes?: Array<RouteRecord>
  /**
   * A function to filter routes.
   * @param route - The route to be filtered.
   * @returns Whether the route should be included or not.
   */
  filter?: (route?: RouteInput) => boolean
  /**
   * The URL of the application.
   * @default 'http://localhost'
   */
  appUrl?: string
  /**
   * The path of the output file.
   * @default (build.outDir || 'dist/') + 'sitemap.xml'
   */
  outfile?: string
}
```

## Development

```bash
npm ci
npm test          # run the Vitest suite once
npm run test:watch
npm run typecheck
npm run lint
npm run build
```

## Releasing

Releases are automated with [Release Drafter](https://github.com/release-drafter/release-drafter) and GitHub Actions:

1. Every merge to `main` updates a draft GitHub release. The next version is calculated from the latest published release using PR labels: `major`/`breaking` → major, `minor`/`feature`/`enhancement` → minor, anything else → patch. PRs are auto-labelled from conventional-commit titles (`feat:`, `fix:`, `docs:`, `chore:`, `feat!:` …) and branch names.
2. If no release has been published yet, the workflow creates a baseline release `v<package.json version>` so drafting continues from the version already on npm.
3. Publishing the draft release triggers `publish.yml`, which sets `package.json` to the release version, runs lint/typecheck/tests/build, publishes to npm (with provenance; prereleases use the `next` dist-tag) and then commits the version bump back to `main`.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so no npm token is stored in the repo. The package's trusted publisher on npmjs.com must point at this repository and the `publish.yml` workflow. The version bump is pushed with the `RELEASE_DEPLOY_KEY` deploy key, which is on the `main` ruleset's bypass list.

## Contributing

We welcome contributions! Please read our [contributing guidelines](../CONTRIBUTING.md) before submitting a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.**
