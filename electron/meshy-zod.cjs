'use strict';
const { z } = require('zod');
module.exports = {
  z: {
    ...z,
    record(key, value, options) {
      return arguments.length === 1 ? z.record(z.string(), key) : z.record(key, value, options);
    }
  }
};
