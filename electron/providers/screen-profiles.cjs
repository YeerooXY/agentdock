'use strict';
// Screen and menu facts for the phone. Adapters declare what their CLI draws;
// this module validates those facts and derives the versioned DTO served in the
// phone shell slice. mobile/lib/agent_profile_data.dart is a generated copy used
// when a PC serves no usable profile.
//
// Contract with mobile/lib/agent_profiles.dart:
// - menu.heading and menu.working are case-insensitive. menu.option has three
//   groups: selector, number and label.
// - A provider with support "dialog" has selectors, banner and emptyPrompts.
// - Support "terminal", and any provider the phone does not recognize, stays in
//   the terminal: Paddock offers no tappable choices for it.
const PROFILE_VERSION = 1;
const MAX_PATTERN = 240;
const MENU = Object.freeze({
  heading: '^\\s*((Select|Choose|Set)\\s+(a\\s+)?(model|reasoning|effort)\\b|Advanced Reasoning\\b)',
  option: '^\\s*([›❯>→])?\\s*(\\d{1,2})[.)]\\s+(.+?)\\s*$',
  working: 'esc to interrupt'
});
// Console types outside the registry draw whatever their command prints.
const DYNAMIC_PROVIDERS = Object.freeze(['shell', 'custom']);
const TERMINAL = Object.freeze({ support: 'terminal' });

function validPattern(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_PATTERN) return false;
  try { new RegExp(value); return true; } catch { return false; }
}

// Returns the first problem with an adapter's `screen` object, or ''.
function screenProblem(screen) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return 'screen must be an object';
  for (const key of Object.keys(screen)) if (!['selectors', 'banner', 'emptyPrompts'].includes(key)) return `unknown screen field "${key}"`;
  const { selectors, emptyPrompts } = screen;
  if (!Array.isArray(selectors) || !selectors.length || selectors.length > 4 || new Set(selectors).size !== selectors.length || !selectors.every(item => typeof item === 'string' && item.length === 1 && item.trim())) return 'screen selectors must be distinct single characters';
  if (!validPattern(screen.banner)) return 'screen banner must be a short regular expression';
  if (!Array.isArray(emptyPrompts) || emptyPrompts.length > 8 || !emptyPrompts.every(item => typeof item === 'string' && item.length > 0 && item.length <= 120)) return 'screen emptyPrompts must be short strings';
  return '';
}

function deriveScreenProfiles(adapters) {
  const providers = {};
  for (const { id, screen } of adapters) providers[id] = screen ? { support: 'dialog', selectors: [...screen.selectors], banner: screen.banner, emptyPrompts: [...screen.emptyPrompts] } : { ...TERMINAL };
  for (const id of DYNAMIC_PROVIDERS) providers[id] = { ...TERMINAL };
  return { version: PROFILE_VERSION, menu: { ...MENU }, providers };
}

module.exports = { PROFILE_VERSION, deriveScreenProfiles, screenProblem };
