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

test('project workspace root, heading, back, and planning controls', async () => {
  const { render, escape } = await setup();

  const projectWithPlan = {
    id: 'proj-123',
    name: 'Sample Project',
    plan: { revision: 1 }
  };

  const html = render({
    project: projectWithPlan,
    escape
  });

  // Root data-project-workspace=id
  assert.ok(html.includes('data-project-workspace="proj-123"'), 'root includes data-project-workspace attribute');

  // Heading id=project-workspace-title tabindex=-1
  assert.ok(html.includes('id="project-workspace-title"'), 'heading has id project-workspace-title');
  assert.ok(html.includes('tabindex="-1"'), 'heading has tabindex -1');
  assert.ok(html.includes('Sample Project'), 'heading includes project name');

  // Back button data-project-back
  assert.ok(html.includes('data-project-back'), 'back button has data-project-back');

  // Planning button data-project-plan=id when plan exists
  assert.ok(html.includes('data-project-plan="proj-123"'), 'plan button rendered when plan exists');

  // When plan does not exist, planning button must be omitted
  const projectWithoutPlan = {
    id: 'proj-456',
    name: 'Unplanned Project'
  };
  const htmlNoPlan = render({
    project: projectWithoutPlan,
    escape
  });
  assert.ok(!htmlNoPlan.includes('data-project-plan='), 'plan button omitted when plan is missing');
});

test('tabs buttons have data-project-tab and aria-pressed attributes', async () => {
  const { render, escape } = await setup();
  const project = { id: 'proj-1', name: 'Tabs Test' };

  // Default tab is overview
  const defaultHtml = render({ project, escape });
  assert.ok(defaultHtml.includes('data-project-tab="overview" aria-pressed="true"'));
  assert.ok(defaultHtml.includes('data-project-tab="work" aria-pressed="false"'));
  assert.ok(defaultHtml.includes('data-project-tab="outputs" aria-pressed="false"'));
  assert.ok(defaultHtml.includes('data-project-tab="knowledge" aria-pressed="false"'));

  // Active work tab
  const workHtml = render({ project, tab: 'work', escape });
  assert.ok(workHtml.includes('data-project-tab="overview" aria-pressed="false"'));
  assert.ok(workHtml.includes('data-project-tab="work" aria-pressed="true"'));
  assert.ok(workHtml.includes('data-project-tab="outputs" aria-pressed="false"'));
  assert.ok(workHtml.includes('data-project-tab="knowledge" aria-pressed="false"'));

  // Active outputs tab
  const outputsHtml = render({ project, tab: 'outputs', escape });
  assert.ok(outputsHtml.includes('data-project-tab="outputs" aria-pressed="true"'));

  // Active knowledge tab
  const knowledgeHtml = render({ project, tab: 'knowledge', escape });
  assert.ok(knowledgeHtml.includes('data-project-tab="knowledge" aria-pressed="true"'));
});

test('scoping: tasks and outputs are strictly scoped to project.id', async () => {
  const { render, escape } = await setup();
  const project = { id: 'proj-alpha', name: 'Alpha' };

  const tasks = [
    { id: 'task-1', projectId: 'proj-alpha', title: 'Alpha Task 1', state: 'implementing' },
    { id: 'task-2', projectId: 'proj-beta', title: 'Beta Task 2', state: 'implementing' },
    { id: 'task-3', projectId: null, title: 'Unscoped Task 3', state: 'implementing' },
    { id: 'task-4', projectId: 'proj-alpha', title: 'Alpha Task 4', state: 'passed' }
  ];

  const workHtml = render({ project, tasks, tab: 'work', escape });
  assert.ok(workHtml.includes('Alpha Task 1'), 'includes Alpha task 1');
  assert.ok(workHtml.includes('Alpha Task 4'), 'includes Alpha task 4');
  assert.ok(!workHtml.includes('Beta Task 2'), 'excludes Beta task');
  assert.ok(!workHtml.includes('Unscoped Task 3'), 'excludes unscoped task');

  const outputs = [
    { id: 'out-1', projectId: 'proj-alpha', title: 'Alpha Report', summary: 'Alpha outcome' },
    { id: 'out-2', projectId: 'proj-gamma', title: 'Gamma Report', summary: 'Gamma outcome' },
    { id: 'out-3', projectId: undefined, title: 'No Project', summary: 'None' }
  ];

  const outputsHtml = render({ project, outputs, tab: 'outputs', escape });
  assert.ok(outputsHtml.includes('data-project-result="out-1"'), 'includes Alpha output');
  assert.ok(outputsHtml.includes('Alpha Report'), 'includes Alpha report title');
  assert.ok(!outputsHtml.includes('out-2'), 'excludes Gamma output');
  assert.ok(!outputsHtml.includes('Gamma Report'), 'excludes Gamma report title');
  assert.ok(!outputsHtml.includes('out-3'), 'excludes output without project ID');
});

test('escaping malicious data: untrusted values and attributes are safely escaped', async () => {
  const { render, escape } = await setup();

  const maliciousProject = {
    id: 'proj-"-evil><script>alert(1)</script>',
    name: 'Project <script>alert("name")</script>',
    goals: '<img src=x onerror=alert("goals")>',
    nextStep: '<b>next</b>"&\'<',
    lastProgress: { summary: '<script>alert("progress")</script>' },
    folders: [
      { label: 'Evil<Folder>', path: 'C:\\Users\\<test>\\"evil"' }
    ]
  };

  const maliciousTasks = [
    {
      id: 'task-"-1',
      projectId: 'proj-"-evil><script>alert(1)</script>',
      title: '<script>alert("task")</script>',
      state: 'implementing',
      criteria: '<iframe src="evil.com"></iframe>',
      size: 'medium"><script>',
      implementer: {
        label: 'Agent<Bad>',
        model: 'model"xss'
      }
    }
  ];

  const maliciousOutputs = [
    {
      id: 'out-"-1',
      projectId: 'proj-"-evil><script>alert(1)</script>',
      title: '<script>alert("output")</script>',
      summary: 'Summary with <marquee>text</marquee>'
    }
  ];

  const maliciousKnowledge = {
    revision: '2"><script>',
    assurance: 'Assurance <script>alert(2)</script>',
    items: [
      {
        id: 'sec-"-evil',
        title: 'Section <script>title</script>',
        kind: 'fact"<script>'
      }
    ]
  };

  // Overview tab escaping
  const overviewHtml = render({ project: maliciousProject, escape });
  assert.ok(!overviewHtml.includes('<script>'), 'raw script tag not injected in overview');
  assert.ok(!overviewHtml.includes('<img src=x onerror='), 'raw img tag not injected in overview');
  assert.ok(overviewHtml.includes('&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;'));
  assert.ok(overviewHtml.includes('&lt;img src=x onerror=alert(&quot;goals&quot;)&gt;'));

  // Work tab escaping
  const workHtml = render({ project: maliciousProject, tasks: maliciousTasks, tab: 'work', escape });
  assert.ok(!workHtml.includes('<iframe'), 'raw iframe tag not injected in work');
  assert.ok(workHtml.includes('&lt;iframe src=&quot;evil.com&quot;&gt;&lt;/iframe&gt;'));
  assert.ok(workHtml.includes('data-task-id="task-&quot;-1"'));

  // Outputs tab escaping
  const outputsHtml = render({ project: maliciousProject, outputs: maliciousOutputs, tab: 'outputs', escape });
  assert.ok(!outputsHtml.includes('<marquee>'), 'raw marquee tag not injected in outputs');
  assert.ok(outputsHtml.includes('data-project-result="out-&quot;-1"'));

  // Knowledge tab escaping
  const knowledgeHtml = render({
    project: maliciousProject,
    knowledge: maliciousKnowledge,
    mode: 'read',
    tab: 'knowledge',
    escape
  });
  assert.ok(!knowledgeHtml.includes('<script>alert(2)</script>'), 'raw script not injected in knowledge');
  assert.ok(knowledgeHtml.includes('data-project-knowledge-read="sec-&quot;-evil"'));
});

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

test('no task-resolution chores or unread badges, stop and report button behavior', async () => {
  const { render, escape } = await setup();
  const project = { id: 'proj-work', name: 'Work Project' };

  const runningStates = ['planning', 'reviewing-plan', 'building', 'implementing', 'checking', 'reviewing', 'queued'];
  const tasks = [
    ...runningStates.map((state, i) => ({
      id: `task-run-${i}`,
      projectId: 'proj-work',
      title: `Task ${state}`,
      state
    })),
    {
      id: 'task-finished-with-history',
      projectId: 'proj-work',
      title: 'Finished Task With History',
      state: 'passed',
      executionHistory: ['round-1']
    },
    {
      id: 'task-finished-with-result',
      projectId: 'proj-work',
      title: 'Finished Task With Result',
      state: 'passed',
      resultId: 'res-42'
    },
    {
      id: 'task-finished-without-report',
      projectId: 'proj-work',
      title: 'Finished Task Without Report',
      state: 'stopped'
    }
  ];

  const html = render({ project, tasks, tab: 'work', escape });

  // No Seen/Accept/Close task chores or unread badges
  assert.ok(!html.includes('Mark as seen'), 'no Mark as seen chore');
  assert.ok(!html.includes('data-task-action="seen"'), 'no seen action');
  assert.ok(!html.includes('data-task-action="accept"'), 'no accept action');
  assert.ok(!html.includes('data-task-action="close"'), 'no close action');
  assert.ok(!html.includes('unread-badge'), 'no unread badge');
  assert.ok(!html.includes('unread'), 'no unread marker');
  assert.ok(!html.includes('auto-integrate'), 'no auto-integration claim');
  assert.ok(!html.includes('auto-merged'), 'no auto-merged claim');

  // Every running state has Stop button
  for (let i = 0; i < runningStates.length; i++) {
    assert.ok(html.includes(`data-project-stop-task="task-run-${i}"`), `running task ${runningStates[i]} has stop button`);
  }

  // Non-running tasks do not have Stop button
  assert.ok(!html.includes('data-project-stop-task="task-finished-with-history"'));
  assert.ok(!html.includes('data-project-stop-task="task-finished-with-result"'));
  assert.ok(!html.includes('data-project-stop-task="task-finished-without-report"'));

  // Finished reports: data-project-task-report=id only when executionHistory/resultId exists
  assert.ok(html.includes('data-project-task-report="task-finished-with-history"'), 'has report button with executionHistory');
  assert.ok(html.includes('data-project-task-report="task-finished-with-result"'), 'has report button with resultId');
  assert.ok(!html.includes('data-project-task-report="task-finished-without-report"'), 'omits report button when neither exists');
});

test('overview prioritizes lastProgress.summary then goals, nextStep, and folders', async () => {
  const { render, escape } = await setup();

  const project = {
    id: 'proj-ov',
    name: 'Overview Project',
    lastProgress: { summary: 'Completed phase one successfully.' },
    goals: 'Deliver a high quality orchestrator.',
    nextStep: 'Begin phase two integration.',
    folders: [
      { label: 'Source', path: 'C:\\Projects\\App' }
    ]
  };

  const html = render({ project, tab: 'overview', escape });

  const progressIndex = html.indexOf('Completed phase one successfully.');
  const goalsIndex = html.indexOf('Deliver a high quality orchestrator.');
  const nextStepIndex = html.indexOf('Begin phase two integration.');
  const foldersIndex = html.indexOf('C:\\Projects\\App');

  assert.ok(progressIndex !== -1, 'progress summary is rendered');
  assert.ok(goalsIndex !== -1, 'goals is rendered');
  assert.ok(nextStepIndex !== -1, 'nextStep is rendered');
  assert.ok(foldersIndex !== -1, 'folders is rendered');

  assert.ok(progressIndex < goalsIndex, 'lastProgress.summary appears before goals');
  assert.ok(goalsIndex < nextStepIndex, 'goals appears before nextStep');
  assert.ok(nextStepIndex < foldersIndex, 'nextStep appears before folders');
});

test('outputs renders buttons with data-project-result and title/summary', async () => {
  const { render, escape } = await setup();
  const project = { id: 'proj-out', name: 'Outputs Project' };

  const outputs = [
    {
      id: 'res-101',
      projectId: 'proj-out',
      title: 'Architecture Blueprint',
      summary: 'Verified architectural patterns and constraints.'
    }
  ];

  const html = render({ project, outputs, tab: 'outputs', escape });
  assert.ok(html.includes('data-project-result="res-101"'));
  assert.ok(html.includes('Architecture Blueprint'));
  assert.ok(html.includes('Verified architectural patterns and constraints.'));
});

test('empty states are concise and factual without decorative dashes or filler', async () => {
  const { render, escape } = await setup();
  const emptyProject = { id: 'proj-empty', name: 'Empty' };

  // Overview empty
  const overviewHtml = render({ project: emptyProject, tab: 'overview', escape });
  assert.ok(overviewHtml.includes('No overview details recorded for this project.'));

  // Work empty
  const workHtml = render({ project: emptyProject, tasks: [], tab: 'work', escape });
  assert.ok(workHtml.includes('No tasks for this project.'));

  // Outputs empty
  const outputsHtml = render({ project: emptyProject, outputs: [], tab: 'outputs', escape });
  assert.ok(outputsHtml.includes('No outputs for this project.'));

  // Knowledge empty entries in read mode
  const knowledgeHtml = render({ project: emptyProject, knowledge: { items: [] }, mode: 'read', tab: 'knowledge', escape });
  assert.ok(knowledgeHtml.includes('No knowledge entries recorded.'));

  // Check across all states for absence of decorative dashes or filler
  for (const snippet of [overviewHtml, workHtml, outputsHtml, knowledgeHtml]) {
    assert.ok(!snippet.includes('—'), 'no decorative em dashes');
    assert.ok(!snippet.includes('•'), 'no middle dot bullets');
  }
});
