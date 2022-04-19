# Serverless Plugin Neo

Serverless plugin that compiles TypeScript code and bundles dependencies with [node-file-trace](https://github.com/vercel/nft)

This plugin was originally based on `serverless-plugin-typescript` and offers the following benefits:

- Significantly smaller packages
- Monorepo support

## Known Issues

> :warning: This plugin is still in the early stages of development and some things might not work

- Only AWS is supported
- Individual packaging has not been tested

## Usage

1. Install the plugin

   ```sh
   npm install serverless-plugin-neo
   ```

1. Add plugin to Serverless Config file

   ```yaml
   plugins:
     - serverless-plugin-neo
     ...
     - serverless-offline
   ```

   If you're using the `serverless-offline` plugin make sure it goes after `serverless-plugin-neo`

1. Configure plugin (optional)

   ```yaml
   custom:
     serverless-plugin-neo:
       baseDirectory: '.'
       tsconfig: 'tsconfig.json'
   ```

   There are no required settings. You can see a list of all settings and their defaults below.

1. Build your code

   ```sh
   serverless package
   ```

## Settings

| Name            | Type     | Default           | Description                                                                                                                                        |
| --------------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| baseDirectory   | string   | `process.cwd()`   | Your project's root directory. Defaults to `process.cwd` in a single repo project. Attempts to find the root `package.json` in a monorepo project. |
| excludePackages | string[] | `**/aws-sdk/**/*` | A list of packages to exclude from bundling. See the [`node-file-trace`](https://github.com/vercel/nft#ignore) docs for details.                   |
| skipCleanup     | boolean  | `false`           | Clean up `.build` directory after packaging. Disabling this can be useful for troubleshooting build issues.                                        |
| tsconfig        | string   | `tsconfig.json`   | tsconfig filename                                                                                                                                  |

## Contributing

If you'd like to contribute to this project we recommend that you first [open an issue](https://github.com/neofinancial/serverless-plugin-neo/issues) to discuss your proposed change.

1. Fork this repo
1. Clone the forked repo
1. Install dependencies: `npm install`

### Development

#### `npm start`

### Building

#### `npm run build`

To clean the build directory run `npm run clean`

### Testing

#### `npm run test`

## Publishing

1. Update the version in `package.json`
1. Add an entry in `CHANGELOG.md`
1. Commit your changes
1. Run `npm pack --dry-run` to see what will be published
1. Run `npm publish`
1. Create a release on GitHub. Use the version as the tag and release name. For example for version `1.0.0` the tag and release name would be `v1.0.0`.
