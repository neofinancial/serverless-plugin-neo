import fs from 'fs-extra';
import path from 'path';
import ts from 'typescript';
import Plugin from 'serverless/classes/Plugin';

const getSourceFiles = (rootFileNames: string[], options: ts.CompilerOptions): string[] => {
  const program = ts.createProgram(rootFileNames, options);
  const programFiles = program
    .getSourceFiles()
    .map((file) => file.fileName)
    .filter((file) => {
      return !file.split(path.sep).includes('node_modules');
    });

  return programFiles;
};

const getTypeScriptConfig = (
  cwd: string,
  tsconfigFile: string,
  buildDirectory: string,
  log: Plugin.Logging['log']
): ts.CompilerOptions => {
  const configFilePath = path.join(cwd, tsconfigFile);

  if (fs.existsSync(configFilePath)) {
    const configFileText = fs.readFileSync(configFilePath).toString();
    const result = ts.parseConfigFileTextToJson(configFilePath, configFileText);

    if (result.error) {
      try {
        throw new Error(JSON.stringify(result.error));
      } catch {
        throw new Error('Invalid tsconfig file: is this file JSON format?');
      }
    }

    const tsconfig = ts.parseJsonConfigFileContent(result.config, ts.sys, path.dirname(configFilePath));

    if (tsconfig.errors.length > 0) {
      throw new Error(JSON.stringify(tsconfig.errors));
    }

    log.info(`Using tsconfig: ${tsconfigFile}`);

    // disallow overriding rootDir
    if (tsconfig.options.rootDir) {
      log.warning('"rootDir" from tsconfig.json is overridden');
    }

    // disallow overriding outDir
    if (tsconfig.options.outDir) {
      log.warning('"outDir" from tsconfig.json is overridden');
    }

    tsconfig.options.rootDir = cwd;
    tsconfig.options.outDir = buildDirectory;

    return tsconfig.options;
  } else {
    throw new Error(`tsconfig file not found: ${tsconfigFile}`);
  }
};

const compile = async (
  fileNames: string[],
  options: ts.CompilerOptions,
  log: Plugin.Logging['log']
): Promise<string[]> => {
  options.listEmittedFiles = true;

  const program = ts.createProgram(fileNames, options);
  const emitResult = program.emit();
  const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  allDiagnostics.forEach((diagnostic) => {
    if (diagnostic.file && diagnostic.start) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        log.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
      } else if (diagnostic.category === ts.DiagnosticCategory.Warning) {
        log.warning(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
      } else {
        log.info(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
      }
    }
  });

  if (emitResult.emitSkipped) {
    throw new Error('TypeScript compilation failed');
  }

  if (emitResult.emittedFiles) {
    return emitResult.emittedFiles.filter((filename) => filename.endsWith('.js'));
  }

  throw new Error('TypeScript compilation failed');
};

export default {
  getSourceFiles,
  getTypeScriptConfig,
  compile,
};
