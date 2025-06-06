// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import type {ElementHandle, Page} from 'puppeteer-core';

import type {StepType} from '../../../front_end/panels/recorder/models/Schema.js';
import {
  $$,
  click,
  getBrowserAndPages,
  getResourcesPath,
  renderCoordinatorQueueEmpty,
  selectOption,
  waitFor,
  waitForAnimationFrame,
  waitForAria,
  waitForFunction,
} from '../../../test/shared/helper.js';

import {
  clickSelectButtonItem,
  createAndStartRecording,
  enableAndOpenRecorderPanel,
  getCurrentRecording,
  processAndVerifyBaseRecording,
  stopRecording,
  toggleCodeView,
} from './helpers.js';

describe('Recorder', function() {
  if (this.timeout() !== 0) {
    this.timeout(5000);
  }

  async function assertStepList(expectedStepList: string[]) {
    const {frontend} = getBrowserAndPages();
    const actualStepList = await frontend.$$eval(
        'pierce/.step:not(.is-start-of-group) .action .main-title',
        actions => actions.map(e => (e as HTMLElement).innerText),
    );
    assert.deepEqual(actualStepList, expectedStepList);
  }

  async function record() {
    const {target, frontend} = getBrowserAndPages();
    await target.bringToFront();
    await frontend.bringToFront();
    await frontend.waitForSelector('pierce/.settings');
    await target.bringToFront();
    const element = await target.waitForSelector('a[href="recorder2.html"]');
    await element?.click();
    await frontend.bringToFront();
  }

  describe('UI', () => {
    beforeEach(async () => {
      await enableAndOpenRecorderPanel('recorder/recorder.html');
      await createAndStartRecording();
    });

    describe('Record', () => {
      it('should record a simple flow', async () => {
        const {target, frontend} = getBrowserAndPages();
        await target.bringToFront();
        await frontend.bringToFront();
        await frontend.waitForSelector('pierce/.settings');
        await target.bringToFront();
        await target.click('#test');
        await frontend.bringToFront();

        await stopRecording();
        await assertStepList([
          'Set viewport',
          'Navigate' as StepType.Navigate,
          'Click' as StepType.Click,
        ]);
      });

      it('should replay a simple flow', async () => {
        const {target, frontend} = getBrowserAndPages();
        await target.bringToFront();
        await frontend.bringToFront();
        await frontend.waitForSelector('pierce/.settings');
        await target.bringToFront();
        const element = await target.waitForSelector(
            'a[href="recorder2.html"]',
        );
        await element?.click();
        await frontend.bringToFront();

        await stopRecording();

        const steps = await frontend.$$eval(
            'pierce/.step:not(.is-start-of-group) .action .main-title',
            actions => actions.map(e => (e as HTMLElement).innerText),
        );
        assert.deepEqual(steps, [
          'Set viewport',
          'Navigate' as StepType.Navigate,
          'Click' as StepType.Click,
        ]);

        await target.goto('about:blank');

        // Wait for all steps to complete successfully
        const promise = waitForFunction(async () => {
          const successfulSteps = await frontend.$$eval(
              'pierce/.step:not(.is-start-of-group).is-success .action .main-title',
              actions => actions.map(e => (e as HTMLElement).innerText),
          );
          return steps.length === successfulSteps.length;
        });
        await clickSelectButtonItem(
            'Normal (Default)',
            'devtools-replay-section',
        );
        await target.bringToFront();
        await promise;
        assert.strictEqual(
            target.url(),
            `${getResourcesPath()}/recorder/recorder2.html`,
        );
      });

      it('should rename a recording', async () => {
        const {target, frontend} = getBrowserAndPages();
        await target.bringToFront();
        await frontend.bringToFront();
        await frontend.waitForSelector('pierce/.settings');
        await target.bringToFront();
        await target.click('#test');
        await frontend.bringToFront();
        await stopRecording();

        const button = await waitForAria('Edit title');
        await button.click();
        const input = (await frontend.waitForSelector(
                          'pierce/#title-input',
                          )) as ElementHandle<HTMLInputElement>;
        await input.type(' with Hello world', {delay: 50});
        await input.evaluate(input => {
          input.blur();
        });

        const recording = await getCurrentRecording();
        assert.strictEqual(recording.title, 'New Recording with Hello world');
      });

      describe('Selector picker', () => {
        async function pickSelectorsForQuery(
            query: string,
            frontend: Page,
            target: Page,
        ) {
          await renderCoordinatorQueueEmpty();

          // Activate selector picker.
          const picker = await frontend.waitForSelector(
              'pierce/.selector-picker',
          );
          await picker!.click();

          // Click element and wait for selector picking to stop.
          await target.bringToFront();
          const element = await target.waitForSelector(query);
          await element!.click();
        }

        async function expandStep(frontend: Page, index: number) {
          await frontend.bringToFront();
          // TODO(crbug.com/1411283): figure out why misclicks happen here.
          await waitForAnimationFrame();
          await click(`.step[data-step-index="${index}"] .action`);
          await waitFor('.expanded');
        }

        // Flaky test
        it.skip('[crbug.com/402695414] should select through the selector picker', async () => {
          const {target, frontend} = getBrowserAndPages();
          await frontend.bringToFront();
          await frontend.waitForSelector('pierce/.settings');

          await target.bringToFront();
          const element = await target.waitForSelector(
              'a[href="recorder2.html"]',
          );
          await element?.click();

          await stopRecording();

          await expandStep(frontend, 2);
          await pickSelectorsForQuery('#test-button', frontend, target);
          const recording = await getCurrentRecording();
          assert.deepEqual(processAndVerifyBaseRecording(recording), {
            steps: [{
              type: 'click',
              assertedEvents: [{
                type: 'navigation',
                url: 'https://localhost:<test-port>/test/e2e/resources/recorder/recorder2.html',
                title: ''
              }],
              target: 'main',
              selectors: [
                'aria/Test button',
                '#test-button',
                'xpath///*[@id="test-button"]',
                'pierce/#test-button',
                'text/Test button',
              ]
            }]
          });
        });

        // Flaky test
        it.skip('[crbug.com/383478771] should select through the selector picker twice', async () => {
          const {target, frontend} = getBrowserAndPages();
          await frontend.bringToFront();
          await frontend.waitForSelector('pierce/.settings');

          await target.bringToFront();
          const element = await target.waitForSelector(
              'a[href="recorder2.html"]',
          );
          await element?.click();

          await stopRecording();

          await expandStep(frontend, 2);
          await pickSelectorsForQuery('#test-button', frontend, target);

          let recording = await getCurrentRecording();
          assert.deepEqual(processAndVerifyBaseRecording(recording), {
            steps: [{
              type: 'click',
              assertedEvents: [{
                type: 'navigation',
                url: 'https://localhost:<test-port>/test/e2e/resources/recorder/recorder2.html',
                title: ''
              }],
              target: 'main',
              selectors: [
                'aria/Test button',
                '#test-button',
                'xpath///*[@id="test-button"]',
                'pierce/#test-button',
                'text/Test button',
              ]
            }]
          });

          await pickSelectorsForQuery(
              'a[href="recorder.html"]',
              frontend,
              target,
          );

          recording = await getCurrentRecording();
          assert.deepEqual(processAndVerifyBaseRecording(recording), {
            steps: [{
              type: 'click',
              assertedEvents: [{
                type: 'navigation',
                url: 'https://localhost:<test-port>/test/e2e/resources/recorder/recorder2.html',
                title: ''
              }],
              target: 'main',
              selectors: [
                'aria/Back to Page 1',
                'a',
                'xpath//html/body/a',
                'pierce/a',
                'text/Back to Page',
              ]
            }]
          });
        });

        // Flaky test
        it.skip('[crbug.com/402695414] should select through the selector picker during recording', async () => {
          const {target, frontend} = getBrowserAndPages();
          await frontend.bringToFront();
          await frontend.waitForSelector('pierce/.settings');

          await target.bringToFront();
          const element = await target.waitForSelector(
              'a[href="recorder2.html"]',
          );
          await element?.click();

          await expandStep(frontend, 2);
          await pickSelectorsForQuery('#test-button', frontend, target);

          await stopRecording();

          const recording = await getCurrentRecording();
          assert.deepEqual(
              processAndVerifyBaseRecording(recording),
              {
                steps: [{
                  type: 'click',
                  assertedEvents: [{
                    type: 'navigation',
                    url: 'https://localhost:<test-port>/test/e2e/resources/recorder/recorder2.html',
                    title: ''
                  }],
                  target: 'main',
                  selectors: [
                    'aria/Test button',
                    '#test-button',
                    'xpath///*[@id="test-button"]',
                    'pierce/#test-button',
                    'text/Test button',
                  ]
                }]
              },
          );
        });
      });
    });

    describe('Settings', () => {
      it('should change network settings', async () => {
        const {target, frontend} = getBrowserAndPages();
        await frontend.bringToFront();
        await frontend.waitForSelector('pierce/.settings');

        await target.bringToFront();
        await target.click('#test');

        await frontend.bringToFront();
        await stopRecording();

        await click('aria/Edit replay settings');
        await waitForAnimationFrame();

        const selectMenu = await waitFor(
            '.editable-setting select',
        );

        void selectOption(await selectMenu.toElement('select'), '3G');

        const recording = await getCurrentRecording();

        assert.deepEqual(processAndVerifyBaseRecording(recording, {expectCommon: false}), {
          title: 'New Recording',
          steps: [
            {
              type: 'emulateNetworkConditions',
              download: 50000,
              upload: 50000,
              latency: 2000,
            },
            {
              type: 'setViewport',
              width: 1280,
              height: 720,
              deviceScaleFactor: 1,
              isMobile: false,
              hasTouch: false,
              isLandscape: false
            },
            {
              type: 'navigate',
              url: 'https://localhost:<test-port>/test/e2e/resources/recorder/recorder.html',
              assertedEvents: [{
                type: 'navigation',
                url: 'https://localhost:<test-port>/test/e2e/resources/recorder/recorder.html',
                title: ''
              }]
            },
            {
              type: 'click',
              target: 'main',
              selectors: [
                ['aria/Test Button'],
                ['#test'],
                ['xpath///*[@id="test"]'],
                ['pierce/#test'],
                ['text/Test Button'],
              ]
            }
          ]
        });
      });

      it('should change the user flow timeout', async () => {
        await record();
        await stopRecording();
        await assertStepList([
          'Set viewport',
          'Navigate' as StepType.Navigate,
          'Click' as StepType.Click,
        ]);

        const button = await waitForAria('Edit replay settings');
        await button.click();
        const input = await waitForAria('Timeout');
        // Clear the default value.
        await input.evaluate((el: Element) => {
          (el as HTMLInputElement).value = '';
        });
        await input.type('2000');
        await button.click();

        const recording = await getCurrentRecording();
        if (typeof recording !== 'object' || recording === null) {
          throw new Error('Recording is corrupted');
        }
        assert.strictEqual((recording as {timeout: number}).timeout, 2000);
      });
    });

    describe('Shortcuts', () => {
      it('should toggle code view with shortcut', async () => {
        async function getSplitWidgetVisibility() {
          const splitView = await waitFor('devtools-split-view');
          return await splitView.evaluate(el => {
            return el.getAttribute('sidebar-visibility');
          });
        }
        assert.strictEqual(await getSplitWidgetVisibility(), 'hidden');

        await toggleCodeView();

        assert.notStrictEqual(await getSplitWidgetVisibility(), 'hidden');

        await toggleCodeView();
        assert.strictEqual(await getSplitWidgetVisibility(), 'hidden');
      });
    });
  });

  describe('Header', () => {
    beforeEach(async () => {
      await enableAndOpenRecorderPanel('recorder/recorder.html');
    });

    describe('Shortcut Dialog', () => {
      it('should open the shortcut dialog', async () => {
        const {frontend} = getBrowserAndPages();
        await frontend.bringToFront();
        const shortcutDialog = await waitFor('devtools-shortcut-dialog');
        const buttonDialog = await waitFor('devtools-button-dialog', shortcutDialog);

        await click('devtools-button', {root: buttonDialog});

        const dialog = await waitFor('devtools-dialog', buttonDialog);
        assert.isOk(dialog);

        const shortcuts = await $$('.keybinds-list-item', buttonDialog);
        assert.lengthOf(shortcuts, 4);
      });
    });
  });

  describe('Recording list', () => {
    beforeEach(async () => {
      await enableAndOpenRecorderPanel('recorder/recorder.html');
      await createAndStartRecording();
    });

    it('can delete a recording from the list', async () => {
      const {frontend} = getBrowserAndPages();
      await frontend.bringToFront();
      await stopRecording();

      await frontend.select('pierce/select', 'AllRecordingsPage');
      await click('pierce/.delete-recording-button');

      await frontend.waitForSelector('pierce/.empty-state');
    });
  });
});
