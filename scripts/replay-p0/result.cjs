'use strict';
const required = ['normal', 'barrier', 'finiteCleanup', 'limits', 'isolation'];
const limitations = ['hung-processor', 'hung-sdk-worker', 'direct-restart'];
function exitCode(report) {
  return required.every(key => report[key] === 'pass') && Array.isArray(report.expectedLimitations)
    && limitations.every(name => report.expectedLimitations.some(x => x.case === name && x.observed === true)) ? 0 : 1;
}
module.exports = { exitCode };
