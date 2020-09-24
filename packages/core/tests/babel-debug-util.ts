import { transform, TransformOptions } from '@babel/core';
import { readJSONSync, readFileSync } from 'fs-extra';
import { join } from 'path';
import { argv } from 'process';

async function run(appDir: string, fileLocalPath: string) {
  let pkg = readJSONSync(join(appDir, 'package.json'));
  if (!pkg['ember-addon'].babel.isParallelSafe) {
    throw new Error(
      `can't use this babel config, it's not parallel safe so we can't load it outside its original prorcess`
    );
  }
  let config = (await import(join(appDir, pkg['ember-addon'].babel.filename))).default;
  let filename = join(appDir, fileLocalPath);
  let src = readFileSync(filename, 'utf8');
  process.stdout.write(transform(src, Object.assign({ filename }, config) as TransformOptions)!.code!);
}

if (argv.length < 4) {
  console.log(
    `
    Usage:
      node babel-debug-util.js [pathToAppOutputDir] [localPathToFile]

      Given an app that has been prepared by Embroider (the stage2 output)
      and the local path to a JS file within that app, run the app's babel
      config on that file and print the results.
  `
  );
  process.exit(-1);
}

run(process.argv[2], process.argv[3]).catch(err => {
  console.log(err);
  process.exit(-1);
});
