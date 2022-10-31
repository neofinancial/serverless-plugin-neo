import { watchFile, unwatchFile, Stats } from 'fs';
import ts from 'typescript';

import typescript from './typescript';

export function watchFiles(
  rootFileNames: string[],
  extrasFilenames: string[],
  tsconfig: ts.CompilerOptions,
  callback: () => void
): void {
  let watchedFiles = [...typescript.getSourceFiles(rootFileNames, tsconfig), ...extrasFilenames];

  function watchCallback(curr: Stats, prev: Stats): void {
    // Check timestamp
    if (+curr.mtime <= +prev.mtime) {
      return;
    }

    callback();

    // use can reference not watched yet file or remove reference to already watched
    const newWatchFiles = [...typescript.getSourceFiles(rootFileNames, tsconfig), ...extrasFilenames];

    watchedFiles.forEach((fileName) => {
      if (!newWatchFiles.includes(fileName)) {
        unwatchFile(fileName, watchCallback);
      }
    });

    newWatchFiles.forEach((fileName) => {
      if (!watchedFiles.includes(fileName)) {
        watchFile(fileName, { persistent: true, interval: 250 }, watchCallback);
      }
    });

    watchedFiles = newWatchFiles;
  }

  watchedFiles.forEach((fileName) => {
    watchFile(fileName, { persistent: true, interval: 250 }, watchCallback);
  });
}
