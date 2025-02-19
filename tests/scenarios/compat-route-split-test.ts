import { PreparedApp } from 'scenario-tester';
import { appScenarios, renameApp } from './scenarios';
import { readFileSync } from 'fs';
import { join } from 'path';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

import { ExpectFile, expectFilesAt } from '@embroider/test-support';
import { throwOnWarnings } from '@embroider/core';
import merge from 'lodash/merge';
import { Audit, AuditResults } from '@embroider/compat/src/audit';

let splitScenarios = appScenarios.map('compat-splitAtRoutes', app => {
  renameApp(app, 'my-app');
  merge(app.files, {
    'ember-cli-build.js': `
      'use strict';

      const EmberApp = require('ember-cli/lib/broccoli/ember-app');
      const { maybeEmbroider } = require('@embroider/test-setup');

      module.exports = function (defaults) {
        let app = new EmberApp(defaults, {});
        return maybeEmbroider(app, {
          staticAddonTrees: true,
          staticAddonTestSupportTrees: true,
          staticHelpers: true,
          staticModifiers: true,
          staticComponents: true,
          splitAtRoutes: ['people'],
        });
      };
    `,
    app: {
      components: {
        'welcome.hbs': '',
        'all-people.js': 'export default class {}',
        'one-person.hbs': '{{capitalize @person.name}}',
        'unused.hbs': '',
      },
      helpers: {
        'capitalize.js': 'export default function(){}',
      },
      modifiers: {
        'auto-focus.js': 'export default function(){}',
      },
    },
  });
  app.linkDependency('@ember/string', { baseDir: __dirname });
});

splitScenarios
  .map('basic', app => {
    merge(app.files, {
      app: {
        templates: {
          'index.hbs': '<Welcome/>',
          'people.hbs': '<h1>People</h1>{{outlet}}',
          people: {
            'index.hbs': '<AllPeople/>',
            'show.hbs': '<OnePerson/>',
            'edit.hbs': '<input {{auto-focus}} />',
          },
        },
        controllers: {
          'index.js': '',
          'people.js': '',
          people: {
            'show.js': '',
          },
        },
        routes: {
          'index.js': '',
          'people.js': '',
          people: {
            'show.js': '',
          },
        },
      },
    });
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      throwOnWarnings(hooks);

      let app: PreparedApp;
      let expectFile: ExpectFile;

      hooks.before(async assert => {
        app = await scenario.prepare();
        let result = await app.execute('ember build', { env: { STAGE2_ONLY: 'true' } });
        assert.equal(result.exitCode, 0, result.output);
      });

      hooks.beforeEach(assert => {
        expectFile = expectFilesAt(readFileSync(join(app.dir, 'dist/.stage2-output'), 'utf8'), { qunit: assert });
      });

      test('has no components in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('all-people');
        expectFile('./assets/my-app.js').doesNotMatch('welcome');
        expectFile('./assets/my-app.js').doesNotMatch('unused');
      });

      test('has no helpers in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('capitalize');
      });

      test('has no modifiers in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('auto-focus');
      });

      test('has non-split controllers in main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('controllers/index');
      });

      test('has non-split route templates in main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('templates/index');
      });

      test('has non-split routes in main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('routes/index');
      });

      test('does not have split controllers in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('controllers/people');
        expectFile('./assets/my-app.js').doesNotMatch('controllers/people/show');
      });

      test('does not have split route templates in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('templates/people');
        expectFile('./assets/my-app.js').doesNotMatch('templates/people/index');
        expectFile('./assets/my-app.js').doesNotMatch('templates/people/show');
      });

      test('does not have split routes in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('routes/people');
        expectFile('./assets/my-app.js').doesNotMatch('routes/people/show');
      });

      test('dynamically imports the route entrypoint from the main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('import("./_route_/people.js")');
      });

      test('has split controllers in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').matches('controllers/people');
        expectFile('./assets/_route_/people.js').matches('controllers/people/show');
      });

      test('has split route templates in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').matches('templates/people');
        expectFile('./assets/_route_/people.js').matches('templates/people/index');
        expectFile('./assets/_route_/people.js').matches('templates/people/show');
      });

      test('has split routes in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').matches('routes/people');
        expectFile('./assets/_route_/people.js').matches('routes/people/show');
      });

      test('has no components in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').doesNotMatch('all-people');
        expectFile('./assets/_route_/people.js').doesNotMatch('welcome');
        expectFile('./assets/_route_/people.js').doesNotMatch('unused');
      });

      test('has no helpers in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').doesNotMatch('capitalize');
      });

      test('has no helpers in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').doesNotMatch('auto-focus');
      });

      Qmodule('audit', function (hooks) {
        let auditResults: AuditResults;
        hooks.before(async function () {
          let audit = new Audit(expectFile.basePath);
          auditResults = await audit.run();
        });

        test('has no issues', function (assert) {
          assert.deepEqual(auditResults.findings, []);
        });

        test('helper is consumed only from the template that uses it', function (assert) {
          assert.deepEqual(auditResults.modules['./helpers/capitalize.js']?.consumedFrom, [
            './components/one-person.hbs',
          ]);
        });

        test('component is consumed only from the template that uses it', function (assert) {
          assert.deepEqual(auditResults.modules['./components/one-person.js']?.consumedFrom, [
            './templates/people/show.hbs',
          ]);
        });

        test('modifier is consumed only from the template that uses it', function (assert) {
          assert.deepEqual(auditResults.modules['./modifiers/auto-focus.js']?.consumedFrom, [
            './templates/people/edit.hbs',
          ]);
        });

        test('does not include unused component', function (assert) {
          assert.strictEqual(auditResults.modules['./components/unused.hbs'], undefined);
        });
      });
    });
  });

splitScenarios
  .map('pods', app => {
    merge(app.files, {
      app: {
        pods: {
          index: {
            'template.hbs': '<Welcome/>',
            'controller.js': '',
            'route.js': '',
          },
          people: {
            'template.hbs': '<h1>People</h1>{{outlet}}',
            'controller.js': '',
            'route.js': '',
            index: {
              'template.hbs': '<AllPeople/>',
            },
            show: {
              'template.hbs': '<OnePerson/>',
              'controller.js': '',
              'route.js': '',
            },
            edit: {
              'template.hbs': '<input {{auto-focus}} />',
              'controller.js': '',
              'route.js': '',
            },
          },
        },
      },
      config: {
        'environment.js': `
            module.exports = function(environment) {
            let ENV = {
              modulePrefix: 'my-app',
              podModulePrefix: 'my-app/pods',
              environment,
              rootURL: '/',
              locationType: 'auto',
              EmberENV: {
                FEATURES: {
                },
                EXTEND_PROTOTYPES: {
                  Date: false
                }
              },
              APP: {}
            };
            return ENV;
            };`,
      },
    });
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      throwOnWarnings(hooks);

      let app: PreparedApp;
      let expectFile: ExpectFile;

      hooks.before(async assert => {
        app = await scenario.prepare();
        let result = await app.execute('ember build', { env: { STAGE2_ONLY: 'true' } });
        assert.equal(result.exitCode, 0, result.output);
      });

      hooks.beforeEach(assert => {
        expectFile = expectFilesAt(readFileSync(join(app.dir, 'dist/.stage2-output'), 'utf8'), { qunit: assert });
      });

      test('has no components in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('all-people');
        expectFile('./assets/my-app.js').doesNotMatch('welcome');
        expectFile('./assets/my-app.js').doesNotMatch('unused');
      });

      test('has no helpers in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('capitalize');
      });

      test('has no modifiers in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('auto-focus');
      });

      test('has non-split controllers in main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('pods/index/controller');
      });

      test('has non-split route templates in main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('pods/index/template');
      });

      test('has non-split routes in main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('pods/index/route');
      });

      test('does not have split controllers in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('pods/people/controller');
        expectFile('./assets/my-app.js').doesNotMatch('pods/people/show/controller');
      });

      test('does not have split route templates in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('pods/people/template');
        expectFile('./assets/my-app.js').doesNotMatch('pods/people/index/template');
        expectFile('./assets/my-app.js').doesNotMatch('pods/people/show/template');
      });

      test('does not have split routes in main entrypoint', function () {
        expectFile('./assets/my-app.js').doesNotMatch('pods/people/route');
        expectFile('./assets/my-app.js').doesNotMatch('pods/people/show/route');
      });

      test('dynamically imports the route entrypoint from the main entrypoint', function () {
        expectFile('./assets/my-app.js').matches('import("./_route_/people.js")');
      });

      test('has split controllers in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').matches('pods/people/controller');
        expectFile('./assets/_route_/people.js').matches('pods/people/show/controller');
      });

      test('has split route templates in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').matches('pods/people/template');
        expectFile('./assets/_route_/people.js').matches('pods/people/index/template');
        expectFile('./assets/_route_/people.js').matches('pods/people/show/template');
      });

      test('has split routes in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').matches('pods/people/route');
        expectFile('./assets/_route_/people.js').matches('pods/people/show/route');
      });

      test('has no components in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').doesNotMatch('all-people');
        expectFile('./assets/_route_/people.js').doesNotMatch('welcome');
        expectFile('./assets/_route_/people.js').doesNotMatch('unused');
      });

      test('has no helpers in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').doesNotMatch('capitalize');
      });

      test('has no modifiers in route entrypoint', function () {
        expectFile('./assets/_route_/people.js').doesNotMatch('auto-focus');
      });

      Qmodule('audit', function (hooks) {
        let auditResults: AuditResults;
        hooks.before(async function () {
          let audit = new Audit(expectFile.basePath);
          auditResults = await audit.run();
        });

        test('has no issues', function (assert) {
          assert.deepEqual(auditResults.findings, []);
        });

        test('helper is consumed only from the template that uses it', function (assert) {
          assert.deepEqual(auditResults.modules['./helpers/capitalize.js']?.consumedFrom, [
            './components/one-person.hbs',
          ]);
        });

        test('component is consumed only from the template that uses it', function (assert) {
          assert.deepEqual(auditResults.modules['./components/one-person.js']?.consumedFrom, [
            './pods/people/show/template.hbs',
          ]);
        });

        test('modifier is consumed only from the template that uses it', function (assert) {
          assert.deepEqual(auditResults.modules['./modifiers/auto-focus.js']?.consumedFrom, [
            './pods/people/edit/template.hbs',
          ]);
        });

        test('does not include unused component', function (assert) {
          assert.strictEqual(auditResults.modules['./components/unused.hbs'], undefined);
        });
      });
    });
  });
