import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import prettyBytes from 'pretty-bytes';
import serverless from 'serverless';
import Plugin from 'serverless/classes/Plugin';

const extractFilenames = (
  cwd: string,
  functions: { [key: string]: serverless.FunctionDefinitionHandler | serverless.FunctionDefinitionImage },
  log: Plugin.Logging['log']
): string[] => {
  if (!functions || Object.keys(functions).length === 0) return [];

  const files: string[] = [];

  for (const fn of Object.values(functions)) {
    if ('handler' in fn) {
      const fnName = fn.handler.split('.').slice(-1)[0];

      if (fnName) {
        const fnNameLastAppearanceIndex = fn.handler.lastIndexOf(fnName);

        // replace only last instance to allow the same name for file and handler
        const fileName = fn.handler.slice(0, Math.max(0, fnNameLastAppearanceIndex));

        // Check if the .ts files exists. If so return that to watch
        if (fs.existsSync(path.join(cwd, `${fileName}ts`))) {
          files.push(`${fileName}ts`);

          continue;
        }

        // Check if the .js files exists. If so return that to watch
        if (fs.existsSync(path.join(cwd, `${fileName}js`))) {
          files.push(`${fileName}js`);

          continue;
        }

        // Can't find the files. Watch will have an exception anyway. So throw one with error.
        log?.error(`Cannot locate handler: ${fileName} not found`);

        throw new Error('TypeScript compilation failed. Please ensure handlers exist with a .ts or .js extension');
      }

      // Can't find the files. Watch will have an exception anyway. So throw one with error.
      log?.error('Cannot locate handler');

      throw new Error('TypeScript compilation failed. Please ensure handlers exist with a ext .ts or .js extension');
    }
  }

  return files;
};

const linkOrCopy = async (srcPath: string, dstPath: string, type?: fs.SymlinkType): Promise<void> => {
  try {
    return fs.ensureSymlink(srcPath, dstPath, type);
  } catch (error) {
    if (error.code === 'EPERM' && error.errno === -4048) {
      return fs.copy(srcPath, dstPath);
    }

    throw error;
  }
};

const getFileSize = async (path: string, log: Plugin.Logging['log']): Promise<string> => {
  try {
    const stats = await fs.lstat(path);
    const size = prettyBytes(stats.size);

    if (stats.size < 1_000_000) {
      return chalk.green(size);
    } else if (stats.size < 10_000_000) {
      return chalk.yellow(size);
    } else {
      return chalk.red(size);
    }
  } catch (error) {
    log.error(error.message);

    return chalk.gray('unknown');
  }
};

const trimPathSeparators = (srcPath: string): string => {
  return srcPath
    .split(path.sep)
    .filter((segment) => segment)
    .join(path.sep);
};

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const stats = await fs.lstat(path);

    return stats.isDirectory();
  } catch {
    return false;
  }
};

export { extractFilenames, linkOrCopy, getFileSize, trimPathSeparators, isDirectory };
