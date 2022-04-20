import fs from 'fs';
import path from 'path';

const handleSpecialCases = (dependencies: string[], baseDir: string): string[] => {
  for (const dependency of dependencies) {
    if (dependency.endsWith('aws-param-store/lib/index.js')) {
      if (fs.existsSync(path.join(baseDir, path.dirname(dependency), 'ssm_sync.js'))) {
        dependencies.push(path.join(path.dirname(dependency), 'ssm_sync.js'));
      }
    }
  }

  return dependencies;
};

export { handleSpecialCases };
