import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/prototypes/universal-board/index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/prototypes/universal-board/styles.css', import.meta.url), 'utf8');

test('classroom UI cannot offer retired mooring choices or truncate the drawn route', () => {
  assert.doesNotMatch(app, /pendingMooringChoice|chooseMooringStop|legalMooringStops|mooringSelection|stopNodeId|mooringRecallNodeId/);
  assert.doesNotMatch(html, /mooring-choice|mooring-keep|mooring-options|停靠锚/);
  assert.doesNotMatch(styles, /mooring-choice|mooring-keep|mooring-candidate|harbor-tool-badge/);
  assert.match(app, /chooseRouteForMove\(/, 'route decisions remain available');
  assert.match(app, /chooseCoinExchangeAtStation\(/, 'coin exchange remains available');
  assert.match(html, /id="route-choice-stage"/);
  assert.match(html, /id="coin-exchange-stage"/);
});

test('legacy anchor holdings have no HUD, reward announcement or sound path', () => {
  assert.doesNotMatch(app, /anchorHeldBySeat|mooring_anchor_|playMooringAnchor|harbor-tool-badge|停靠锚/);
  // 2026-10-19: the user also retired the remaining decorative crane.
  assert.doesNotMatch(app, /appendMooringCrane|mooring-crane-device|港口吊机/,
    'retired crane scenery must not reappear on current or restored harbor boards');
});
