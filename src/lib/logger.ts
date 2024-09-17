import Plugin, { Progress } from 'serverless/classes/Plugin';

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
  progress: {
    get: (name: string): Progress => {
      return {
        namespace: 'namespace',
        name,
        update: (message: string) => console.log(message),
        info: (message: string) => console.log(message),
        notice: (message: string) => console.log(message),
        remove: () => console.log('remove'),
      };
    },
    create: (args: { message?: string; name?: string }): Progress => {
      return {
        namespace: 'namespace',
        name: args.name || 'name',
        update: (message: string) => console.log(message),
        info: (message: string) => console.log(message),
        notice: (message: string) => console.log(message),
        remove: () => console.log('remove'),
      };
    },
  },
};

export { consoleLogger };
