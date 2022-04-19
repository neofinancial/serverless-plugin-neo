import Plugin from 'serverless/classes/Plugin';

const consoleLogger: Plugin.Logging = {
  log: {
    error: (text: string) => console.error(text),
    warning: (text: string) => console.warn(text),
    notice: (text: string) => console.log(text),
    info: (text: string) => console.info(text),
    debug: (text: string) => console.debug(text),
    verbose: (text: string) => console.log(text),
    success: (text: string) => console.log(text),
  },
  writeText: (text: string | string[]) => {
    console.log(text);
  },
};

export { consoleLogger };
