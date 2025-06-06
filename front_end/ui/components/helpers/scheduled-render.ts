// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as RenderCoordinator from '../render_coordinator/render_coordinator.js';

export type RenderCallback = () => (void|Promise<void>);

const requests = new Map<HTMLElement, {callback: RenderCallback, promise: Promise<void>}>();
const active = new Set<HTMLElement>();

export function scheduleRender(component: HTMLElement, callback: RenderCallback): Promise<void> {
  const request = requests.get(component);
  if (request !== undefined) {
    if (request.callback !== callback) {
      throw new TypeError(
          `Incompatible callback arguments for scheduling rendering of ${component.nodeName.toLowerCase()}`);
    }
    return request.promise;
  }

  const promise = RenderCoordinator.write(async () => {
    try {
      active.add(component);
      requests.delete(component);
      await callback.call(component);
    } catch (error) {
      console.error(`ScheduledRender: rendering ${component.nodeName.toLowerCase()}:`);
      console.error(error);
      throw error;
    } finally {
      active.delete(component);
    }
  });

  requests.set(component, {callback, promise});
  return promise;
}

export function isScheduledRender(component: HTMLElement): boolean {
  return active.has(component);
}
