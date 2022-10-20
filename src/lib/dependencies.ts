import fs from 'fs';
import path from 'path';
import recursiveReaddir from 'recursive-readdir';

const addFile = async (
  dependencies: string[],
  baseDir: string,
  dependency: string,
  filename: string
): Promise<void> => {
  if (fs.existsSync(path.join(baseDir, path.dirname(dependency), filename))) {
    dependencies.push(path.join(path.dirname(dependency), filename));
  }

  return Promise.resolve();
};

const addDirectory = async (
  dependencies: string[],
  baseDir: string,
  dependency: string,
  dirname: string
): Promise<void> => {
  if (fs.existsSync(path.join(baseDir, path.dirname(dependency), dirname))) {
    const files = await recursiveReaddir(path.join(baseDir, path.dirname(dependency), dirname));

    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.map')) {
        continue;
      }

      const filename = path.join(path.dirname(dependency).replace(baseDir, ''), dirname, path.basename(file));

      dependencies.push(filename);
    }
  }
};

const handleSpecialCases = async (dependencies: string[], baseDir: string): Promise<string[]> => {
  for (const dependency of dependencies) {
    if (dependency.endsWith('aws-param-store/lib/index.js')) {
      await addFile(dependencies, baseDir, dependency, 'ssm_sync.js');
    } else if (dependency.endsWith('datadog-lambda-js/dist/index.js')) {
      await addFile(dependencies, baseDir, dependency, 'handler.js');
      await addDirectory(dependencies, baseDir, dependency, 'runtime');
    }
  }

  return dependencies;
};

export { handleSpecialCases };
