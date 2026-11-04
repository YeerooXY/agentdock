'use strict';
const { Scheduler } = require('./scheduler.cjs');

// Compatibility entry point for owner consoles. The application supplies root
// and getSettings, then shares this scheduler with every execution service.
class CapacityReservations extends Scheduler {
  constructor(owners, options = {}) { super(options.root, { ...options, owners }); }
}
module.exports = { CapacityReservations };
