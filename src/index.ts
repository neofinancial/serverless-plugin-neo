import path from 'path';
import fs from 'fs-extra';
import globby from 'globby';
import chalk from 'chalk';
import { nodeFileTrace } from '@vercel/nft';
import ts from 'typescript';
import findUp from 'find-up';
import serverless from 'serverless';
import Plugin from 'serverless/classes/Plugin';
import { Layer } from 'serverless/plugins/aws/provider/awsProvider';

import typescript from './lib/typescript';
import { extractFilenames, getFileSize, linkOrCopy, trimPathSeparators } from './lib/fs';
import { handleSpecialCases } from './lib/dependencies';
import { watchFiles } from './lib/watch-files';
import { consoleLogger } from './lib/logger';

const SERVERLESS_FOLDER = '.serverless';
const BUILD_FOLDER = '.build';

interface PluginNeoOptions {
  baseDirectory?: string;
  excludePackages?: string[];
  skipCleanup?: boolean;
  tsconfig?: string;
}

export class NeoPlugin {
  private originalServicePath: string;
  private servicePathUpdated: boolean;
  private outPackagePath: string;
  private outModulesPath: string;
  private isWatching: boolean;
  private pluginConfig: PluginNeoOptions | undefined;
  private serverless: serverless;
  private options: serverless.Options;
  private tsconfig: ts.CompilerOptions;
  private log: Plugin.Logging['log'];
  protected hooks: Plugin.Hooks;
  protected commands: Plugin.Commands;

  constructor(serverless: serverless, options: serverless.Options, logging: Plugin.Logging) {
    this.serverless = serverless;
    this.options = options;
    this.originalServicePath = this.serverless.config.servicePath;
    this.servicePathUpdated = false;
    this.outPackagePath = path.resolve(path.join(BUILD_FOLDER, 'package.json'));
    this.outModulesPath = path.resolve(path.join(BUILD_FOLDER, 'node_modules'));
    this.isWatching = false;
    this.pluginConfig = this.serverless.service.custom?.['serverless-plugin-neo'];
    this.log = logging ? logging.log : consoleLogger.log;
    this.tsconfig = typescript.getTypeScriptConfig(
      this.originalServicePath,
      this.pluginConfig?.tsconfig || 'tsconfig.json',
      BUILD_FOLDER,
      this.log
    );

    this.log.debug(`process.cwd ${process.cwd()}`);
    this.log.debug(`originalServicePath ${this.originalServicePath}`);
    this.log.debug(`pluginConfig ${this.pluginConfig}`);

    this.commands = {
      invoke: {
        commands: {
          local: {
            options: {
              watch: {
                type: 'boolean',
                usage: 'Watch file changes and recompile',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'before:run:run': async (): Promise<void> => {
        this.log.debug('before:run:run');

        await this.compileTypeScript();
        await this.copyExtras();
        await this.copyDependencies();
      },
      'before:offline:start': async (): Promise<void> => {
        this.log.debug('before:offline:start');

        await this.compileTypeScript();
        await this.copyExtras();
        await this.copyDependencies();
        this.watchAll();
      },
      'before:offline:start:init': async (): Promise<void> => {
        this.log.debug('before:offline:start:init');

        await this.compileTypeScript();
        await this.copyExtras();
        await this.copyDependencies();
        this.watchAll();
      },
      'before:package:createDeploymentArtifacts': async (): Promise<void> => {
        this.log.debug('before:package:createDeploymentArtifacts');

        await this.compileTypeScript();
        await this.copyExtras();
        await this.copyDependencies();
      },
      'after:package:createDeploymentArtifacts': async (): Promise<void> => {
        this.log.debug('after:package:createDeploymentArtifacts');

        await this.moveArtifacts();
        await this.cleanup();
      },
      'before:deploy:function:packageFunction': async (): Promise<void> => {
        this.log.debug('before:deploy:function:packageFunction');

        await this.compileTypeScript();
        await this.copyExtras();
        await this.copyDependencies();
      },
      'after:deploy:function:packageFunction': async (): Promise<void> => {
        this.log.debug('after:deploy:function:packageFunction');

        await this.moveArtifacts();
        await this.cleanup();
      },
      'before:invoke:local:invoke': async (): Promise<void> => {
        this.log.debug('before:invoke:local:invoke');

        const emittedFiles = await this.compileTypeScript();

        await this.copyExtras();
        await this.copyDependencies();

        if (this.isWatching) {
          emittedFiles.forEach((filename) => {
            const module = require.resolve(path.resolve(this.originalServicePath, filename));

            delete require.cache[module];
          });
        }
      },
      'after:invoke:local:invoke': async (): Promise<void> => {
        this.log.debug('after:invoke:local:invoke');

        if (this.options.watch) {
          await this.watchFunction();
        }
      },
    };
  }

  get functions(): { [key: string]: serverless.FunctionDefinitionHandler | serverless.FunctionDefinitionImage } {
    const { options } = this;
    const { service } = this.serverless;

    if (options.function) {
      return {
        [options.function]: service.functions[options.function],
      };
    }

    return service.functions;
  }

  get rootFilenames(): string[] {
    return extractFilenames(this.originalServicePath, this.functions, this.log);
  }

  async getExtrasFilenames(): Promise<string[]> {
    const { service } = this.serverless;
    const patterns = [...(service.package.include || []), ...(service.package.patterns || []), '!node_modules/**'];

    // include any "extras" from the "include" section
    if (patterns.length > 0) {
      const files = await globby(patterns);

      return files;
    } else {
      return [];
    }
  }

  async watchFunction(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    const extrasFilenames = await this.getExtrasFilenames();

    this.log.info(`Watching function ${this.options.function}...`);
    this.log.info('Waiting for changes...');

    this.isWatching = true;

    await new Promise((resolve, reject) => {
      watchFiles(this.rootFilenames, extrasFilenames, this.tsconfig, () => {
        this.serverless.pluginManager.spawn('invoke:local').catch(reject);
      });
    });
  }

  async watchAll(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    const extrasFilenames = await this.getExtrasFilenames();

    this.log.notice('Watching files...');

    this.isWatching = true;

    watchFiles(this.rootFilenames, extrasFilenames, this.tsconfig, () => {
      this.compileTypeScript();
      this.copyExtras();
    });
  }

  async compileTypeScript(): Promise<string[]> {
    this.log.notice('Compiling TypeScript...');

    if (!this.servicePathUpdated) {
      // Fake service path so that serverless will know what to zip
      this.serverless.config.servicePath = path.join(this.originalServicePath, BUILD_FOLDER);
      this.servicePathUpdated = true;
    }

    try {
      const emittedFiles = await typescript.compile(this.rootFilenames, this.tsconfig, this.log);

      this.log.success('TypeScript compiled');

      return emittedFiles;
    } catch {
      process.exit(1);
    }
  }

  async copyExtras(): Promise<void> {
    const { service } = this.serverless;

    const patterns = [...(service.package.include || []), ...(service.package.patterns || []), '!node_modules/**'];

    // include any "extras" from the "include" section
    if (patterns.length > 0) {
      const files = await globby(patterns);

      for (const filename of files) {
        const destFileName = path.resolve(path.join(BUILD_FOLDER, filename));
        const dirname = path.dirname(destFileName);

        if (!fs.existsSync(dirname)) {
          fs.mkdirSync(dirname, { recursive: true });
        }

        if (!fs.existsSync(destFileName) || fs.statSync(filename).mtimeMs > fs.statSync(destFileName).mtimeMs) {
          fs.copySync(path.resolve(filename), path.resolve(path.join(BUILD_FOLDER, filename)));
        }
      }
    }
  }

  async copyDependencies(): Promise<void> {
    if (fs.existsSync(this.outModulesPath)) {
      fs.rmSync(this.outModulesPath, { recursive: true, force: true });
    }

    this.serverless.service.package.patterns = [
      ...(this.serverless.service.package.patterns || []),
      '**/*',
      '!.serverless',
    ];

    this.log.debug(`rootFileNames ${this.rootFilenames}`);

    // TODO: should this only be the entrypoint?
    const buildFilenames = this.rootFilenames.map((filename) =>
      path.join(BUILD_FOLDER, filename.replace(/\.tsx?$/, '.js'))
    );

    this.log.debug(`buildFilenames ${buildFilenames}`);

    let baseDir =
      findUp
        .sync('package.json', { cwd: path.resolve(this.originalServicePath, '..') })
        ?.replace(`${path.sep}package.json`, '') || process.cwd();
    let packageDir = this.originalServicePath;

    if (this.pluginConfig?.baseDirectory) {
      if (path.isAbsolute(this.pluginConfig.baseDirectory)) {
        baseDir = this.pluginConfig.baseDirectory;
      } else {
        baseDir = path.resolve(this.originalServicePath, this.pluginConfig.baseDirectory);
      }

      packageDir = packageDir.replace(baseDir, '').slice(1);
    }

    const packagePrefix = trimPathSeparators(packageDir.replace(baseDir, ''));

    this.log.notice('Bundling dependencies...');

    if (packagePrefix) {
      this.log.notice(chalk.gray('Monorepo detected'));
      this.log.notice(
        chalk.gray(
          `Bundling dependencies from ${path.relative(
            process.cwd(),
            path.join(baseDir, 'node_modules')
          )} and ${path.relative(process.cwd(), path.join(packageDir, 'node_modules'))}`
        )
      );
    } else {
      this.log.notice(
        chalk.gray(`Bundling dependencies from ${path.relative(process.cwd(), path.join(baseDir, 'node_modules'))}`)
      );
    }

    this.log.debug(`baseDir ${baseDir}`);
    this.log.debug(`packageDir ${packageDir}`);
    this.log.debug(`packagePrefix ${packagePrefix}`);
    this.log.debug(`buildFileNames ${buildFilenames}`);

    const tracedDependencies = await nodeFileTrace(buildFilenames, {
      base: baseDir,
      ignore: [...(this.pluginConfig?.excludePackages || []), '**/aws-sdk/**/*'],
    });

    this.log.debug(`traced fileList ${tracedDependencies.fileList}`);
    this.log.debug(`trace warnings ${tracedDependencies.warnings}`);
    this.log.verbose(`trace reasons ${tracedDependencies.reasons}`);

    const dependencies = await handleSpecialCases([...tracedDependencies.fileList], baseDir);
    const localDependencies = new Set<string>();
    const rootDependencies = new Set<string>();
    const sourceFiles = new Set<string>();

    for (const dependency of dependencies) {
      if (dependency.startsWith('node_modules')) {
        rootDependencies.add(dependency);
      } else if (dependency.startsWith(path.join(packagePrefix, 'node_modules'))) {
        localDependencies.add(dependency);
      } else if (
        !dependency.includes('.build') &&
        dependency !== 'package.json' &&
        dependency !== path.join(packagePrefix, 'package.json')
      ) {
        sourceFiles.add(dependency);
      }
    }

    for (const dependency of localDependencies) {
      const filename = dependency.replace(`${path.join(packagePrefix)}${path.sep}`, '');

      if (rootDependencies.has(filename)) {
        this.log.verbose(`pruning root dependency: ${filename}`);

        rootDependencies.delete(filename);
      }
    }

    this.log.verbose(`rootDependencies ${rootDependencies}`);
    this.log.verbose(`localDependencies ${localDependencies}`);
    this.log.verbose(`sourceFiles ${sourceFiles}`);

    for (const dependency of rootDependencies) {
      const sourcePath = path.resolve(baseDir, dependency);
      const destinationPath = path.resolve(this.outModulesPath, dependency.replace(`node_modules${path.sep}`, ''));

      this.log.verbose(`${sourcePath} -> ${destinationPath}`);

      await linkOrCopy(sourcePath, destinationPath);
    }

    for (const dependency of localDependencies) {
      const sourcePath = path.resolve(baseDir, dependency);
      const destinationPath = path.resolve(
        this.outModulesPath,
        dependency.replace(`${path.join(packagePrefix, 'node_modules')}${path.sep}`, '')
      );

      this.log.verbose(`${sourcePath} -> ${destinationPath}`);

      await linkOrCopy(sourcePath, destinationPath);
    }

    for (const file of sourceFiles) {
      const sourcePath = path.resolve(baseDir, file);
      const destinationPath = path.resolve(path.join(BUILD_FOLDER, file.replace(packagePrefix, '')));

      this.log.verbose(`${sourcePath} -> ${destinationPath}`);

      await linkOrCopy(sourcePath, destinationPath);
    }

    if (!fs.existsSync(this.outPackagePath)) {
      await linkOrCopy(path.resolve('package.json'), this.outPackagePath, 'file');
    }

    this.log.success('Dependencies bundled');
  }

  async moveArtifacts(): Promise<void> {
    const { service } = this.serverless;

    await fs.copy(
      path.join(this.originalServicePath, BUILD_FOLDER, SERVERLESS_FOLDER),
      path.join(this.originalServicePath, SERVERLESS_FOLDER)
    );

    const layerNames = service.layers;

    Object.values(layerNames).forEach((layer: Layer) => {
      if (layer.name) {
        service.layers[layer.name].package.artifact = path.join(
          this.originalServicePath,
          SERVERLESS_FOLDER,
          path.basename(service.layers[layer.name].package.artifact)
        );
      }
    });

    if (this.options.function) {
      const fn = service.functions[this.options.function];

      if (fn.package?.artifact) {
        fn.package.artifact = path.join(
          this.originalServicePath,
          SERVERLESS_FOLDER,
          path.basename(fn.package.artifact)
        );
      }

      return;
    }

    if (service.package.individually) {
      const functionNames = service.getAllFunctions();

      functionNames.forEach((name) => {
        const fn = service.functions[name];

        if (fn.package?.artifact) {
          fn.package.artifact = path.join(
            this.originalServicePath,
            SERVERLESS_FOLDER,
            path.basename(fn.package.artifact)
          );
        }
      });

      return;
    }

    service.package.artifact = path.join(
      this.originalServicePath,
      SERVERLESS_FOLDER,
      path.basename(service.package.artifact ?? '')
    );

    const fileSize = await getFileSize(service.package.artifact, this.log);

    // print artifact size
    this.log.notice('Artifacts:');
    console.log();
    this.log.notice(` ${chalk.blue(path.basename(service.package.artifact))}  ${fileSize}`);
    console.log();
  }

  async cleanup(): Promise<void> {
    // Restore service path
    this.serverless.config.servicePath = this.originalServicePath;

    if (this.pluginConfig?.skipCleanup !== true) {
      // Remove temp build folder
      fs.rmSync(path.join(this.originalServicePath, BUILD_FOLDER), { recursive: true, force: true });
    }
  }
}

module.exports = NeoPlugin;
