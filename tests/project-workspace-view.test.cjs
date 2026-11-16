'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

let renderProjectWorkspace, escape;

async function setup() {
  if (!renderProjectWorkspace) {
    const mod = await import('../src/pages/project-workspace.js');
    renderProjectWorkspace = mod.renderProjectWorkspace;
  }
  if (!escape) {
    const escMod = await import('../src/html-escape.js');
    escape = escMod.escapeHtml;
  }
  return { render: renderProjectWorkspace, escape };
}

test('off mode: no index control, displays off message, select has valid values and no automatic', async () => {
  const { render, escape } = await setup();

  const project = {
    id: 'proj-k-1',
    name: 'Knowledge Project',
    knowledgeMode: 'inherit'
  };

  const knowledge = {
    revision: 3,
    assurance: 'Stored metadata only.',
    items: [{ id: 'sec-1', title: 'Inventory 1' }]
  };

  // Mode: off
  const offHtml = render({
    project,
    knowledge,
    mode: 'off',
    tab: 'knowledge',
    escape
  });

  // Off message
  assert.ok(offHtml.includes('Project knowledge is off.'), 'displays Project knowledge is off.');

  // Off: NO index control (data-project-inventory) and NO read buttons
  assert.ok(!offHtml.includes('data-project-inventory'), 'Off has no index control');
  assert.ok(!offHtml.includes('data-project-knowledge-read'), 'Off has no entry buttons');

  // Select options: inherit, off, read, and NO automatic
  assert.ok(offHtml.includes('data-project-knowledge-mode'), 'select has data-project-knowledge-mode');
  assert.ok(offHtml.includes('value="inherit" selected'), 'inherit is selected by default');
  assert.ok(offHtml.includes('value="off"'), 'has off option');
  assert.ok(offHtml.includes('value="read"'), 'has read option');
  assert.ok(offHtml.includes('value="automatic"'), 'automatic override is explicit');
  assert.ok(offHtml.includes('Automatic when enabled in app settings'));

  // Project with knowledgeMode: read
  const projectReadMode = { ...project, knowledgeMode: 'read' };
  const readSelectHtml = render({ project: projectReadMode, mode: 'off', tab: 'knowledge', escape });
  assert.ok(readSelectHtml.includes('value="read" selected'), 'reflects project knowledgeMode');

  // Mode: read enables inventory and entries
  const readHtml = render({
    project,
    knowledge,
    mode: 'read',
    tab: 'knowledge',
    escape
  });

  assert.ok(readHtml.includes('data-project-inventory="proj-k-1"'), 'mode read enables data-project-inventory button');
  assert.ok(readHtml.includes('data-project-knowledge-read="sec-1"'), 'mode read displays entry buttons');
  assert.ok(readHtml.includes('Revision 3'), 'mode read displays revision');
  assert.ok(readHtml.includes('Stored metadata only.'), 'mode read displays explicit unverified assurance');
});



test('project knowledge omits legacy overview, progress and work history even with saved data', async () => {
  const {render,escape}=await setup();
  const html=render({project:{id:'p',name:'Project',goals:'OLD_GOALS',nextStep:'OLD_NEXT',lastProgress:{summary:'OLD_PROGRESS'},folders:[],plan:{revision:9}},tasks:[{id:'t',projectId:'p',title:'OLD_TASK',executionHistory:{id:'t'}}],mode:'off',escape});
  assert.ok(html.includes('Project')); assert.ok(html.includes('data-project-back'));
  assert.doesNotMatch(html,/OLD_GOALS|OLD_NEXT|OLD_PROGRESS|OLD_TASK|data-project-tab|Last progress|Saved goals|Saved next step|task-report/);
});

test('knowledge labels and project identity remain escaped', async () => {
  const {render,escape}=await setup();const html=render({project:{id:'p',name:'<script>bad</script>'},mode:'read',knowledge:{items:[{id:'entry',title:'<img src=x onerror=bad()>',kind:'reference'}]},escape});
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('data-project-knowledge-read="entry"'));
});
