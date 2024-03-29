# Serverless Plugin Neo Changelog

## 0.3.2 - November 21, 2022

- Fix a bug that prevented TypeScript compilation errors from failing the build

## 0.3.1 - October 31, 2022

- Fix a bug that only copied included files if they didn't already exist in the destination

## 0.3.0 - October 31, 2022

- Watch all included files, not just TypeScript files

## 0.2.1 - October 20, 2022

- Add support for tsx files

## 0.2.0 - April 25, 2022

- Improve error handling when linking dependencies
- Bundle source files that aren't included by TypeScript

## 0.1.6 - April 25, 2022

- Fix race condition when linking dependencies

## 0.1.5 - April 21, 2022

- Build automatically before publish
- Fix build

## 0.1.4 - April 21, 2022

- Remove console.log statement

## 0.1.3 - April 21, 2022

- Move `recursive-readdir` to dependencies

## 0.1.2 - April 21, 2022

- Add special handling for `datadog-lambda-js`

## 0.1.1 - April 20, 2022

- Add handling for specific dependencies that can't be traced fully
- Improve package size display
- Update dependencies

## 0.1.0 - April 18, 2022

- Initial release
