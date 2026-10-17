import test from 'node:test';
import assert from 'node:assert/strict';
import { screenNavigationPlan } from '../lib/canvas-v2/screen-navigation-plan';

const navigation = { position: 'fixed', scrollRegionSelector: '#content', contentInsetBottom: 96, activeTabId: 'home', tabs: [{ id: 'home', label: 'Home', destination: 'Home view', basis: 'observed',controlSelector:'#home',viewSelector:'#title',expectedText:'Home overview' }, { id: 'work', label: 'Work', destination: 'Mock work list; preserve app identity', basis: 'inferred',controlSelector:'#work',viewSelector:'#title',expectedText:'Work projects' }] };
test('navigation planning distinguishes reference tabs from inferred destinations and reserves scroll clearance', () => {
  assert.deepEqual(screenNavigationPlan(navigation, 800), navigation);
  assert.equal(screenNavigationPlan({ ...navigation, position: 'sticky' }, 800).position, 'sticky');
  assert.throws(() => screenNavigationPlan({ ...navigation, activeTabId: 'missing' }, 800), /active.*must exist/);
  assert.throws(() => screenNavigationPlan({ ...navigation, tabs: [navigation.tabs[0], navigation.tabs[0]] }, 800), /distinct/);
  assert.throws(() => screenNavigationPlan({ ...navigation, contentInsetBottom: 801 }, 800), /inset/);
  assert.throws(() => screenNavigationPlan({ ...navigation, contentInsetBottom: '96' }, 800), /inset/);
  assert.throws(() => screenNavigationPlan({ ...navigation, scrollRegionSelector: '' }, 800), /scrolling/);
  assert.throws(() => screenNavigationPlan({ ...navigation, tabs: [{ ...navigation.tabs[0], destination: '' }] }, 800), /destination/);
});
